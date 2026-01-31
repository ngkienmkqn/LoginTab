/**
 * Database IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');

/**
 * Register all database management IPC handlers
 * @param {Object} dbFunctions - Object containing getDatabaseStats, resetDatabase, initDB functions
 */
function registerDatabaseHandlers(dbFunctions) {
    const { getDatabaseStats, resetDatabase, initDB } = dbFunctions;

    // Get database stats
    ipcMain.handle('get-database-stats', async () => {
        return await getDatabaseStats();
    });

    // Alias: database:get-stats
    ipcMain.handle('database:get-stats', async () => {
        return await getDatabaseStats();
    });

    // Reset database (keep workflows)
    ipcMain.handle('database:reset', async () => {
        console.log('[Main] Received database reset request (Keeping Workflows)');
        try {
            await resetDatabase(true); // true = keep workflows
            await initDB();
            return { success: true };
        } catch (error) {
            console.error('Reset failed:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerDatabaseHandlers };
