/**
 * Routes Index
 * Central export for all route modules
 */

const authRoutes = require('./auth');
const accountsRoutes = require('./accounts');
const browserRoutes = require('./browser');
const proxiesRoutes = require('./proxies');
const extensionsRoutes = require('./extensions');
const platformsRoutes = require('./platforms');
const usersRoutes = require('./users');
const workflowsRoutes = require('./workflows');
const assignmentsRoutes = require('./assignments');
const fingerprintRoutes = require('./fingerprint');
const createDatabaseRoutes = require('./database');
const createAutomationRoutes = require('./automation');

/**
 * Register all routes on the Express app
 * @param {Express} app - Express application
 * @param {Object} options - Configuration options
 * @param {Object} options.dbFunctions - { getDatabaseStats, resetDatabase, initDB }
 * @param {Object} options.automationManager - AutomationManager instance
 */
function registerAllRoutes(app, options = {}) {
    console.log('[Routes] Registering all API routes...');

    // Static routes
    app.use('/api/auth', authRoutes);
    console.log('[Routes] ✓ /api/auth');

    app.use('/api/accounts', accountsRoutes);
    console.log('[Routes] ✓ /api/accounts');

    app.use('/api/browser', browserRoutes);
    console.log('[Routes] ✓ /api/browser');

    app.use('/api/proxies', proxiesRoutes);
    console.log('[Routes] ✓ /api/proxies');

    app.use('/api/extensions', extensionsRoutes);
    console.log('[Routes] ✓ /api/extensions');

    app.use('/api/platforms', platformsRoutes);
    console.log('[Routes] ✓ /api/platforms');

    app.use('/api/users', usersRoutes);
    console.log('[Routes] ✓ /api/users');

    app.use('/api/workflows', workflowsRoutes);
    console.log('[Routes] ✓ /api/workflows');

    app.use('/api/assignments', assignmentsRoutes);
    console.log('[Routes] ✓ /api/assignments');

    app.use('/api/fingerprint', fingerprintRoutes);
    console.log('[Routes] ✓ /api/fingerprint');

    // Dynamic routes (with injected dependencies)
    if (options.dbFunctions) {
        app.use('/api/database', createDatabaseRoutes(options.dbFunctions));
        console.log('[Routes] ✓ /api/database');
    }

    if (options.automationManager) {
        app.use('/api/automation', createAutomationRoutes(options.automationManager));
        console.log('[Routes] ✓ /api/automation');
    }

    console.log('[Routes] All routes registered successfully');
}

module.exports = {
    registerAllRoutes,
    // Export individual routes for granular control
    authRoutes,
    accountsRoutes,
    browserRoutes,
    proxiesRoutes,
    extensionsRoutes,
    platformsRoutes,
    usersRoutes,
    workflowsRoutes,
    assignmentsRoutes,
    fingerprintRoutes,
    createDatabaseRoutes,
    createAutomationRoutes
};
