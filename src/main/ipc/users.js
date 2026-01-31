/**
 * Users IPC Handlers (RBAC Protected)
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { authorize, checkPermission, checkScope } = require('../auth/rbac');
const { auditLog } = require('../auth/audit');

/**
 * Register all user management IPC handlers
 */
function registerUserHandlers() {

    // Get Users (Scoped by Role)
    ipcMain.handle('get-users', async () => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const caller = callers[0];

            // STEP 1: PERMISSION CHECK
            const hasPermission = await checkPermission(callerId, 'users.view');
            if (!hasPermission) {
                throw new Error('Unauthorized: Missing users.view permission');
            }

            // STAFF DENIAL
            if (caller.role === 'staff') {
                throw new Error('Access denied: Staff users cannot view user list');
            }

            // STEP 2: SCOPE GATE
            let query, params;
            if (caller.role === 'super_admin') {
                query = `
                    SELECT 
                        u.id, 
                        u.username, 
                        u.role, 
                        u.managed_by_admin_id,
                        COUNT(DISTINCT aa.account_id) as assigned_accounts_count
                    FROM users u
                    LEFT JOIN account_assignments aa ON u.id = aa.user_id
                    GROUP BY u.id, u.username, u.role, u.managed_by_admin_id
                `;
                params = [];
            } else if (caller.role === 'admin') {
                query = `
                    SELECT 
                        u.id, 
                        u.username, 
                        u.role, 
                        u.managed_by_admin_id,
                        COUNT(DISTINCT aa.account_id) as assigned_accounts_count
                    FROM users u
                    LEFT JOIN account_assignments aa ON u.id = aa.user_id
                    WHERE u.managed_by_admin_id = ? OR u.id = ?
                    GROUP BY u.id, u.username, u.role, u.managed_by_admin_id
                `;
                params = [callerId, callerId];
            } else {
                return [];
            }

            const [rows] = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('[get-users] Error:', error);
            throw error;
        }
    });

    // Get User's Assigned Accounts
    ipcMain.handle('get-user-assigned-accounts', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        console.log('[get-user-assigned-accounts] Called with userId:', userId, 'by caller:', callerId);
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');

            const caller = callers[0];

            // AUTHORIZATION
            if (caller.role !== 'super_admin') {
                if (caller.role === 'admin') {
                    const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                    if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                        throw new Error('Access denied');
                    }
                } else if (userId !== callerId) {
                    throw new Error('Access denied');
                }
            }

            const [accounts] = await pool.query(`
                SELECT 
                    a.id,
                    a.name AS profile_name,
                    a.loginUrl,
                    p.name AS platform_name
                FROM accounts a
                JOIN account_assignments aa ON a.id = aa.account_id
                LEFT JOIN platforms p ON a.platform_id = p.id
                WHERE aa.user_id = ?
                ORDER BY a.name
            `, [userId]);
            console.log('[get-user-assigned-accounts] Found', accounts.length, 'accounts for user', userId);
            return accounts;
        } catch (error) {
            console.error('[get-user-assigned-accounts] Error:', error);
            throw error;
        }
    });

    // Save User (create or update)
    ipcMain.handle('save-user', async (event, userData) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('Caller not found');
            const caller = callers[0];

            // Authorization
            if (caller.role === 'staff') {
                throw new Error('Access denied: Staff users cannot manage other users');
            }

            // CREATE NEW USER
            if (!userData.id) {
                if (caller.role === 'admin' && userData.role !== 'staff') {
                    throw new Error('Admin can only create Staff users');
                }

                if (!userData.username || !userData.password) {
                    throw new Error('Username and password required for new user');
                }

                const newId = uuidv4();
                let managed_by_admin_id = userData.managed_by_admin_id || null;
                if (caller.role === 'admin' && userData.role === 'staff') {
                    managed_by_admin_id = callerId;
                }

                await pool.query(
                    'INSERT INTO users (id, username, password, role, managed_by_admin_id) VALUES (?, ?, ?, ?, ?)',
                    [newId, userData.username, userData.password, userData.role, managed_by_admin_id]
                );

                await auditLog('create_user', callerId, {
                    targetUserId: newId,
                    role: userData.role,
                    managed_by: managed_by_admin_id
                });

                return { success: true };
            }
            // UPDATE EXISTING USER
            else {
                const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [userData.id]);
                if (targets.length === 0) throw new Error('User not found');
                const target = targets[0];

                if (caller.role === 'admin') {
                    if (target.role !== 'staff' || target.managed_by_admin_id !== callerId) {
                        throw new Error('Admin can only edit their own managed Staff');
                    }
                }

                if ('role' in userData && caller.role !== 'super_admin') {
                    throw new Error('Only Super Admin can change user roles');
                }

                let fieldsToUpdate = [];
                let values = [];

                if (userData.username) {
                    fieldsToUpdate.push('username = ?');
                    values.push(userData.username);
                }

                if (userData.password) {
                    fieldsToUpdate.push('password = ?');
                    values.push(userData.password);
                }

                if (userData.role) {
                    fieldsToUpdate.push('role = ?');
                    values.push(userData.role);
                }

                if (caller.role === 'super_admin' && 'managed_by_admin_id' in userData) {
                    fieldsToUpdate.push('managed_by_admin_id = ?');
                    values.push(userData.managed_by_admin_id || null);
                }

                if (fieldsToUpdate.length === 0) {
                    return { success: true };
                }

                values.push(userData.id);

                await pool.query(
                    `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
                    values
                );

                await auditLog('edit_user', callerId, {
                    targetUserId: userData.id,
                    fields_updated: Object.keys(userData)
                });

                return { success: true };
            }
        } catch (error) {
            console.error('[save-user] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Delete User
    ipcMain.handle('delete-user', async (event, userId) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();

            const authorized = await authorize(callerId, 'users.delete', userId);
            if (!authorized) {
                throw new Error('Unauthorized: Cannot delete this user');
            }

            const [targets] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
            const targetUsername = targets[0]?.username || 'unknown';

            await pool.query('DELETE FROM users WHERE id = ?', [userId]);

            await auditLog('delete_user', callerId, {
                targetUserId: userId,
                username: targetUsername
            });

            return { success: true };
        } catch (error) {
            console.error('[delete-user] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Transfer User Ownership (Super Admin only)
    ipcMain.handle('transfer-user-ownership', async (event, payload) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0 || callers[0].role !== 'super_admin') {
                throw new Error('Only Super Admin can transfer ownership');
            }

            const { userId, newAdminId } = payload;

            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            if (targets.length === 0) throw new Error('Target user not found');
            if (targets[0].role !== 'staff') {
                throw new Error('Only Staff users can be transferred');
            }

            if (newAdminId) {
                const [admins] = await pool.query('SELECT * FROM users WHERE id = ?', [newAdminId]);
                if (admins.length === 0 || admins[0].role !== 'admin') {
                    throw new Error('Target must be an Admin');
                }
            }

            await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', [newAdminId || null, userId]);

            await auditLog('transfer_ownership', callerId, {
                targetUserId: userId,
                from_admin: targets[0].managed_by_admin_id,
                to_admin: newAdminId || 'unassigned'
            });

            return { success: true };
        } catch (error) {
            console.error('[transfer-user-ownership] Error:', error);
            return { success: false, error: error.message };
        }
    });

    // Get Eligible Users for Assignment
    ipcMain.handle('get-eligible-users', async (event, role) => {
        const pool = await getPool();
        let query = '';
        if (role === 'super_admin') {
            query = "SELECT id, username, role FROM users WHERE role IN ('admin', 'staff')";
        } else if (role === 'admin') {
            query = "SELECT id, username, role FROM users WHERE role = 'staff'";
        } else {
            return [];
        }
        const [rows] = await pool.query(query);
        return rows;
    });
}

module.exports = { registerUserHandlers };
