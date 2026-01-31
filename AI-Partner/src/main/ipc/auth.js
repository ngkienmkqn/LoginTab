/**
 * Authentication IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

/**
 * Register all authentication IPC handlers
 */
function registerAuthHandlers() {

    // Login
    ipcMain.handle('auth-login', async (event, { username, password }) => {
        try {
            const pool = await getPool();

            // Check hardcoded admin (Bootstrap)
            if (username === 'admin' && password === 'Kien123!!') {
                const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"');
                let user;
                if (rows.length === 0) {
                    const id = uuidv4();
                    await pool.query('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', [id, 'admin', 'Kien123!!', 'super_admin']);
                    user = { id, username: 'admin', role: 'super_admin' };
                } else {
                    user = rows[0];
                }

                global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
                console.log('[Auth] Login successful:', global.currentAuthUser);

                return { success: true, user: { id: user.id, username: user.username, role: user.role } };
            }

            // Check DB users
            const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
            if (rows.length > 0) {
                const user = rows[0];

                global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
                console.log('[Auth] Login successful:', global.currentAuthUser);

                return { success: true, user: { id: user.id, username: user.username, role: user.role } };
            }

            return { success: false, error: 'Valid username/password required' };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    });

    // Logout
    ipcMain.handle('auth-logout', async (event) => {
        console.log('[Auth] Logout:', global.currentAuthUser);
        global.currentAuthUser = null;
        return { success: true };
    });
}

module.exports = { registerAuthHandlers };
