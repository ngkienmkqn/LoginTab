/**
 * Comprehensive Test Suite for Automation Engine v2
 * Run: node test_automation_engine.js
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('AUTOMATION ENGINE v2 TEST SUITE');
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

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

// ==================== FILE STRUCTURE TESTS ====================
console.log('\n[1] File Structure Tests');
console.log('-'.repeat(40));

const requiredFiles = [
    'src/automation/index.js',
    'src/automation/registry.js',
    'src/automation/executor.js',
    'src/automation/managers.js',
    'src/automation/nodes/index.js',
    'src/automation/nodes/browser.js',
    'src/automation/nodes/logic.js',
    'src/automation/nodes/data.js',
    'src/automation/nodes/network.js',
    'src/automation/nodes/special.js'
];

requiredFiles.forEach(file => {
    test(`File exists: ${file}`, () => {
        const fullPath = path.join(__dirname, '..', file);
        assert(fs.existsSync(fullPath), `File not found: ${fullPath}`);
    });
});

// ==================== MODULE LOAD TESTS ====================
console.log('\n[2] Module Load Tests');
console.log('-'.repeat(40));

let registry, executor, managers, nodes, browserNodes, logicNodes, dataNodes, networkNodes, specialNodes;

test('Registry module loads', () => {
    registry = require('../src/automation/registry');
    assert(registry.CATEGORIES, 'Missing CATEGORIES');
    assert(registry.RISK_LEVELS, 'Missing RISK_LEVELS');
});

test('Browser nodes module loads', () => {
    browserNodes = require('../src/automation/nodes/browser');
    assert(Object.keys(browserNodes).length > 0, 'No browsers exports');
});

test('Logic nodes module loads', () => {
    logicNodes = require('../src/automation/nodes/logic');
    assert(Object.keys(logicNodes).length > 0, 'No logic exports');
});

test('Data nodes module loads', () => {
    dataNodes = require('../src/automation/nodes/data');
    assert(Object.keys(dataNodes).length > 0, 'No data exports');
});

test('Network nodes module loads', () => {
    networkNodes = require('../src/automation/nodes/network');
    assert(Object.keys(networkNodes).length > 0, 'No network exports');
});

test('Special nodes module loads', () => {
    specialNodes = require('../src/automation/nodes/special');
    assert(Object.keys(specialNodes).length > 0, 'No special exports');
});

test('Nodes index loads all nodes', () => {
    nodes = require('../src/automation/nodes');
    assert(nodes.ALL_NODES, 'Missing ALL_NODES');
    assert(Object.keys(nodes.ALL_NODES).length >= 35, `Expected 35+ nodes, got ${Object.keys(nodes.ALL_NODES).length}`);
});

test('Executor module loads', () => {
    executor = require('../src/automation/executor');
    assert(executor.WorkflowExecutor, 'Missing WorkflowExecutor');
});

test('Managers module loads', () => {
    managers = require('../src/automation/managers');
    assert(managers.WebhookManager, 'Missing WebhookManager');
    assert(managers.HumanInteractionManager, 'Missing HumanInteractionManager');
});

// ==================== NODE STRUCTURE TESTS ====================
console.log('\n[3] Node Structure Tests');
console.log('-'.repeat(40));

test('All nodes have required fields', () => {
    const requiredFields = ['id', 'name', 'category', 'riskLevel', 'capabilities'];

    for (const [nodeId, node] of Object.entries(nodes.ALL_NODES)) {
        for (const field of requiredFields) {
            assert(node[field] !== undefined, `Node ${nodeId} missing ${field}`);
        }
    }
});

test('All nodes have impl function or special flags', () => {
    for (const [nodeId, node] of Object.entries(nodes.ALL_NODES)) {
        const hasImpl = typeof node.impl === 'function';
        const isSpecial = node.isLoopStart || node.isTryCatchStart;
        assert(hasImpl || isSpecial, `Node ${nodeId} missing impl function`);
    }
});

test('Browser nodes (12) exist', () => {
    const browserNodeIds = [
        'click_element', 'type_text', 'open_url', 'wait_navigation',
        'select_option', 'get_text', 'element_exists', 'scroll_to_element',
        'hover_element', 'get_attribute', 'clear_input', 'wait_element'
    ];

    for (const id of browserNodeIds) {
        assert(nodes.ALL_NODES[id], `Missing browser node: ${id}`);
    }
});

test('Logic nodes (10) exist', () => {
    const logicNodeIds = [
        'condition', 'loop_data', 'loop_count', 'set_variable',
        'delay', 'random_delay', 'break_loop', 'continue_loop',
        'stop_workflow', 'try_catch'
    ];

    for (const id of logicNodeIds) {
        assert(nodes.ALL_NODES[id], `Missing logic node: ${id}`);
    }
});

test('Data nodes (8) exist', () => {
    const dataNodeIds = [
        'db_select', 'db_write', 'db_delete', 'extract_table',
        'json_parse', 'regex_extract', 'math_operation', 'string_format'
    ];

    for (const id of dataNodeIds) {
        assert(nodes.ALL_NODES[id], `Missing data node: ${id}`);
    }
});

test('Network nodes (4) exist', () => {
    const networkNodeIds = [
        'http_request', 'send_webhook', 'wait_for_webhook', 'wait_for_human'
    ];

    for (const id of networkNodeIds) {
        assert(nodes.ALL_NODES[id], `Missing network node: ${id}`);
    }
});

test('Special nodes (6) exist', () => {
    const specialNodeIds = [
        'keyboard_action', 'log_debug', 'generate_2fa',
        'evaluate_js', 'screenshot', 'switch_tab'
    ];

    for (const id of specialNodeIds) {
        assert(nodes.ALL_NODES[id], `Missing special node: ${id}`);
    }
});

// ==================== CAPABILITY TESTS ====================
console.log('\n[4] Capability System Tests');
console.log('-'.repeat(40));

test('hasCapability works for staff', () => {
    assert(registry.hasCapability('staff', 'browser:basic'), 'Staff should have browser:basic');
    assert(!registry.hasCapability('staff', 'db:delete'), 'Staff should NOT have db:delete');
});

test('hasCapability works for admin', () => {
    assert(registry.hasCapability('admin', 'browser:advanced'), 'Admin should have browser:advanced');
    assert(!registry.hasCapability('admin', 'system:shell'), 'Admin should NOT have system:shell');
});

test('hasCapability works for super_admin', () => {
    assert(registry.hasCapability('super_admin', 'system:shell'), 'Super admin should have system:shell');
    assert(registry.hasCapability('super_admin', 'db:delete'), 'Super admin should have db:delete');
});

test('canExecuteNode enforces permissions', () => {
    const criticalNode = { capabilities: ['db:delete'] };
    const basicNode = { capabilities: ['browser:basic'] };

    assert(!registry.canExecuteNode('staff', criticalNode), 'Staff should NOT execute critical node');
    assert(registry.canExecuteNode('super_admin', criticalNode), 'Super admin should execute critical node');
    assert(registry.canExecuteNode('staff', basicNode), 'Staff should execute basic node');
});

// ==================== EXECUTOR TESTS ====================
console.log('\n[5] Executor Tests');
console.log('-'.repeat(40));

test('WorkflowExecutor instantiates', () => {
    const exec = new executor.WorkflowExecutor({});
    assert(exec, 'Failed to create executor');
    assert(typeof exec.execute === 'function', 'Missing execute method');
    assert(typeof exec.cancelRun === 'function', 'Missing cancelRun method');
});

test('Executor parses Drawflow format', () => {
    const exec = new executor.WorkflowExecutor({});

    const drawflowData = {
        drawflow: {
            Home: {
                data: {
                    '1': { name: 'start', class: 'start', pos_x: 100, pos_y: 100, data: {} },
                    '2': { name: 'click_element', pos_x: 200, pos_y: 100, data: { selector: '#btn' } }
                }
            }
        }
    };

    const nodes = exec._parseNodes(drawflowData);
    assert(nodes.length === 2, `Expected 2 nodes, got ${nodes.length}`);
    assert(nodes[0].type === 'start', 'First node should be start');
});

// ==================== MANAGER TESTS ====================
console.log('\n[6] Manager Tests');
console.log('-'.repeat(40));

test('WebhookManager registers webhooks', () => {
    const mgr = new managers.WebhookManager({ baseUrl: 'http://test.com' });
    const url = mgr.register('run123', 'wh456');
    assert(url.includes('run123'), 'URL should contain runId');
    assert(url.includes('wh456'), 'URL should contain webhookId');
});

test('WebhookManager receives data', () => {
    const mgr = new managers.WebhookManager();
    mgr.register('run1', 'wh1');
    mgr.receive('run1', 'wh1', { otp: '123456' });

    const data = mgr.check('run1', 'wh1');
    assert(data?.otp === '123456', 'Should receive webhook data');
});

test('HumanInteractionManager tracks completions', () => {
    const mgr = new managers.HumanInteractionManager();

    mgr.requestHumanAction('run1', { message: 'Click CAPTCHA' });
    assert(!mgr.isCompleted('run1'), 'Should not be completed initially');

    mgr.complete('run1');
    assert(mgr.isCompleted('run1'), 'Should be completed after complete()');
});

// ==================== NODE CATALOG TESTS ====================
console.log('\n[7] Node Catalog Tests');
console.log('-'.repeat(40));

test('getNodeCatalog returns categorized nodes', () => {
    const catalog = nodes.getNodeCatalog();

    assert(catalog.Browser, 'Missing Browser category');
    assert(catalog.Logic, 'Missing Logic category');
    assert(catalog.Data, 'Missing Data category');
    assert(catalog.Network || catalog.Action, 'Missing Network/Action category');
});

test('Node catalog has correct structure', () => {
    const catalog = nodes.getNodeCatalog();

    for (const [category, categoryNodes] of Object.entries(catalog)) {
        for (const node of categoryNodes) {
            assert(node.id, `Node in ${category} missing id`);
            assert(node.name, `Node in ${category} missing name`);
            assert(node.riskLevel, `Node in ${category} missing riskLevel`);
        }
    }
});

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log(`AUTOMATION ENGINE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Please review and fix issues.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed! Automation Engine v2 is ready.');
}
