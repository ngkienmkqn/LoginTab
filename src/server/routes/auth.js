/**
 * Authentication Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const pool = await getPool();

        // Check hardcoded admin (Bootstrap)
        if (username === 'admin' && password === 'Kien123!!') {
            const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"');
            let user;
            if (rows.length === 0) {
                const id = uuidv4();
                await pool.query('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
                    [id, 'admin', 'Kien123!!', 'super_admin']);
                user = { id, username: 'admin', role: 'super_admin' };
            } else {
                user = rows[0];
            }
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);
            return res.json({ success: true, user: global.currentAuthUser });
        }

        // Check DB users
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (rows.length > 0) {
            const user = rows[0];
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);
            return res.json({ success: true, user: global.currentAuthUser });
        }

        res.json({ success: false, error: 'Invalid credentials' });
    } catch (e) {
        console.error(e);
        res.json({ success: false, error: e.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    console.log('[Auth] Logout:', global.currentAuthUser);
    global.currentAuthUser = null;
    res.json({ success: true });
});

// Get current session
router.get('/session', (req, res) => {
    res.json({ user: global.currentAuthUser });
});

module.exports = router;
