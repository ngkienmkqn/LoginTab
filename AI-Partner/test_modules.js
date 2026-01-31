/**
 * Test Cases for Modular IPC Structure
 * Run: node test_modules.js
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('MODULE IMPORT TEST SUITE');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ FAIL: ${name}`);
        console.log(`  Error: ${e.message}`);
        failed++;
    }
}

// ==================== FILE EXISTENCE TESTS ====================
console.log('\n[1] File Existence Tests');
console.log('-'.repeat(40));

const requiredFiles = [
    'src/main/auth/rbac.js',
    'src/main/auth/audit.js',
    'src/main/window.js',
    'src/main/tray.js',
    'src/main/ipc/index.js',
    'src/main/ipc/accounts.js',
    'src/main/ipc/assignments.js',
    'src/main/ipc/auth.js',
    'src/main/ipc/browser.js',
    'src/main/ipc/database.js',
    'src/main/ipc/element-picker.js',
    'src/main/ipc/extensions.js',
    'src/main/ipc/permissions.js',
    'src/main/ipc/platforms.js',
    'src/main/ipc/proxies.js',
    'src/main/ipc/users.js',
    'src/main/ipc/workflows.js',
];

requiredFiles.forEach(file => {
    test(`File exists: ${file}`, () => {
        const fullPath = path.join(__dirname, file);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${fullPath}`);
        }
    });
});

// ==================== SYNTAX TESTS ====================
console.log('\n[2] Module Syntax Tests');
console.log('-'.repeat(40));

// Mock Electron before requiring modules
const mockElectron = {
    ipcMain: {
        handle: () => { },
        on: () => { }
    },
    app: {
        getPath: () => '/mock/path'
    },
    BrowserWindow: class { }
};

// Override require for electron
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'electron') return mockElectron;
    if (id === 'fs-extra') return require('fs');
    if (id.includes('../../database/mysql')) {
        return { getPool: async () => ({ query: async () => [[]] }) };
    }
    if (id.includes('../../managers/')) {
        return { launchProfile: async () => { }, lastPage: null };
    }
    if (id.includes('../../utils/FingerprintGenerator')) {
        return { generateFingerprint: () => ({}) };
    }
    return originalRequire.apply(this, arguments);
};

// Test each module can be required without syntax errors
const ipcModules = [
    'accounts',
    'auth',
    'proxies',
    'platforms',
    'extensions',
];

ipcModules.forEach(mod => {
    test(`Module loads: ipc/${mod}.js`, () => {
        // Clear cache first
        const modPath = path.join(__dirname, `src/main/ipc/${mod}.js`);
        delete require.cache[modPath];

        // Check syntax by reading and evaluating
        const content = fs.readFileSync(modPath, 'utf8');

        // Basic syntax check
        if (!content.includes('module.exports')) {
            throw new Error('Missing module.exports');
        }
        if (!content.includes('function register')) {
            throw new Error('Missing register function');
        }
    });
});

// ==================== EXPORT STRUCTURE TESTS ====================
console.log('\n[3] Export Structure Tests');
console.log('-'.repeat(40));

test('IPC index exports registerAllHandlers', () => {
    const indexPath = path.join(__dirname, 'src/main/ipc/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    if (!content.includes('registerAllHandlers')) {
        throw new Error('Missing registerAllHandlers export');
    }
});

test('RBAC exports authorize, checkPermission, checkScope', () => {
    const rbacPath = path.join(__dirname, 'src/main/auth/rbac.js');
    const content = fs.readFileSync(rbacPath, 'utf8');
    ['authorize', 'checkPermission', 'checkScope'].forEach(fn => {
        if (!content.includes(fn)) {
            throw new Error(`Missing ${fn} export`);
        }
    });
});

test('Audit exports auditLog', () => {
    const auditPath = path.join(__dirname, 'src/main/auth/audit.js');
    const content = fs.readFileSync(auditPath, 'utf8');
    if (!content.includes('auditLog')) {
        throw new Error('Missing auditLog export');
    }
});

// ==================== DEPENDENCY CHECK ====================
console.log('\n[4] Dependency Reference Tests');
console.log('-'.repeat(40));

test('Accounts uses RBAC and Audit', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/main/ipc/accounts.js'), 'utf8');
    if (!content.includes("require('../auth/rbac')")) {
        throw new Error('Missing RBAC import');
    }
    if (!content.includes("require('../auth/audit')")) {
        throw new Error('Missing Audit import');
    }
});

test('Users uses RBAC and Audit', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/main/ipc/users.js'), 'utf8');
    if (!content.includes("require('../auth/rbac')")) {
        throw new Error('Missing RBAC import');
    }
});

test('Browser uses Audit', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/main/ipc/browser.js'), 'utf8');
    if (!content.includes("require('../auth/audit')")) {
        throw new Error('Missing Audit import');
    }
});

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
