/**
 * Test Cases for Modular Server Routes
 * Run: node test_server_modules.js
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('SERVER ROUTES MODULE TEST SUITE');
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
    'src/server/middleware/auth.js',
    'src/server/middleware/rbac.js',
    'src/server/routes/index.js',
    'src/server/routes/auth.js',
    'src/server/routes/accounts.js',
    'src/server/routes/browser.js',
    'src/server/routes/proxies.js',
    'src/server/routes/extensions.js',
    'src/server/routes/platforms.js',
    'src/server/routes/users.js',
    'src/server/routes/workflows.js',
    'src/server/routes/assignments.js',
    'src/server/routes/database.js',
    'src/server/routes/fingerprint.js',
    'src/server/routes/automation.js',
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

test('Routes index exports registerAllRoutes', () => {
    const indexPath = path.join(__dirname, 'src/server/routes/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    if (!content.includes('registerAllRoutes')) {
        throw new Error('Missing registerAllRoutes export');
    }
});

test('Auth middleware exports requireAuth', () => {
    const authPath = path.join(__dirname, 'src/server/middleware/auth.js');
    const content = fs.readFileSync(authPath, 'utf8');
    if (!content.includes('requireAuth')) {
        throw new Error('Missing requireAuth export');
    }
});

test('RBAC middleware exports authorize, checkPermission, auditLog', () => {
    const rbacPath = path.join(__dirname, 'src/server/middleware/rbac.js');
    const content = fs.readFileSync(rbacPath, 'utf8');
    ['authorize', 'checkPermission', 'auditLog'].forEach(fn => {
        if (!content.includes(fn)) {
            throw new Error(`Missing ${fn} export`);
        }
    });
});

// ==================== ROUTE SYNTAX TESTS ====================
console.log('\n[3] Route Syntax Tests');
console.log('-'.repeat(40));

const routeModules = [
    'auth',
    'accounts',
    'browser',
    'proxies',
    'extensions',
    'platforms',
    'users',
    'workflows',
    'fingerprint'
];

routeModules.forEach(mod => {
    test(`Route module valid: ${mod}.js`, () => {
        const modPath = path.join(__dirname, `src/server/routes/${mod}.js`);
        const content = fs.readFileSync(modPath, 'utf8');

        if (!content.includes('express.Router()') && !content.includes("require('express')")) {
            throw new Error('Missing Express router');
        }
        if (!content.includes('module.exports')) {
            throw new Error('Missing module.exports');
        }
    });
});

// ==================== DEPENDENCY CHECK ====================
console.log('\n[4] Dependency Reference Tests');
console.log('-'.repeat(40));

test('Accounts route uses auth middleware', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/server/routes/accounts.js'), 'utf8');
    if (!content.includes("requireAuth")) {
        throw new Error('Missing requireAuth import');
    }
});

test('Users route uses RBAC', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/server/routes/users.js'), 'utf8');
    if (!content.includes("authorize") && !content.includes("checkPermission")) {
        throw new Error('Missing RBAC import');
    }
});

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
