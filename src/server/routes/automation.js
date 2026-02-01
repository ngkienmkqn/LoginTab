/**
 * Automation Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Create automation routes with injected manager
 * @param {Object} automationManager - AutomationManager instance
 */
function createAutomationRoutes(automationManager) {

    // Get available nodes
    router.get('/nodes', requireAuth, (req, res) => {
        res.json(automationManager.getRegistryJson());
    });

    return router;
}

module.exports = createAutomationRoutes;
