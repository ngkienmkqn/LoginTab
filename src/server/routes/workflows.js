/**
 * Workflows Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get all workflows (RBAC scoped)
router.get('/', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        const role = callers[0]?.role;

        let query = 'SELECT id, name, platform, created_at, created_by FROM workflows';
        let params = [];

        if (role === 'super_admin') {
            query += ' ORDER BY created_at DESC';
        } else {
            query += ' WHERE created_by = ? ORDER BY created_at DESC';
            params = [callerId];
        }

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Get single workflow
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            let graphData = rows[0].graph_data;
            if (typeof graphData === 'string') {
                graphData = JSON.parse(graphData);
            }
            res.json({ success: true, workflow: { ...rows[0], graph_data: graphData } });
        } else {
            res.json({ success: false, error: 'Not found' });
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Create/Update workflow
router.post('/', requireAuth, async (req, res) => {
    const workflow = req.body;
    try {
        const pool = await getPool();
        const id = workflow.id || uuidv4();
        const jsonData = JSON.stringify(workflow.graph_data);
        await pool.query(
            `INSERT INTO workflows (id, name, platform, graph_data, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), platform = VALUES(platform), graph_data = VALUES(graph_data), is_active = VALUES(is_active)`,
            [id, workflow.name, workflow.platform || 'all', jsonData, workflow.createdBy || 'system', true]
        );
        res.json({ success: true, id });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Delete workflow
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM workflows WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
