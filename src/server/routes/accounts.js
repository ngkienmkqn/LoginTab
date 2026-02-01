/**
 * Accounts Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');
const { checkPermission, auditLog } = require('../middleware/rbac');
const FingerprintGenerator = require('../../utils/FingerprintGenerator');
const BrowserManager = require('../../managers/BrowserManager');

const router = express.Router();
const SESSIONS_DIR = path.join(os.homedir(), '.login-tab', 'sessions');

// Get all accounts (RBAC scoped)
router.get('/', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];

        let query, params;
        if (caller.role === 'super_admin') {
            query = `SELECT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a`;
            params = [];
        } else if (caller.role === 'admin') {
            query = `SELECT DISTINCT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a LEFT JOIN account_assignments aa ON a.id = aa.account_id WHERE aa.user_id IN (SELECT id FROM users WHERE managed_by_admin_id = ? OR id = ?)`;
            params = [callerId, callerId];
        } else {
            query = `SELECT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a JOIN account_assignments aa ON a.id = aa.account_id WHERE aa.user_id = ?`;
            params = [callerId];
        }

        const [accounts] = await pool.query(query, params);
        res.json(accounts.map(row => ({
            ...row,
            assignedUsers: row.assignedUsers || 'None',
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config
        })));
    } catch (error) {
        console.error('[get-accounts] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create account
router.post('/', requireAuth, async (req, res) => {
    const { name, loginUrl, proxy, fingerprint, auth, extensionsPath, notes, platformId, workflowId } = req.body;
    try {
        const pool = await getPool();
        const id = uuidv4();
        const newAccount = {
            id, name,
            loginUrl: loginUrl || '',
            extensions_path: extensionsPath || '',
            proxy_config: JSON.stringify(proxy || {}),
            fingerprint_config: JSON.stringify(FingerprintGenerator.generateFingerprint(id)),
            auth_config: JSON.stringify(auth || {}),
            notes: notes || '',
            platform_id: platformId || null,
            workflow_id: workflowId || null
        };

        await pool.query(
            'INSERT INTO accounts (id, name, loginUrl, proxy_config, auth_config, fingerprint_config, extensions_path, lastActive, notes, platform_id, workflow_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, newAccount.name, newAccount.loginUrl, newAccount.proxy_config, newAccount.auth_config, newAccount.fingerprint_config, newAccount.extensions_path, null, newAccount.notes, newAccount.platform_id, newAccount.workflow_id]
        );

        // Auto-assign to creator
        if (global.currentAuthUser?.id) {
            await pool.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [global.currentAuthUser.id, id]);
        }

        res.json({ success: true, account: { ...newAccount, proxy, fingerprint, auth } });
    } catch (error) {
        console.error('[create-account] Failed:', error);
        res.json({ success: false, error: error.message });
    }
});

// Update account
router.put('/:id', requireAuth, async (req, res) => {
    const updatedData = req.body;
    updatedData.id = req.params.id;
    try {
        const pool = await getPool();
        await pool.query(
            'UPDATE accounts SET name = ?, loginUrl = ?, proxy_config = ?, auth_config = ?, fingerprint_config = ?, extensions_path = ?, notes = ?, platform_id = ?, workflow_id = ? WHERE id = ?',
            [updatedData.name, updatedData.loginUrl || '', JSON.stringify(updatedData.proxy || {}), JSON.stringify(updatedData.auth || {}), JSON.stringify(updatedData.fingerprint || {}), updatedData.extensionsPath || '', updatedData.notes || '', updatedData.platformId || null, updatedData.workflowId || null, updatedData.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete account
router.delete('/:id', requireAuth, async (req, res) => {
    const accountId = req.params.id;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const hasPermission = await checkPermission(callerId, 'accounts.delete');
        if (!hasPermission) throw new Error('Unauthorized');

        await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);
        await pool.query('DELETE FROM session_backups WHERE account_id = ?', [accountId]);

        const sessionPath = path.join(SESSIONS_DIR, accountId);
        await fs.remove(sessionPath);

        await auditLog('delete_account', callerId, { targetAccountId: accountId });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Update notes
router.put('/:id/notes', requireAuth, async (req, res) => {
    const { notes } = req.body;
    try {
        const pool = await getPool();
        await pool.query('UPDATE accounts SET notes = ? WHERE id = ?', [notes, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
