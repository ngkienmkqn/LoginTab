/**
 * Test Cases for CSS Modularization (Sprint 4)
 * Run: node test_css_modules.js
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('CSS MODULES TEST SUITE');
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
    'src/ui/styles/main.css',
    'src/ui/styles/variables.css',
    'src/ui/styles/layout.css',
    'src/ui/styles/components.css',
    'src/ui/styles/tables.css',
    'src/ui/styles/modals.css',
    'src/ui/styles/drawflow.css',
    'src/ui/styles/panels.css',
    'src/ui/styles/animations.css',
];

requiredFiles.forEach(file => {
    test(`File exists: ${file}`, () => {
        const fullPath = path.join(__dirname, file);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${fullPath}`);
        }
    });
});

// ==================== CSS CONTENT TESTS ====================
console.log('\n[2] CSS Content Tests');
console.log('-'.repeat(40));

test('Variables.css contains :root', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/variables.css'), 'utf8');
    if (!content.includes(':root')) {
        throw new Error('Missing :root declaration');
    }
});

test('Variables.css contains theme variables', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/variables.css'), 'utf8');
    const requiredVars = ['--bg-body', '--accent', '--text-main', '--border', '--success', '--danger'];
    requiredVars.forEach(v => {
        if (!content.includes(v)) {
            throw new Error(`Missing variable: ${v}`);
        }
    });
});

test('Variables.css contains light-mode', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/variables.css'), 'utf8');
    if (!content.includes('.light-mode')) {
        throw new Error('Missing .light-mode class');
    }
});

test('Layout.css contains sidebar', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/layout.css'), 'utf8');
    if (!content.includes('.sidebar')) {
        throw new Error('Missing .sidebar class');
    }
});

test('Layout.css contains nav-item', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/layout.css'), 'utf8');
    if (!content.includes('.nav-item')) {
        throw new Error('Missing .nav-item class');
    }
});

test('Components.css contains btn', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/components.css'), 'utf8');
    if (!content.includes('.btn')) {
        throw new Error('Missing .btn class');
    }
});

test('Components.css contains form-control', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/components.css'), 'utf8');
    if (!content.includes('.form-control')) {
        throw new Error('Missing .form-control class');
    }
});

test('Tables.css contains table styles', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/tables.css'), 'utf8');
    if (!content.includes('table') || !content.includes('th') || !content.includes('td')) {
        throw new Error('Missing table element styles');
    }
});

test('Modals.css contains modal', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/modals.css'), 'utf8');
    if (!content.includes('.modal')) {
        throw new Error('Missing .modal class');
    }
});

test('Drawflow.css contains node styles', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/drawflow.css'), 'utf8');
    if (!content.includes('.drawflow-node')) {
        throw new Error('Missing .drawflow-node class');
    }
});

test('Animations.css contains keyframes', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/animations.css'), 'utf8');
    if (!content.includes('@keyframes')) {
        throw new Error('Missing @keyframes');
    }
});

test('Animations.css contains toast styles', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/animations.css'), 'utf8');
    if (!content.includes('.toast')) {
        throw new Error('Missing .toast class');
    }
});

// ==================== MAIN CSS IMPORT TESTS ====================
console.log('\n[3] Main CSS Import Tests');
console.log('-'.repeat(40));

test('Main.css imports all modules', () => {
    const content = fs.readFileSync(path.join(__dirname, 'src/ui/styles/main.css'), 'utf8');
    const requiredImports = [
        'variables.css',
        'layout.css',
        'components.css',
        'tables.css',
        'modals.css',
        'drawflow.css',
        'panels.css',
        'animations.css'
    ];
    requiredImports.forEach(imp => {
        if (!content.includes(imp)) {
            throw new Error(`Missing import: ${imp}`);
        }
    });
});

// ==================== SYNTAX VALIDATION ====================
console.log('\n[4] CSS Syntax Validation');
console.log('-'.repeat(40));

const cssFiles = [
    'variables.css',
    'layout.css',
    'components.css',
    'tables.css',
    'modals.css',
    'drawflow.css',
    'panels.css',
    'animations.css'
];

cssFiles.forEach(file => {
    test(`Valid CSS syntax: ${file}`, () => {
        const content = fs.readFileSync(path.join(__dirname, `src/ui/styles/${file}`), 'utf8');

        // Check for balanced braces
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;

        if (openBraces !== closeBraces) {
            throw new Error(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
        }

        // Check for common syntax issues
        if (content.includes(':::') || content.includes(';;;')) {
            throw new Error('Invalid syntax detected');
        }
    });
});

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
