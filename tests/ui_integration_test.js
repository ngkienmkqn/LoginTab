// Mock Electron
const path = require('path');
const mockElectron = {
    ipcMain: { handle: () => { } },
    app: {
        getPath: () => path.join(process.cwd(), 'temp_test_data'),
        getAppPath: () => process.cwd()
    }
};
require.cache[require.resolve('electron')] = { exports: mockElectron };

const AutomationManager = require('../src/managers/AutomationManager');
const assert = require('assert');
const mockBrowserManager = {};

async function testRegistryExport() {
    console.log('Testing Registry Export...');
    const manager = new AutomationManager(mockBrowserManager);

    // Wait for nodes to load (NodeLoader is sync but filesystem might be async? NodeLoader seems sync in index.js)
    // Actually NodeLoader uses readdirSync.

    const registry = manager.getRegistryJson();

    console.log(`Registry size: ${registry.length}`);
    assert(registry.length > 5, 'Should have core nodes');

    // Check http_request
    const httpNode = registry.find(n => n.id === 'http_request');
    assert(httpNode, 'http_request node missing');
    assert.strictEqual(httpNode.category, 'Network');
    // BaseNode usually sets category.
    // Let's check http_request implementation or BaseNode.

    // Check Inputs
    assert(httpNode.inputs.url, 'http_request should have url input');

    console.log('PASSED: Registry Export');
}

testRegistryExport().catch(e => {
    console.error('FAILED:', e);
    process.exit(1);
});
