/**
 * IPC Handlers Index
 * Central export for all IPC handler modules
 */

const { registerAccountHandlers } = require('./accounts');
const { registerAssignmentHandlers } = require('./assignments');
const { registerAuthHandlers } = require('./auth');
const { registerBrowserHandlers } = require('./browser');
const { registerDatabaseHandlers } = require('./database');
const { registerElementPickerHandlers } = require('./element-picker');
const { registerExtensionHandlers } = require('./extensions');
const { registerPermissionHandlers } = require('./permissions');
const { registerPlatformHandlers } = require('./platforms');
const { registerProxyHandlers } = require('./proxies');
const { registerUserHandlers } = require('./users');
const { registerWorkflowHandlers, setAutomationManager } = require('./workflows');

/**
 * Register all IPC handlers
 * @param {Object} options - Configuration options
 * @param {Object} options.dbFunctions - Database functions (getDatabaseStats, resetDatabase, initDB)
 * @param {Object} options.automationManager - AutomationManager instance
 */
function registerAllHandlers(options = {}) {
    console.log('[IPC] Registering all handlers...');

    // Auth (must be first)
    registerAuthHandlers();
    console.log('[IPC] ✓ Auth handlers registered');

    // Core business logic
    registerAccountHandlers();
    console.log('[IPC] ✓ Account handlers registered');

    registerUserHandlers();
    console.log('[IPC] ✓ User handlers registered');

    registerAssignmentHandlers();
    console.log('[IPC] ✓ Assignment handlers registered');

    registerPermissionHandlers();
    console.log('[IPC] ✓ Permission handlers registered');

    // Resources
    registerProxyHandlers();
    console.log('[IPC] ✓ Proxy handlers registered');

    registerPlatformHandlers();
    console.log('[IPC] ✓ Platform handlers registered');

    registerExtensionHandlers();
    console.log('[IPC] ✓ Extension handlers registered');

    // Browser & Automation
    registerBrowserHandlers();
    console.log('[IPC] ✓ Browser handlers registered');

    registerElementPickerHandlers();
    console.log('[IPC] ✓ Element picker handlers registered');

    // Workflows (with optional AutomationManager)
    if (options.automationManager) {
        setAutomationManager(options.automationManager);
    }
    registerWorkflowHandlers();
    console.log('[IPC] ✓ Workflow handlers registered');

    // Database (with required functions)
    if (options.dbFunctions) {
        registerDatabaseHandlers(options.dbFunctions);
        console.log('[IPC] ✓ Database handlers registered');
    }

    console.log('[IPC] All handlers registered successfully');
}

module.exports = {
    registerAllHandlers,
    // Export individual registrars for granular control
    registerAccountHandlers,
    registerAssignmentHandlers,
    registerAuthHandlers,
    registerBrowserHandlers,
    registerDatabaseHandlers,
    registerElementPickerHandlers,
    registerExtensionHandlers,
    registerPermissionHandlers,
    registerPlatformHandlers,
    registerProxyHandlers,
    registerUserHandlers,
    registerWorkflowHandlers,
    setAutomationManager
};
