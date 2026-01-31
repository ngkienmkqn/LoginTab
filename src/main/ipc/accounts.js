/**
 * Accounts IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain, app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');

const { getPool } = require('../../database/mysql');
const { authorize, checkPermission } = require('../auth/rbac');
const { auditLog } = require('../auth/audit');
const FingerprintGenerator = require('../../utils/FingerprintGenerator');

const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

/**
 * Register all accounts IPC handlers
 */
function registerAccountHandlers() {

    // Get all accounts (RBAC Protected)
    ipcMain.handle('get-accounts', async (event) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const user = callers[0];

            let query = `
                SELECT a.*, 
                (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
                 FROM account_assignments aa 
                 JOIN users u ON aa.user_id = u.id 
                 WHERE aa.account_id = a.id) as assignedUsers
                FROM accounts a
            `;
            let params = [];

            if (user.role === 'staff') {
                query = `
                    SELECT a.*, 
                    (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
                     FROM account_assignments aa 
                     JOIN users u ON aa.user_id = u.id 
                     WHERE aa.account_id = a.id) as assignedUsers
                    FROM accounts a
                    JOIN account_assignments aa ON a.id = aa.account_id
                    WHERE aa.user_id = ?
                `;
                params = [user.id];
            }

            const [rows] = await pool.query(query, params);
            return rows.map(row => ({
                ...row,
                assignedUsers: row.assignedUsers || 'None',
                proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
                fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
                auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
                createdAt: row.createdAt,
                lastActive: row.lastActive
            }));
        } catch (error) {
            console.error('Failed to get accounts:', error);
            return [];
        }
    });

    // Create new account
    ipcMain.handle('create-account', async (event, { name, loginUrl, proxy, fingerprint, auth, extensionsPath, notes, platformId, workflowId }) => {
        // Retry logic for network errors
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const pool = await getPool();
                const id = uuidv4();
                const newAccount = {
                    id,
                    name,
                    loginUrl: loginUrl || '',
                    extensions_path: extensionsPath || '',
                    proxy_config: JSON.stringify(proxy || {}),
                    fingerprint_config: JSON.stringify(FingerprintGenerator.generateFingerprint(id)),
                    auth_config: JSON.stringify(auth || {}),
                    lastActive: null,
                    notes: notes || '',
                    platform_id: platformId || null,
                    workflow_id: workflowId || null
                };

                await pool.query(
                    'INSERT INTO accounts (id, name, loginUrl, proxy_config, auth_config, fingerprint_config, extensions_path, lastActive, notes, platform_id, workflow_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [id, newAccount.name, newAccount.loginUrl, newAccount.proxy_config, newAccount.auth_config, newAccount.fingerprint_config, newAccount.extensions_path, newAccount.lastActive, newAccount.notes, newAccount.platform_id, newAccount.workflow_id, global.currentAuthUser?.id || null]
                );

                // Auto-assign to creator
                if (global.currentAuthUser && global.currentAuthUser.id) {
                    await pool.query(
                        'INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)',
                        [global.currentAuthUser.id, id]
                    );
                    console.log(`[create-account] Auto-assigned ${id} to creator ${global.currentAuthUser.username}`);
                }

                console.log(`[create-account] ✓ Profile created successfully: ${name}`);
                return { success: true, account: { ...newAccount, proxy, fingerprint, auth } };

            } catch (error) {
                lastError = error;

                // Retry on network errors
                if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') && attempt < maxRetries) {
                    console.log(`[create-account] Network error (attempt ${attempt}/${maxRetries}), retrying in 1s...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                console.error('[create-account] Failed:', error);
                return { success: false, error: error.message || 'Failed to create profile' };
            }
        }

        console.error('[create-account] All retries exhausted');
        return { success: false, error: lastError?.message || 'Failed to create profile after retries' };
    });

    // Update existing account
    ipcMain.handle('update-account', async (event, updatedData) => {
        try {
            const pool = await getPool();
            const updates = {
                name: updatedData.name,
                loginUrl: updatedData.loginUrl || '',
                proxy_config: JSON.stringify(updatedData.proxy || {}),
                auth_config: JSON.stringify(updatedData.auth || {}),
                fingerprint_config: JSON.stringify(updatedData.fingerprint || {}),
                extensions_path: updatedData.extensionsPath || '',
                notes: updatedData.notes || '',
                platform_id: updatedData.platformId || null,
                workflow_id: updatedData.workflowId || null
            };

            await pool.query(
                'UPDATE accounts SET name = ?, loginUrl = ?, proxy_config = ?, auth_config = ?, fingerprint_config = ?, extensions_path = ?, notes = ?, platform_id = ?, workflow_id = ? WHERE id = ?',
                [updates.name, updates.loginUrl, updates.proxy_config, updates.auth_config, updates.fingerprint_config, updates.extensions_path, updates.notes, updates.platform_id, updates.workflow_id, updatedData.id]
            );

            return { success: true };
        } catch (error) {
            console.error('Update failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Delete Account (RBAC Protected)
    ipcMain.handle('delete-account', async (event, accountId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();

            // STEP 1: SCOPE GATE - Check account ownership/assignment
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');
            const caller = callers[0];

            if (caller.role === 'staff') {
                // Staff can only delete accounts assigned to them
                const [assignments] = await pool.query(
                    'SELECT * FROM account_assignments WHERE account_id = ? AND user_id = ?',
                    [accountId, callerId]
                );
                if (assignments.length === 0) {
                    throw new Error('Access denied: Account not assigned to you');
                }
            } else if (caller.role === 'admin') {
                // Admin can delete accounts: assigned to managed staff, assigned to self, OR created by self
                const [accounts] = await pool.query(
                    `SELECT a.* FROM accounts a
                     LEFT JOIN account_assignments aa ON a.id = aa.account_id
                     LEFT JOIN users u ON aa.user_id = u.id
                     WHERE a.id = ? AND (u.managed_by_admin_id = ? OR aa.user_id = ? OR a.created_by_user_id = ?)`,
                    [accountId, callerId, callerId, callerId]
                );
                if (accounts.length === 0) {
                    throw new Error('Access denied: Account out of scope');
                }
            }

            // STEP 2: PERMISSION CHECK
            const hasPermission = await checkPermission(callerId, 'accounts.delete');
            if (!hasPermission) {
                throw new Error('Unauthorized: Missing accounts.delete permission');
            }

            // Delete account record
            await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);

            // Delete session backup from MySQL
            await pool.query('DELETE FROM session_backups WHERE account_id = ?', [accountId]);
            console.log(`[Delete] Removed session backup for account: ${accountId}`);

            // Remove local session folder
            const sessionPath = path.join(SESSIONS_DIR, accountId);
            await fs.remove(sessionPath);
            console.log(`[Delete] Removed local session folder: ${sessionPath}`);

            await auditLog('delete_account', callerId, {
                targetAccountId: accountId
            });

            return { success: true };
        } catch (error) {
            console.error('Delete failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Update account notes
    ipcMain.handle('update-account-notes', async (event, { id, notes }) => {
        try {
            const pool = await getPool();
            await pool.query('UPDATE accounts SET notes = ? WHERE id = ?', [notes, id]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get 2FA Codes
    ipcMain.handle('get-2fa-codes', async (event, items) => {
        const { authenticator } = require('otplib');
        return items.map(item => {
            try {
                return { id: item.id, token: authenticator.generate(item.secret) };
            } catch (e) {
                return { id: item.id, token: 'ERROR' };
            }
        });
    });

    // Generate Fingerprint Preview
    ipcMain.handle('preview-fingerprint', async (event, currentId, os) => {
        try {
            const id = currentId || 'PREVIEW_' + Date.now();
            const fp = FingerprintGenerator.generateFingerprint(id, os || 'win');
            return { success: true, fingerprint: fp };
        } catch (e) {
            console.error('Preview failed:', e);
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerAccountHandlers };
