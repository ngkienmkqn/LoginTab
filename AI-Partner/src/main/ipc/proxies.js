/**
 * Proxies IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

/**
 * Register all proxy IPC handlers
 */
function registerProxyHandlers() {

    // Get all proxies
    ipcMain.handle('get-proxies', async () => {
        try {
            const pool = await getPool();
            const [rows] = await pool.query('SELECT * FROM proxies');
            return rows;
        } catch (error) {
            console.error('Failed to get proxies:', error);
            return [];
        }
    });

    // Save proxy (create or update)
    ipcMain.handle('save-proxy', async (event, proxy) => {
        try {
            const pool = await getPool();
            if (proxy.id) {
                await pool.query(
                    'UPDATE proxies SET type = ?, host = ?, port = ?, user = ?, pass = ? WHERE id = ?',
                    [proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass, proxy.id]
                );
            } else {
                await pool.query(
                    'INSERT INTO proxies (id, type, host, port, user, pass) VALUES (?, ?, ?, ?, ?, ?)',
                    [uuidv4(), proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass]
                );
            }
            return { success: true };
        } catch (error) {
            console.error('Save proxy failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Delete proxy
    ipcMain.handle('delete-proxy', async (event, id) => {
        try {
            const pool = await getPool();
            await pool.query('DELETE FROM proxies WHERE id = ?', [id]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerProxyHandlers };
