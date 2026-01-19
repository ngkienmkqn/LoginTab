const { app } = require('electron');
const path = require('path');

// Minimal Assert function
function assert(condition, msg) {
    if (!condition) throw new Error(msg);
    console.log('  PASS: ' + msg);
}

app.whenReady().then(async () => {
    try {
        console.log('\n--- STARTING SECURITY CORE TESTS ---\n');

        // Import Manager
        const { SecurityManager, ERRORS } = require('../src/managers/SecurityManager');
        const security = new SecurityManager();

        // --- TEST 1: RBAC ---
        console.log('[Test 1] RBAC Capability Check');

        // Staff -> Browser Basic (OK)
        assert(security.checkCapability('staff', ['browser:basic']) === true, 'Staff has browser:basic');

        // Staff -> System Shell (FAIL)
        assert(security.checkCapability('staff', ['system:shell']) === false, 'Staff denied system:shell');

        // Super Admin -> System Shell (OK)
        // Note: Admin in my implementation doesn't have system:shell, only Super Admin (*)
        assert(security.checkCapability('super_admin', ['system:shell']) === true, 'Super Admin has *');


        // --- TEST 2: Path Validation ---
        console.log('\n[Test 2] Path Sandbox');

        const tempPath = app.getPath('temp'); // e.g. C:\Users\Admin\AppData\Local\Temp
        const safeFile = path.join(tempPath, 'safe_test_file.txt');

        // Valid Path
        const resolved = security.validatePath(safeFile);
        assert(resolved === path.normalize(safeFile), 'Temp file allowed');

        // Traversal Attack
        try {
            // We pass a path that resolves to outside (e.g. C:\Windows via traversal)
            // Note: Since we use path.join, the input to validatePath ALREADY has .. resolved if we passed it purely via join?
            // Actually, path.join resolves .. 

            // If we want to test '..' detection, we must pass it explicitly in the string
            security.validatePath(tempPath + path.sep + '..' + path.sep + 'secret.txt');
            throw new Error('Traversal detection failed');
        } catch (e) {
            assert(e.message.includes(ERRORS.ERR_SANDBOX_TRAVERSAL) || e.message.includes(ERRORS.ERR_SANDBOX_OUTSIDE_ROOT), 'Traversal/Outside Root blocked: ' + e.message);
        }

        // --- TEST 3: Network Egress ---
        console.log('\n[Test 3] Network Fortress');

        // Public Website (Google) -> OK
        try {
            await security.checkNetworkEgress('https://www.google.com');
            console.log('  PASS: Google.com allowed');
        } catch (e) {
            throw new Error('Google.com blocked unexpectedly: ' + e.message);
        }

        // Localhost -> FAIL
        try {
            await security.checkNetworkEgress('http://localhost:8080');
            throw new Error('Localhost should be blocked');
        } catch (e) {
            assert(e.message.includes(ERRORS.ERR_EGRESS_DENYLIST) || e.message.includes(ERRORS.ERR_EGRESS_DNS_PRIVATE_IP), 'Localhost blocked: ' + e.message);
        }

        // IPv6 Loopback -> FAIL
        try {
            await security.checkNetworkEgress('http://[::1]');
            throw new Error('IPv6 Loopback should be blocked');
        } catch (e) {
            assert(e.message.includes(ERRORS.ERR_EGRESS_DENYLIST), 'IPv6 ::1 blocked');
        }

        // --- TEST 4: Sensitive Mapping ---
        console.log('\n[Test 4] Sensitive Mapping');
        // Define a mock node schema
        const mockSchema = {
            id: 'cookie_get',
            outputs: {
                'cookieValue': { sensitive: true },
                'status': { sensitive: false }
            }
        };

        // Valid Mapping
        security.validateSensitiveMapping(mockSchema, 'status', 'outputMapping');
        console.log('  PASS: Non-sensitive mapping allowed');

        // Invalid Mapping
        try {
            security.validateSensitiveMapping(mockSchema, 'cookieValue', 'outputMapping');
            throw new Error('Sensitive mapping should fail');
        } catch (e) {
            assert(e.message.includes(ERRORS.ERR_SENSITIVE_MAPPING_VIOLATION), 'Sensitive mapping blocked');
        }

        console.log('\n--- ALL TESTS PASSED SUCCESSFULLY ---');
        app.quit();
        process.exit(0);

    } catch (err) {
        console.error('\n*** TEST FAILED ***');
        console.error(err);
        app.quit();
        process.exit(1);
    }
});
