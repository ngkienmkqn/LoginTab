/**
 * Renderer Modules Index
 * Central export for all UI modules
 */

// Core modules
const toast = require('./toast');
const utils = require('./utils');
const modal = require('./modal');
const auth = require('./auth');
const navigation = require('./navigation');
const ipcEvents = require('./ipc-events');

// Feature modules
const profiles = require('./profiles');
const proxies = require('./proxies');
const extensions = require('./extensions');
const platforms = require('./platforms');
const workflows = require('./workflows');
const database = require('./database');
const bulkAssign = require('./bulk-assign');
const drawflow = require('./drawflow');

/**
 * Initialize all renderer modules
 */
function initializeAllModules() {
    console.log('[Renderer] Initializing modules...');

    // Initialize theme
    if (utils.initTheme) utils.initTheme();

    // Initialize modal listeners
    if (modal.initModalListeners) modal.initModalListeners();

    // Initialize navigation
    if (navigation.initNavigation) navigation.initNavigation();

    // Initialize IPC event listeners
    if (ipcEvents.initIpcListeners) ipcEvents.initIpcListeners();

    console.log('[Renderer] All modules initialized');
}

/**
 * Load all data (after login)
 */
async function loadAllData() {
    console.log('[Renderer] Loading all data...');

    try {
        // Load accounts
        if (profiles.loadAccounts) {
            await profiles.loadAccounts();
        }

        // Render will be handled by individual modules
        console.log('[Renderer] Data loaded successfully');
    } catch (error) {
        console.error('[Renderer] Load failed:', error);
    }
}

// Export all modules
module.exports = {
    // Core
    toast,
    utils,
    modal,
    auth,
    navigation,
    ipcEvents,

    // Features
    profiles,
    proxies,
    extensions,
    platforms,
    workflows,
    database,
    bulkAssign,
    drawflow,

    // Functions
    initializeAllModules,
    loadAllData,

    // Re-export commonly used functions at top level
    showToast: toast.showToast,
    closeModal: modal.closeModal,
    showModal: modal.showModal,
    navigate: navigation.navigate,
    handleLogin: auth.handleLogin,
    handleLogout: auth.handleLogout,
    launch: profiles.launch,
    editAccount: profiles.editAccount
};
