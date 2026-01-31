/**
 * Browser Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { getPool } = require('../../database/mysql');
const { requireAuth } = require('../middleware/auth');
const BrowserManager = require('../../managers/BrowserManager');

const router = express.Router();

// Launch browser
router.post('/launch', requireAuth, async (req, res) => {
    const { id, mode } = req.body;
    try {
        const pool = await getPool();
        console.log(`[API] launch-browser called for: ${id} (Mode: ${mode})`);

        const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [id]);
        if (rows.length === 0) throw new Error('Account not found');

        const row = rows[0];
        const account = {
            ...row,
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
            extensionsPath: row.extensions_path,
            automation_mode: row.automation_mode || 'auto'
        };

        const browser = await BrowserManager.launchProfile(account, mode);

        browser.on('disconnected', async () => {
            const now = new Date();
            await pool.query('UPDATE accounts SET lastActive = ? WHERE id = ?', [now, id]);
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Launch failed:', error);
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
