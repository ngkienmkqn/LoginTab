/**
 * Integration Test - Verify IPC Handler Registration
 * Run: node test_ipc_integration.js
 * 
 * This test mocks Electron and verifies all handlers can be registered
 */

console.log('='.repeat(60));
console.log('IPC INTEGRATION TEST');
console.log('='.repeat(60));

// Track registered handlers
const registeredHandlers = [];
const registeredListeners = [];

// Mock Electron
const mockIpcMain = {
    handle: (channel, handler) => {
        registeredHandlers.push(channel);
    },
    on: (channel, handler) => {
        registeredListeners.push(channel);
    }
};

const mockApp = {
    getPath: (name) => '/mock/userData',
    requestSingleInstanceLock: () => true,
    on: () => { },
    quit: () => { }
};

const mockBrowserWindow = class {
    constructor() { }
    loadFile() { }
    setMenu() { }
    on() { }
    once() { }
    show() { }
};

// Mock require
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
    if (id === 'electron') {
        return {
            ipcMain: mockIpcMain,
            app: mockApp,
            BrowserWindow: mockBrowserWindow,
            dialog: { showErrorBox: () => { } },
            Tray: class { },
            Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => { } },
            nativeImage: { createFromPath: () => ({ isEmpty: () => false }) }
        };
    }
    if (id === 'fs-extra') {
        return {
            ensureDir: async () => { },
            pathExists: async () => true,
            existsSync: () => true,
            remove: async () => { }
        };
    }
    if (id.includes('database/mysql')) {
        return {
            getPool: async () => ({
                query: async () => [[]],
                execute: async () => [[]],
                getConnection: async () => ({
                    beginTransaction: async () => { },
                    commit: async () => { },
                    rollback: async () => { },
                    query: async () => [[]],
                    execute: async () => [[]],
                    release: () => { }
                })
            }),
            initDB: async () => { },
            getDatabaseStats: async () => ({}),
            resetDatabase: async () => { }
        };
    }
    if (id.includes('managers/BrowserManager')) {
        return {
            launchProfile: async () => ({ on: () => { } }),
            lastPage: null,
            startElementPicker: async () => 'selector'
        };
    }
    if (id.includes('managers/AutomationManager')) {
        return class {
            getRegistryJson() { return []; }
            runWorkflow() { return Promise.resolve(); }
        };
    }
    if (id.includes('managers/ProxyChecker')) {
        return {
            checkProxyHealth: async () => 100,
            getHealthLabel: () => 'Good',
            getHealthColor: () => 'green'
        };
    }
    if (id.includes('utils/FingerprintGenerator')) {
        return {
            generateFingerprint: () => ({})
        };
    }
    if (id === 'uuid') {
        return { v4: () => 'mock-uuid-1234' };
    }
    if (id === 'otplib') {
        return { authenticator: { generate: () => '123456' } };
    }
    if (id === 'puppeteer-core') {
        return { launch: async () => ({ newPage: async () => ({}), close: async () => { } }) };
    }

    return originalRequire.apply(this, arguments);
};

// Now test IPC registration
console.log('\n[1] Loading IPC Index Module');
console.log('-'.repeat(40));

try {
    const { registerAllHandlers, setAutomationManager } = require('./src/main/ipc');
    console.log('✓ IPC index module loaded successfully');

    // Set mock automation manager
    setAutomationManager({
        getRegistryJson: () => [],
        runWorkflow: async () => { }
    });

    // Register all handlers with mock DB functions
    registerAllHandlers({
        dbFunctions: {
            getDatabaseStats: async () => ({}),
            resetDatabase: async () => { },
            initDB: async () => { }
        }
    });

    console.log('✓ All handlers registered without errors');
} catch (e) {
    console.log('✗ FAILED to load/register handlers');
    console.log('  Error:', e.message);
    console.log('  Stack:', e.stack);
    process.exit(1);
}

// Report registered handlers
console.log('\n[2] Registered IPC Handlers');
console.log('-'.repeat(40));
console.log(`Total handlers registered: ${registeredHandlers.length}`);
console.log(`Total listeners registered: ${registeredListeners.length}`);

// Expected handlers (minimum set)
const expectedHandlers = [
    'auth-login',
    'auth-logout',
    'get-accounts',
    'create-account',
    'update-account',
    'delete-account',
    'get-users',
    'save-user',
    'delete-user',
    'get-proxies',
    'save-proxy',
    'delete-proxy',
    'get-platforms',
    'get-extensions',
    'get-workflows',
    'save-workflow',
    'launch-browser',
    'get-2fa-codes',
    'preview-fingerprint'
];

console.log('\n[3] Checking Expected Handlers');
console.log('-'.repeat(40));

let passed = 0;
let failed = 0;

expectedHandlers.forEach(handler => {
    if (registeredHandlers.includes(handler)) {
        console.log(`✓ ${handler}`);
        passed++;
    } else {
        console.log(`✗ MISSING: ${handler}`);
        failed++;
    }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed}/${expectedHandlers.length} expected handlers found`);
console.log(`Total registered: ${registeredHandlers.length} handlers, ${registeredListeners.length} listeners`);
console.log('='.repeat(60));

// List all registered for debugging
console.log('\n[DEBUG] All Registered Handlers:');
registeredHandlers.sort().forEach(h => console.log(`  - ${h}`));

if (failed > 0) {
    process.exit(1);
}
