/**
 * Platforms IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

/**
 * Register all platform IPC handlers
 */
function registerPlatformHandlers() {

    // Get all platforms
    ipcMain.handle('get-platforms', async () => {
        try {
            const pool = await getPool();
            const [rows] = await pool.query('SELECT * FROM platforms');
            return rows;
        } catch (error) {
            return [];
        }
    });

    // Save platform (create)
    ipcMain.handle('save-platform', async (event, platform) => {
        try {
            const pool = await getPool();
            await pool.query(
                'INSERT INTO platforms (id, name, url) VALUES (?, ?, ?)',
                [uuidv4(), platform.name, platform.url]
            );
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Update platform
    ipcMain.handle('update-platform', async (event, platform) => {
        try {
            const pool = await getPool();
            await pool.query(
                'UPDATE platforms SET name = ?, url = ? WHERE id = ?',
                [platform.name, platform.url, platform.id]
            );
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // Delete platform
    ipcMain.handle('delete-platform', async (event, id) => {
        try {
            const pool = await getPool();
            await pool.query('DELETE FROM platforms WHERE id = ?', [id]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerPlatformHandlers };
