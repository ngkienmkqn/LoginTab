// Mock Electron FIRST
const path = require('path');
const mockElectron = {
    ipcMain: { handle: () => { } },
    app: {
        getPath: () => path.join(process.cwd(), 'temp_test_data'),
        getAppPath: () => process.cwd()
    }
};
require.cache[require.resolve('electron')] = { exports: mockElectron };

const assert = require('assert');
const { AutomationManager } = require('../src/managers/AutomationManager'); // Direct class? No, module.exports = Class
// Correct import
const AutomationManagerClass = require('../src/managers/AutomationManager');
const dbSelect = require('../src/nodes/data/db_select');
const dbWrite = require('../src/nodes/data/db_write');
const dbDelete = require('../src/nodes/data/db_delete');

// Mock DB
const mockPool = {
    execute: async (query, params) => {
        console.log(`    DB EXEC: ${query} [${params}]`);
        return [{ affectedRows: 1, insertId: 100, length: 1 }, []]; // Mock Result
    }
};
require.cache[require.resolve('../src/database/mysql')] = {
    getPool: async () => mockPool
};

async function runTests() {
    console.log('--- STARTING SECURITY HARDENING TESTS ---');

    console.log('[Test 1] DB Nodes Integrity');
    // Test DB Delete Safety
    try {
        await dbDelete.impl({ table: 'users', where: {} }, { role: 'super_admin', security: { checkCapability: () => true } });
        assert.fail('Should have thrown ERR_DB_EMPTY_WHERE');
    } catch (e) {
        assert(e.message.includes('WHERE'), 'Blocked empty DELETE');
        console.log('  PASS: Blocked empty DELETE');
    }

    // Test DB Update Safety
    try {
        await dbWrite.impl({ operation: 'UPDATE', table: 'users', data: { status: 'banned' }, where: {} }, { role: 'super_admin', security: { checkCapability: () => true } });
        assert.fail('Should have thrown ERR_DB_EMPTY_WHERE');
    } catch (e) {
        assert(e.message.includes('WHERE'), 'Blocked empty UPDATE');
        console.log('  PASS: Blocked empty UPDATE');
    }

    console.log('[Test 2] Registry Scrubbing');
    const manager = new AutomationManagerClass({});

    // Inject a fake sensitive node to test scrubbing logic (since real nodes might not have sensitive defaults set yet)
    manager.registerNode({
        id: 'test_sensitive',
        name: 'Test',
        inputs: {
            password: { type: 'string', sensitive: true, default: 'SECRET_VALUE' },
            public: { type: 'string', default: 'PUBLIC_VALUE' }
        },
        capabilities: []
    }, () => { });

    const registry = manager.getRegistryJson();
    const testNode = registry.find(n => n.id === 'test_sensitive');

    assert.strictEqual(testNode.inputs.password.default, undefined, 'Sensitive default scrubbed');
    assert.strictEqual(testNode.inputs.public.default, 'PUBLIC_VALUE', 'Public default preserved');
    console.log('  PASS: Registry masked sensitive defaults');


    console.log('[Test 3] DB Node Split Verification');
    const selectNode = registry.find(n => n.id === 'db_select');
    assert(selectNode, 'db_select registered');
    assert(registry.find(n => n.id === 'db_write'), 'db_write registered');
    assert(registry.find(n => n.id === 'db_delete'), 'db_delete registered');
    // Ensure old db_query is GONE (we deleted the file, but AutomationManager loads all in directory. 
    // If we deleted the file, it shouldn't load.
    assert(!registry.find(n => n.id === 'db_query'), 'db_query should be gone');

    console.log('  PASS: DB Nodes split correctly');

    console.log('--- ALL TESTS PASSED ---');
}

runTests().catch(e => {
    console.error('FAILED:', e);
    process.exit(1);
});
