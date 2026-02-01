/**
 * Users Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');
const { checkPermission, authorize, auditLog } = require('../middleware/rbac');

const router = express.Router();

// Get all users (RBAC scoped)
router.get('/', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];
        const hasPermission = await checkPermission(callerId, 'users.view');
        if (!hasPermission) throw new Error('Unauthorized');
        if (caller.role === 'staff') throw new Error('Access denied');

        let query, params;
        if (caller.role === 'super_admin') {
            query = `SELECT u.id, u.username, u.role, u.managed_by_admin_id, COUNT(DISTINCT aa.account_id) as assigned_accounts_count FROM users u LEFT JOIN account_assignments aa ON u.id = aa.user_id GROUP BY u.id, u.username, u.role, u.managed_by_admin_id`;
            params = [];
        } else {
            query = `SELECT u.id, u.username, u.role, u.managed_by_admin_id, COUNT(DISTINCT aa.account_id) as assigned_accounts_count FROM users u LEFT JOIN account_assignments aa ON u.id = aa.user_id WHERE u.managed_by_admin_id = ? OR u.id = ? GROUP BY u.id, u.username, u.role, u.managed_by_admin_id`;
            params = [callerId, callerId];
        }
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create user
router.post('/', requireAuth, async (req, res) => {
    const { username, password, role } = req.body;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.create', null);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        const caller = callers[0];
        const id = uuidv4();
        const managedBy = (caller.role === 'admin' && role === 'staff') ? callerId : null;
        await pool.query('INSERT INTO users (id, username, password, role, managed_by_admin_id) VALUES (?, ?, ?, ?, ?)',
            [id, username, password, role, managedBy]);
        await auditLog('create_user', callerId, { newUserId: id, username, role });
        res.json({ success: true, user: { id, username, role } });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Update user
router.put('/:id', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const { username, password, role } = req.body;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.edit', userId);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        await pool.query('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?',
            [username, password, role, userId]);
        await auditLog('update_user', callerId, { targetUserId: userId, username });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete user
router.delete('/:id', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.delete', userId);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        const [targets] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        await auditLog('delete_user', callerId, { targetUserId: userId, username: targets[0]?.username });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get user's assigned accounts
router.get('/:id/assigned-accounts', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query(`
            SELECT a.id, a.name as profile_name, p.name as platform_name 
            FROM accounts a 
            JOIN account_assignments aa ON a.id = aa.account_id 
            LEFT JOIN platforms p ON a.platform_id = p.id 
            WHERE aa.user_id = ?
        `, [req.params.id]);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Get available accounts for assignment
router.get('/:id/available-accounts', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query(`
            SELECT a.id, a.name as profile_name, p.name as platform_name 
            FROM accounts a 
            LEFT JOIN platforms p ON a.platform_id = p.id 
            WHERE a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
        `, [req.params.id]);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Transfer user ownership
router.post('/:id/transfer', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const { newAdminId } = req.body;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers[0]?.role !== 'super_admin') throw new Error('Only Super Admin can transfer');
        await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', [newAdminId || null, userId]);
        await auditLog('transfer_user', callerId, { targetUserId: userId, newAdminId });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
