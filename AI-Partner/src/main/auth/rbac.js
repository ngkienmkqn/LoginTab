/**
 * RBAC v2 - Authorization Helpers
 * Extracted from main.js for modularity
 */

const { getPool } = require('../../database/mysql');

// Role permission defaults
const ROLE_DEFAULTS = {
    super_admin: [
        'users.view', 'users.edit', 'users.delete', 'users.create',
        'accounts.view', 'accounts.edit', 'accounts.delete', 'accounts.create',
        'workflows.view', 'workflows.edit', 'workflows.delete', 'workflows.create', 'workflows.execute'
    ],
    admin: [
        'users.view', 'users.edit', 'users.create',
        'accounts.view', 'accounts.edit', 'accounts.delete', 'accounts.create',
        'workflows.view', 'workflows.edit', 'workflows.create', 'workflows.execute'
    ],
    staff: ['accounts.view', 'workflows.view', 'workflows.execute']
};

/**
 * Check if caller has scope access to target user
 */
async function checkScope(caller, target) {
    if (caller.role === 'super_admin') return true;
    if (caller.role === 'admin') {
        // Admin can access: managed staff + self
        if (target.id === caller.id) return true;
        return target.managed_by_admin_id === caller.id;
    }
    return false; // Staff cannot manage users
}

/**
 * Check if user has specific permission (override > role default)
 */
async function checkPermission(userId, permissionKey) {
    try {
        const pool = await getPool();

        // Check for override first
        const [overrides] = await pool.query(
            'SELECT enabled FROM user_permissions WHERE user_id = ? AND permission_key = ?',
            [userId, permissionKey]
        );

        if (overrides.length > 0) {
            return overrides[0].enabled === 1;
        }

        // Fall back to role defaults
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return false;

        const role = users[0].role;
        return (ROLE_DEFAULTS[role] || []).includes(permissionKey);
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

        // Step 1: Scope Gate (if target is specified)
        if (targetId) {
            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
            if (targets.length === 0) return false;

            const target = targets[0];
            const hasScope = await checkScope(caller, target);
            if (!hasScope) {
                console.log('[Auth] Denied: Target out of scope');
                return false;
            }
        }

        // Step 2: Permission Check
        const hasPermission = await checkPermission(callerId, action);
        if (!hasPermission) {
            console.log('[Auth] Denied: Missing permission');
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Auth] Error:', error);
        return false;
    }
}

/**
 * Get caller info from database
 */
async function getCaller(callerId) {
    const pool = await getPool();
    const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
    return callers.length > 0 ? callers[0] : null;
}

module.exports = {
    checkScope,
    checkPermission,
    authorize,
    getCaller,
    ROLE_DEFAULTS
};
