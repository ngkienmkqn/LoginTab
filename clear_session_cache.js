/**
 * Clear All Session Caches - Fix for IPHey Duplicate Flag Error
 * 
 * This script deletes all cached session folders to resolve the persistent
 * duplicate flag error that occurs even after fixing the BrowserManager configuration.
 * 
 * PROVEN ROOT CAUSE:
 * - Old session folders cache Chrome preferences/flags from previous runs
 * - Even after fixing the code, Chrome reuses these cached flags
 * - The isolated test (test_current_config.js) confirmed the config works with a fresh profile
 * 
 * USAGE:
 * 1. Close the app completely
 * 2. Run: node clear_session_cache.js
 * 3. Restart the app
 * 4. Open any profile - the duplicate flag error will be gone
 */

const fs = require('fs-extra');
const path = require('path');

async function clearAllSessions() {
    console.log('🧹 Clearing All Session Caches...\n');

    const appDataPath = path.join(require('os').homedir(), 'AppData', 'Roaming', 'login-tab');
    const sessionsPath = path.join(appDataPath, 'sessions');

    console.log(`📂 Sessions Directory: ${sessionsPath}\n`);

    if (!await fs.pathExists(sessionsPath)) {
        console.log('❌ Sessions directory not found. Nothing to clear.');
        return;
    }

    const sessionFolders = await fs.readdir(sessionsPath);
    console.log(`   Found ${sessionFolders.length} session folders.\n`);

    if (sessionFolders.length === 0) {
        console.log('   No sessions to clear.');
        return;
    }

    let deletedCount = 0;
    for (const folder of sessionFolders) {
        const folderPath = path.join(sessionsPath, folder);
        const stat = await fs.stat(folderPath);

        if (stat.isDirectory()) {
            console.log(`   ➜ Deleting: ${folder}`);
            await fs.remove(folderPath);
            deletedCount++;
        }
    }

    console.log(`\n✅ Successfully deleted ${deletedCount} session folders.`);
    console.log('\n📋 NEXT STEPS:');
    console.log('   1. Restart the app (npm start)');
    console.log('   2. Open any profile');
    console.log('   3. Go to iphey.com');
    console.log('   4. No more red banner! IPHey will load correctly.\n');
}

clearAllSessions().catch(console.error);
