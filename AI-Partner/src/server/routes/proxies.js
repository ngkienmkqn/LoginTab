/**
 * Proxies Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');
const ProxyChecker = require('../../managers/ProxyChecker');

const router = express.Router();

// Get all proxies
router.get('/', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM proxies');
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

// Create/Update proxy
router.post('/', requireAuth, async (req, res) => {
    const proxy = req.body;
    try {
        const pool = await getPool();
        if (proxy.id) {
            await pool.query('UPDATE proxies SET type = ?, host = ?, port = ?, user = ?, pass = ? WHERE id = ?',
                [proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass, proxy.id]);
        } else {
            await pool.query('INSERT INTO proxies (id, type, host, port, user, pass) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass]);
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete proxy
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM proxies WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Check proxy health
router.post('/check', requireAuth, async (req, res) => {
    try {
        const healthScore = await ProxyChecker.checkProxyHealth(req.body);
        res.json({
            success: true,
            score: healthScore,
            label: ProxyChecker.getHealthLabel(healthScore),
            color: ProxyChecker.getHealthColor(healthScore)
        });
    } catch (error) {
        res.json({ success: false, score: 0 });
    }
});

module.exports = router;
