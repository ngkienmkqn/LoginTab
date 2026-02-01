/**
 * Platforms Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get all platforms
router.get('/', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM platforms');
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

// Create platform
router.post('/', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('INSERT INTO platforms (id, name, url) VALUES (?, ?, ?)',
            [uuidv4(), req.body.name, req.body.url]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Update platform
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('UPDATE platforms SET name = ?, url = ? WHERE id = ?',
            [req.body.name, req.body.url, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete platform
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM platforms WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
