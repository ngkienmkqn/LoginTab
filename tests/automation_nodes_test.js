const { app } = require('electron');
const path = require('path');

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
    console.log('  PASS: ' + msg);
}

app.whenReady().then(async () => {
    try {
        console.log('\n--- STARTING NODE EXECUTION TESTS ---\n');

        const AutomationManager = require('../src/managers/AutomationManager');
        const BrowserManager = require('../src/managers/BrowserManager'); // Mock if needed

        // Mock BrowserManager
        const mockBrowserManager = { launchBrowser: () => { } };

        const am = new AutomationManager(mockBrowserManager);

        // 1. Verify Node Loading
        console.log('[Test 1] Node Registration');
        const nodes = Array.from(am.nodeRegistry.keys());
        console.log('  Loaded Nodes:', nodes);

        assert(nodes.includes('condition'), 'Logic Node "condition" loaded');
        assert(nodes.includes('open_url'), 'Browser Node "open_url" loaded');
        assert(nodes.includes('click_element'), 'Browser Node "click_element" loaded');

        // 2. Execute Condition Node (True)
        console.log('\n[Test 2] Execute "condition" (True)');
        const context = {
            role: 'super_admin',
            variables: { x: 10 },
            security: am.security // Pass security manager
        };

        const nodeDef = am.nodeRegistry.get('condition');
        const resultTrue = await nodeDef.impl({ expression: "x > 5" }, context);
        assert(resultTrue.result === true, '10 > 5 is true');

        // 3. Execute Condition Node (False)
        console.log('\n[Test 3] Execute "condition" (False)');
        const resultFalse = await nodeDef.impl({ expression: "x < 5" }, context);
        assert(resultFalse.result === false, '10 < 5 is false');

        // 4. Schema Validation (Missing Input)
        console.log('\n[Test 4] Schema Validation');
        try {
            await nodeDef.impl({}, context); // Missing expression
            throw new Error('Should have failed validation');
        } catch (e) {
            assert(e.message.includes('Missing required input'), 'Validation caught missing input: ' + e.message);
        }

        console.log('\n--- ALL NODE TESTS PASSED SUCCESSFULLY ---');
        app.quit();
        process.exit(0);

    } catch (err) {
        console.error('\n*** TEST FAILED ***');
        console.error(err);
        app.quit();
        process.exit(1);
    }
});
