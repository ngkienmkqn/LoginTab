/**
 * Assignments Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/rbac');

const router = express.Router();

// Get assignments for a user
router.get('/:userId', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT account_id FROM account_assignments WHERE user_id = ?', [req.params.userId]);
        res.json(rows.map(r => r.account_id));
    } catch (e) {
        res.json([]);
    }
});

// Update assignments for a user
router.put('/:userId', requireAuth, async (req, res) => {
    const { accountIds } = req.body;
    const userId = req.params.userId;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM account_assignments WHERE user_id = ?', [userId]);
            for (const accId of accountIds) {
                await connection.query('INSERT INTO account_assignments (user_id, account_id) VALUES (?, ?)', [userId, accId]);
            }
            await connection.commit();
            await auditLog('update_assignments', callerId, { userId, count: accountIds.length });
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Bulk assign
router.post('/bulk-assign', requireAuth, async (req, res) => {
    const { accountIds, userIds } = req.body;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
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
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Bulk revoke
router.post('/bulk-revoke', requireAuth, async (req, res) => {
    const { accountIds, userIds } = req.body;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
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
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Get eligible users for assignment
router.get('/eligible-users', requireAuth, async (req, res) => {
    const role = req.user.role;
    try {
        const pool = await getPool();
        let query = '';
        if (role === 'super_admin') {
            query = "SELECT id, username, role FROM users WHERE role IN ('admin', 'staff')";
        } else if (role === 'admin') {
            query = "SELECT id, username, role FROM users WHERE role = 'staff'";
        } else {
            return res.json([]);
        }
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

module.exports = router;
