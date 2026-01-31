/**
 * RBAC Helpers for Express Server
 * Reuses the same logic as Electron main process
 */

const { getPool } = require('../../database/mysql');

/**
 * Check if caller has scope access to target user
 */
async function checkScope(caller, target) {
    if (caller.role === 'super_admin') return true;
    if (caller.role === 'admin') {
        if (target.id === caller.id) return true;
        return target.managed_by_admin_id === caller.id;
    }
    return false;
}

/**
 * Check if user has specific permission (override > role default)
 */
async function checkPermission(userId, permissionKey) {
    try {
        const pool = await getPool();
        const [overrides] = await pool.query(
            'SELECT enabled FROM user_permissions WHERE user_id = ? AND permission_key = ?',
            [userId, permissionKey]
        );
        if (overrides.length > 0) {
            return overrides[0].enabled === 1;
        }
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return false;
        const role = users[0].role;
        const roleDefaults = {
            super_admin: ['users.view', 'users.edit', 'users.delete', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.delete', 'accounts.create'],
            admin: ['users.view', 'users.edit', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.create'],
            staff: ['accounts.view']
        };
        return (roleDefaults[role] || []).includes(permissionKey);
    } catch (error) {
        console.error('[Permission] Check failed:', error);
        return false;
    }
}

/**
 * Combined authorization check (scope + permission)
 */
async function authorize(callerId, action, targetId) {
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return false;
        const caller = callers[0];
        if (targetId) {
            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
            if (targets.length === 0) return false;
            const target = targets[0];
            const hasScope = await checkScope(caller, target);
            if (!hasScope) return false;
        }
        return await checkPermission(callerId, action);
    } catch (error) {
        console.error('[Auth] Error:', error);
        return false;
    }
}

/**
 * Audit logging
 */
async function auditLog(action, userId, details) {
    try {
        const pool = await getPool();
        await pool.execute(
            `INSERT INTO audit_log (action, user_id, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())`,
            [action, userId, details.targetUserId || null, JSON.stringify(details)]
        );
        console.log(`[AUDIT] ${action} by ${userId}:`, details);
    } catch (error) {
        console.error('[AUDIT] Failed to log:', error);
    }
}

module.exports = {
    checkScope,
    checkPermission,
    authorize,
    auditLog
};
