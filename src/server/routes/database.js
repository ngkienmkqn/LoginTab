/**
 * Database Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Create database routes with injected functions
 * @param {Object} dbFunctions - { getDatabaseStats, resetDatabase, initDB }
 */
function createDatabaseRoutes(dbFunctions) {
    const { getDatabaseStats, resetDatabase, initDB } = dbFunctions;

    // Get database stats
    router.get('/stats', requireAuth, async (req, res) => {
        res.json(await getDatabaseStats());
    });

    // Reset database (keep workflows)
    router.post('/reset', requireAuth, async (req, res) => {
        console.log('[API] Database reset request');
        try {
            await resetDatabase(true);
            await initDB();
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createDatabaseRoutes;
