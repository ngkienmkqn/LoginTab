/**
 * Test Cases for Modular Renderer UI
 * Run: node test_renderer_modules.js
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('RENDERER UI MODULES TEST SUITE');
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
    'src/ui/renderer/index.js',
    'src/ui/renderer/toast.js',
    'src/ui/renderer/utils.js',
    'src/ui/renderer/auth.js',
    'src/ui/renderer/modal.js',
    'src/ui/renderer/navigation.js',
    'src/ui/renderer/ipc-events.js',
    'src/ui/renderer/profiles.js',
    'src/ui/renderer/proxies.js',
    'src/ui/renderer/extensions.js',
    'src/ui/renderer/platforms.js',
    'src/ui/renderer/workflows.js',
    'src/ui/renderer/database.js',
    'src/ui/renderer/bulk-assign.js',
    'src/ui/renderer/drawflow.js',
];

requiredFiles.forEach(file => {
    test(`File exists: ${file}`, () => {
        const fullPath = path.join(__dirname, file);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${fullPath}`);
        }
    });
});

// ==================== EXPORT STRUCTURE TESTS ====================
console.log('\n[2] Export Structure Tests');
console.log('-'.repeat(40));

test('Index exports initializeAllModules', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/index.js'), 'utf8');
    if (!content.includes('initializeAllModules')) {
        throw new Error('Missing initializeAllModules export');
    }
});

test('Toast exports showToast', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/toast.js'), 'utf8');
    if (!content.includes('showToast')) {
        throw new Error('Missing showToast export');
    }
});

test('Auth exports handleLogin and handleLogout', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/auth.js'), 'utf8');
    if (!content.includes('handleLogin') || !content.includes('handleLogout')) {
        throw new Error('Missing auth exports');
    }
});

test('Profiles exports launch and editAccount', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/profiles.js'), 'utf8');
    if (!content.includes('launch') || !content.includes('editAccount')) {
        throw new Error('Missing profile exports');
    }
});

test('Workflows exports saveWorkflow and loadWorkflow', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/workflows.js'), 'utf8');
    if (!content.includes('saveWorkflow') || !content.includes('loadWorkflow')) {
        throw new Error('Missing workflow exports');
    }
});

test('Drawflow exports initDrawflow and addNode', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/drawflow.js'), 'utf8');
    if (!content.includes('initDrawflow') || !content.includes('addNode')) {
        throw new Error('Missing drawflow exports');
    }
});

// ==================== MODULE SYNTAX TESTS ====================
console.log('\n[3] Module Syntax Tests');
console.log('-'.repeat(40));

const moduleFiles = [
    'toast',
    'utils',
    'auth',
    'modal',
    'navigation',
    'profiles',
    'proxies',
    'extensions',
    'platforms',
    'workflows',
    'database',
    'bulk-assign',
    'drawflow'
];

moduleFiles.forEach(mod => {
    test(`Module syntax valid: ${mod}.js`, () => {
        const modPath = path.join(__dirname, `src/ui/renderer/${mod}.js`);
        const content = fs.readFileSync(modPath, 'utf8');

        // Check for module.exports
        if (!content.includes('module.exports')) {
            throw new Error('Missing module.exports');
        }

        // Check for proper function definitions
        if (!content.includes('function ')) {
            throw new Error('No functions defined');
        }
    });
});

// ==================== IPC DEPENDENCY TESTS ====================
console.log('\n[4] IPC Dependency Tests');
console.log('-'.repeat(40));

test('Auth uses ipcRenderer', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/auth.js'), 'utf8');
    if (!content.includes('ipcRenderer')) {
        throw new Error('Missing ipcRenderer import');
    }
});

test('Profiles uses ipcRenderer', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/profiles.js'), 'utf8');
    if (!content.includes('ipcRenderer')) {
        throw new Error('Missing ipcRenderer import');
    }
});

test('Workflows uses ipcRenderer', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/renderer/workflows.js'), 'utf8');
    if (!content.includes('ipcRenderer')) {
        throw new Error('Missing ipcRenderer import');
    }
});

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
