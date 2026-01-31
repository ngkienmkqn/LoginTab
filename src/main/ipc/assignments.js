/**
 * Account Assignments IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { getPool } = require('../../database/mysql');
const { auditLog } = require('../auth/audit');

/**
 * Register all assignment IPC handlers
 */
function registerAssignmentHandlers() {

    // Get assignments for a user
    ipcMain.handle('get-assignments', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        const pool = await getPool();

        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return [];
        const role = callers[0].role;

        if (role === 'staff' && userId !== callerId) {
            return [];
        }
        if (role === 'admin' && userId !== callerId) {
            const [target] = await pool.query('SELECT managed_by_admin_id FROM users WHERE id = ?', [userId]);
            if (!target[0] || target[0].managed_by_admin_id !== callerId) {
                return [];
            }
        }

        const [rows] = await pool.query('SELECT account_id FROM account_assignments WHERE user_id = ?', [userId]);
        return rows.map(r => r.account_id);
    });

    // Update assignments for a user
    ipcMain.handle('update-assignments', async (event, { userId, accountIds }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        const pool = await getPool();

        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return { success: false, error: 'User not found' };
        const role = callers[0].role;

        if (role === 'staff') {
            return { success: false, error: 'Access denied' };
        }
        if (role === 'admin' && userId !== callerId) {
            const [target] = await pool.query('SELECT managed_by_admin_id FROM users WHERE id = ?', [userId]);
            if (!target[0] || target[0].managed_by_admin_id !== callerId) {
                return { success: false, error: 'Access denied: Out of scope' };
            }
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM account_assignments WHERE user_id = ?', [userId]);
            for (const accId of accountIds) {
                await connection.query('INSERT INTO account_assignments (user_id, account_id) VALUES (?, ?)', [userId, accId]);
            }
            await connection.commit();
            await auditLog('update_assignments', callerId, { userId, count: accountIds.length });
            return { success: true };
        } catch (err) {
            await connection.rollback();
            return { success: false, error: err.message };
        } finally {
            connection.release();
        }
    });

    // Bulk assign
    ipcMain.handle('bulk-assign', async (event, { accountIds, userIds }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        const pool = await getPool();

        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return { success: false, error: 'User not found' };
        const role = callers[0].role;

        if (role === 'staff') {
            return { success: false, error: 'Access denied' };
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const accId of accountIds) {
                for (const uId of userIds) {
                    await connection.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [uId, accId]);
                }
            }
            await connection.commit();
            await auditLog('bulk_assign', callerId, { accountIds, userIds });
            return { success: true };
        } catch (err) {
            await connection.rollback();
            return { success: false, error: err.message };
        } finally {
            connection.release();
        }
    });

    // Bulk revoke
    ipcMain.handle('bulk-revoke', async (event, { accountIds, userIds }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        const pool = await getPool();

        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return { success: false, error: 'User not found' };
        const role = callers[0].role;

        if (role === 'staff') {
            return { success: false, error: 'Access denied' };
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const accId of accountIds) {
                for (const uId of userIds) {
                    await connection.query('DELETE FROM account_assignments WHERE user_id = ? AND account_id = ?', [uId, accId]);
                }
            }
            await connection.commit();
            await auditLog('bulk_revoke', callerId, { accountIds, userIds });
            return { success: true };
        } catch (err) {
            await connection.rollback();
            return { success: false, error: err.message };
        } finally {
            connection.release();
        }
    });

    // Get available accounts for assignment
    ipcMain.handle('get-available-accounts', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const caller = callers[0];

            if (caller.role === 'admin') {
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied: Cannot manage this user');
                }
            } else if (caller.role !== 'super_admin') {
                throw new Error('Access denied: Insufficient permissions');
            }

            let query, params;
            if (caller.role === 'super_admin') {
                query = `
                    SELECT a.*, p.name as platform_name
                    FROM accounts a
                    LEFT JOIN platforms p ON a.platform_id = p.id
                    WHERE a.id NOT IN (
                        SELECT account_id FROM account_assignments WHERE user_id = ?
                    )
                    ORDER BY p.name, a.id
                `;
                params = [userId];
            } else {
                query = `
                    SELECT DISTINCT a.*, p.name as platform_name
                    FROM accounts a
                    LEFT JOIN platforms p ON a.platform_id = p.id
                    LEFT JOIN account_assignments aa ON a.id = aa.account_id
                    WHERE aa.user_id IN (
                        SELECT id FROM users WHERE managed_by_admin_id = ? OR id = ?
                    )
                    AND a.id NOT IN (
                        SELECT account_id FROM account_assignments WHERE user_id = ?
                    )
                    ORDER BY p.name, a.id
                `;
                params = [callerId, callerId, userId];
            }

            const [accounts] = await pool.query(query, params);

            return accounts.map(acc => ({
                id: acc.id,
                platform_name: acc.platform_name,
                profile_name: (() => {
                    try {
                        const auth = typeof acc.auth_config === 'string' ? JSON.parse(acc.auth_config) : acc.auth_config;
                        return auth?.email || auth?.username || `Account #${acc.id.substring(0, 8)}`;
                    } catch {
                        return `Account #${acc.id.substring(0, 8)}`;
                    }
                })()
            }));
        } catch (error) {
            console.error('[get-available-accounts] Error:', error);
            throw error;
        }
    });

    // Assign accounts to user
    ipcMain.handle('assign-accounts', async (event, { userId, accountIds }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const caller = callers[0];

            if (caller.role === 'admin') {
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied: Cannot manage this user');
                }
            } else if (caller.role !== 'super_admin') {
                throw new Error('Access denied: Insufficient permissions');
            }

            const values = accountIds.map(accountId => [accountId, userId]);
            await pool.query(
                'INSERT IGNORE INTO account_assignments (account_id, user_id) VALUES ?',
                [values]
            );

            await auditLog('assign_accounts', callerId, { userId, accountIds, count: accountIds.length });

            return { success: true };
        } catch (error) {
            console.error('[assign-accounts] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Unassign single account
    ipcMain.handle('unassign-account', async (event, { accountId, userId }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const caller = callers[0];

            if (caller.role === 'admin') {
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied: Cannot manage this user');
                }
            } else if (caller.role !== 'super_admin') {
                throw new Error('Access denied: Insufficient permissions');
            }

            await pool.query(
                'DELETE FROM account_assignments WHERE account_id = ? AND user_id = ?',
                [accountId, userId]
            );

            await auditLog('unassign_account', callerId, { userId, accountId });

            console.log('[unassign-account] Successfully unassigned account', accountId, 'from user', userId);
            return { success: true };
        } catch (error) {
            console.error('[unassign-account] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerAssignmentHandlers };
