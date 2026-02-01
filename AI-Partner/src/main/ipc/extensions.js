/**
 * Extensions IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

/**
 * Register all extension IPC handlers
 */
function registerExtensionHandlers() {

    // Get all extensions
    ipcMain.handle('get-extensions', async () => {
        try {
            const pool = await getPool();
            const [rows] = await pool.query('SELECT * FROM extensions');
            return rows;
        } catch (error) {
            console.error('Get extensions failed:', error);
            return [];
        }
    });

    // Save extension
    ipcMain.handle('save-extension', async (event, ext) => {
        try {
            const pool = await getPool();
            await pool.query(
                'INSERT INTO extensions (id, name, path) VALUES (?, ?, ?)',
                [uuidv4(), ext.name, ext.path]
            );
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Delete extension
    ipcMain.handle('delete-extension', async (event, id) => {
        try {
            const pool = await getPool();
            await pool.query('DELETE FROM extensions WHERE id = ?', [id]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerExtensionHandlers };
