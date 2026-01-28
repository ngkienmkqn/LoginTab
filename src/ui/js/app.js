const { ipcRenderer } = require('electron');

// --- Load Modules ---
// Order matters slightly for dependencies if they were CommonJS requires with side effects, 
// but here they attach to window, so we just need them loaded before we try to use them.

try {
    require('./js/modules/auth.js');
    require('./js/utils/ui.js'); // UI Utils first as others might use it
    require('./js/modules/proxies.js');
    require('./js/modules/extensions.js');
    require('./js/modules/platforms.js');
    require('./js/modules/automations.js');
    require('./js/modules/profiles.js');
    require('./user_management.js'); // Existing user management logic (in src/ui root)
} catch (e) {
    console.error('Failed to load modules:', e);
    alert('Critical Error: Failed to load application modules. ' + e.message);
}

// --- Global Aliasing for HTML Event Handlers ---
// Because the HTML was originally written with inline events like onclick="saveProfile()",
// we map the modular functions to the global scope to maintain compatibility without rewriting HTML.

// Profiles
window.saveProfile = window.profilesModule.saveProfile;
window.remove = window.profilesModule.remove;
window.launch = window.profilesModule.launch;
window.editAccount = window.profilesModule.editAccount;
window.openProfileModal = window.profilesModule.populateAndOpenProfileModal;
window.toggleManualProxy = window.profilesModule.toggleManualProxy;
window.toggleManualExt = window.profilesModule.toggleManualExt;
window.toggleSelectAll = window.profilesModule.toggleSelectAll;
window.onAccountSelect = window.profilesModule.onAccountSelect;

// Proxies
window.saveNewProxy = window.proxiesModule.saveNewProxy;
window.deleteProxy = window.proxiesModule.deleteProxy;
window.openProxyModal = window.window.proxiesModule.openProxyModal; // Fix double window if exists, or just use module
// Wait, in proxies.js I exposed window.proxiesModule.openProxyModal, but the HTML might call openProxyModal()
window.openProxyModal = window.proxiesModule.openProxyModal;
window.testProxyHealth = window.proxiesModule.testProxyHealth;

// Extensions
window.saveNewExtension = window.extensionsModule.saveNewExtension;
window.deleteExtension = window.extensionsModule.deleteExtension;
window.openExtensionModal = () => window.uiUtils.openModal('extensionModal'); // Simple opener

// Platforms
window.savePlatform = window.platformsModule.savePlatform;
window.deletePlatform = window.platformsModule.deletePlatform;
window.openPlatformModal = window.platformsModule.openPlatformModal;

// Automations
window.showEditor = window.automationsModule.showEditor;
window.saveWorkflow = window.automationsModule.saveWorkflow;
window.closeEditor = window.automationsModule.closeEditor;
window.createNewWorkflow = window.automationsModule.createNewWorkflow;
window.deleteWorkflow = window.automationsModule.deleteWorkflow;
window.loadWorkflow = window.automationsModule.loadWorkflow;
window.runAutomation = window.automationsModule.runAutomation;
window.toggleNodeMenu = window.automationsModule.toggleNodeMenu;
window.addNode = window.automationsModule.addNode; // Used in menu generation? Yes.
window.zoomIn = window.automationsModule.zoomIn;
window.zoomOut = window.automationsModule.zoomOut;
window.zoomReset = window.automationsModule.zoomReset;

// UI Utils
window.navigate = window.uiUtils.navigate;
window.switchTab = window.uiUtils.switchTab;
window.closeModal = window.uiUtils.closeModal;
window.openModal = window.uiUtils.openModal; // Note: Profiles has its own editAccount logic
window.filterProfiles = window.uiUtils.filterProfiles;
window.copyCode = window.uiUtils.copyCode;
window.loadDatabaseStats = window.uiUtils.loadDatabaseStats;
window.triggerQRScan = window.uiUtils.triggerQRScan;
window.processQR = window.uiUtils.processQR;
window.updateFingerprintPreview = window.uiUtils.updateFingerprintPreview;
window.getRandomGPU = window.uiUtils.getRandomGPU;

// --- Data Loading Orchestration ---
async function loadAllData() {
    if (!window.currentUser) return;
    console.log('[App] Loading All Data...');

    // Load dependencies first
    await window.proxiesModule.loadProxies();
    await window.extensionsModule.loadExtensions();
    await window.platformsModule.loadPlatforms();

    // Load Core
    await window.profilesModule.loadAccounts();

    // Load Automations
    await window.automationsModule.initDynamicNodes();
    await window.automationsModule.refreshWorkflowList();

    // Users (Admin only)
    if (window.currentUser.role === 'admin' || window.currentUser.role === 'super_admin') {
        if (window.loadUsers) await window.loadUsers(); // In user_management.js
    }

    console.log('[App] Data Loading Complete');
}

// Expose loadAllData
window.loadAllData = loadAllData;

// --- Database Reset Logic ---
async function resetDatabaseWithConfirmation() {
    if (confirm('WARNING: This will delete ALL Accounts, Proxies, and Extensions.\n\nOnly Workflows will be kept.\n\nYour session files will also be cleared to fix corruption.\n\nContinue?')) {
        try {
            const res = await ipcRenderer.invoke('reset-db', { keepWorkflows: true });
            if (res.success) {
                alert('Database and Sessions have been reset successfully.');
                location.reload();
            } else {
                alert('Reset Failed: ' + res.error);
            }
        } catch (e) {
            alert('Error invoking reset-db: ' + e.message);
        }
    }
}
window.resetDatabaseWithConfirmation = resetDatabaseWithConfirmation;

// --- Boot ---
window.addEventListener('DOMContentLoaded', () => {
    console.log('[App] DOM Ready');
    // Any initial setup, e.g. checking if already logged in?
    // Current auth logic relies on handleLogin() being called manually.
    // If persistence is added, check it here.
});
