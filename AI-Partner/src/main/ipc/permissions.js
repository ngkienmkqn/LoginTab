/**
 * Permissions IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { authorize, checkPermission } = require('../auth/rbac');
const { auditLog } = require('../auth/audit');

/**
 * Register all permission management IPC handlers
 */
function registerPermissionHandlers() {

    // Get user permissions
    ipcMain.handle('get-user-permissions', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const authorized = await authorize(callerId, 'users.view', userId);
            if (!authorized) throw new Error('Access denied: Cannot view this user');

            const pool = await getPool();
            const [rows] = await pool.query(
                'SELECT permission_key, enabled FROM user_permissions WHERE user_id = ?',
                [userId]
            );
            return rows;
        } catch (error) {
            console.error('[get-user-permissions] Error:', error);
            return [];
        }
    });

    // Update user permissions (with transaction)
    ipcMain.handle('update-user-permissions', async (event, userId, permissions) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const authorized = await authorize(callerId, 'users.edit', userId);
            if (!authorized) throw new Error('Access denied: Cannot edit this user');

            const pool = await getPool();
            const connection = await pool.getConnection();

            try {
                await connection.beginTransaction();

                await connection.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

                for (const perm of permissions) {
                    await connection.execute(
                        'INSERT INTO user_permissions (id, user_id, permission_key, enabled) VALUES (?, ?, ?, ?)',
                        [uuidv4(), userId, perm.permission_key, perm.enabled]
                    );
                }

                await connection.commit();

                await auditLog('update_permissions', callerId, {
                    targetUserId: userId,
                    permissions_changed: permissions.map(p => p.permission_key)
                });

                return { success: true };
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[update-user-permissions] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Clear user permissions (reset to role defaults)
    ipcMain.handle('clear-user-permissions', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const authorized = await authorize(callerId, 'users.edit', userId);
            if (!authorized) throw new Error('Access denied');

            const pool = await getPool();
            await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

            await auditLog('clear_permissions', callerId, { targetUserId: userId });

            return { success: true };
        } catch (error) {
            console.error('[clear-user-permissions] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Check permission (UI only - does NOT check scope)
    ipcMain.handle('check-permission', async (event, permissionKey) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            return await checkPermission(callerId, permissionKey);
        } catch (error) {
            console.error('[check-permission] Error:', error);
            return false;
        }
    });
}

module.exports = { registerPermissionHandlers };
