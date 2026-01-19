const { app } = require('electron');
const path = require('path');

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
    console.log('  PASS: ' + msg);
}

app.whenReady().then(async () => {
    try {
        console.log('\n--- STARTING PHASE 2 NODE TESTS ---\n');

        const AutomationManager = require('../src/managers/AutomationManager');
        const am = new AutomationManager({});

        // Mock Context
        const mockPage = {
            waitForSelector: async () => true, // Always find
            $eval: async () => 'Extracted Text', // Mock text
            select: async () => ['opt1'],
            $: async () => ({ uploadFile: async () => { } }),
            url: () => 'http://example.com'
        };

        const context = {
            role: 'super_admin',
            page: mockPage,
            security: am.security
        };

        // 1. Get Text
        console.log('[Test 1] Get Text');
        const getText = am.nodeRegistry.get('get_text');
        const resText = await getText.impl({ selector: '.target' }, context);
        assert(resText.text === 'Extracted Text', 'Context extraction worked');

        // 2. Element Exists (Exists)
        console.log('[Test 2] Element Exists');
        const elExists = am.nodeRegistry.get('element_exists');
        const resExist = await elExists.impl({ selector: '.box' }, context);
        assert(resExist.exists === true, 'Element found');

        // 3. Upload File (Security Check)
        console.log('[Test 3] Upload File (Sandbox)');
        const upload = am.nodeRegistry.get('upload_file');
        const tempFile = path.join(app.getPath('temp'), 'safe.tx');

        // Should Pass
        await upload.impl({ selector: '#upload', filePath: tempFile }, context);
        console.log('  PASS: Safe file allowed');

        // Should Fail Traversal
        try {
            await upload.impl({ selector: '#upload', filePath: path.join(app.getPath('temp'), '../unsafe.txt') }, context);
            throw new Error('Traversal should fail');
        } catch (e) {
            assert(e.message.includes('ERR_SANDBOX'), 'Traversal blocked: ' + e.message);
        }

        console.log('\n--- ALL PHASE 2 TESTS PASSED ---');
        app.quit();
        process.exit(0);

    } catch (err) {
        console.error('\n*** TEST FAILED ***');
        console.error(err);
        app.quit();
        process.exit(1);
    }
});
