const { app } = require('electron');
const path = require('path');
const { SecurityManager } = require('../src/managers/SecurityManager');

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
    console.log('  PASS: ' + msg);
}

// FORCE MOCK: Inject into require cache to intercept 'src/database/mysql'
const mockDbPath = path.resolve(__dirname, '../src/database/mysql.js');
require.cache[mockDbPath] = {
    id: mockDbPath,
    filename: mockDbPath,
    loaded: true,
    exports: {
        getPool: async () => ({
            execute: async (q, p) => {
                console.log(`    DB EXEC: ${q} [${p}]`);
                return [{ affectedRows: 1 }, []];
            }
        })
    }
};

app.whenReady().then(async () => {
    try {
        console.log('\n--- STARTING PHASE 3 NODE TESTS ---\n');

        const AutomationManager = require('../src/managers/AutomationManager');

        // Mock BrowserManager
        const am = new AutomationManager({});
        const security = am.security;

        // Context
        const context = {
            role: 'staff', // Staff has read, logic, but NO db:delete, NO network:external
            security: security
        };

        // 1. Loop Data
        console.log('[Test 1] Loop Data');
        const loopNode = am.nodeRegistry.get('loop_data');
        const resLoop = await loopNode.impl({ data: [1, 2, 3], maxIterations: 10 }, context);
        assert(resLoop.data.length === 3, 'Loop data preserved');

        // 2. HTTP Request (RBAC + Egress)
        console.log('\n[Test 2] HTTP Request (Security)');
        const httpNode = am.nodeRegistry.get('http_request');

        // Staff missing 'network:external' (based on legacy role map in SecurityManager)
        // Check checkCapability logic in SecurityManager: 
        // Staff: ['browser:basic', 'logic:*', 'data:local']
        // HTTP requires: 'network:external'

        // Note: Basic RBAC check happens in Manager usually, but for granular test, 
        // if implementor added manual check? 
        // UPDATE: The http_request node logic assumes capability is checked by registry or manager BEFORE execution. 
        // But let's check validation logic: Egress.

        // Let's grant capability for the test context
        context.role = 'admin'; // Admin has network:external

        // Egress Check (Localhost)
        try {
            await httpNode.impl({ url: 'http://localhost:3000' }, context);
            throw new Error('Egress should fail');
        } catch (e) {
            assert(e.code === 'ERR_EGRESS_DENYLIST' || e.message.includes('ERR_EGRESS'), 'Egress Localhost blocked');
        }

        // 3. DB Query (Safety + RBAC)
        console.log('\n[Test 3] DB Query');
        const dbNode = am.nodeRegistry.get('db_query');

        // Test: Safe Select (Admin has db:read)
        await dbNode.impl({ operation: 'SELECT', table: 'users', where: { id: 1 } }, context);
        console.log('  PASS: Select executed');

        // Test: Unsafe Delete (Empty Where)
        try {
            context.role = 'super_admin'; // Super Admin has db:delete
            await dbNode.impl({ operation: 'DELETE', table: 'users', where: {} }, context);
            throw new Error('Unsafe Delete should fail');
        } catch (e) {
            assert(e.message.includes('ERR_DB_EMPTY_WHERE'), 'Unsafe DELETE blocked');
        }

        // Test: RBAC Deny
        context.role = 'staff'; // Staff missing db:delete
        try {
            await dbNode.impl({ operation: 'DELETE', table: 'users', where: { id: 1 } }, context);
            throw new Error('RBAC should fail');
        } catch (e) {
            assert(e.message.includes('missing capability'), 'RBAC denied staff delete');
        }

        console.log('\n--- ALL PHASE 3 TESTS PASSED ---');
        app.quit();
        process.exit(0);

    } catch (err) {
        console.error('\n*** TEST FAILED ***');
        console.error(err);
        app.quit();
        process.exit(1);
    }
});
