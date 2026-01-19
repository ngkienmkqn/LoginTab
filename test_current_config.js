/**
 * Test Current BrowserManager Configuration (Isolated)
 * This script tests the EXACT configuration from BrowserManager.js
 * to verify if the issue is with the config or with Electron/session caching
 */

const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const path = require('path');

// EXACT SETUP FROM BROWSERMANAGER.JS
const stealth = StealthPlugin();
puppeteer.use(stealth);

async function testCurrentConfig() {
    console.log('🧪 Testing Current BrowserManager Config (Isolated)\n');

    const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    // EXACT ARGS FROM BROWSERMANAGER.JS (latest version)
    const args = [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--disable-save-password-bubble',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-popup-blocking',
        '--disable-notifications',
        '--window-size=1920,1080',
        '--lang=vi-VN'
    ];

    // EXACT FILTER FROM BROWSERMANAGER.JS
    const finalArgs = args.filter(a => !a.includes('AutomationControlled'));

    console.log('📋 Final Launch Args:');
    finalArgs.forEach(arg => console.log(`   ${arg}`));
    console.log('');

    // FRESH TEMP PROFILE (to avoid session caching)
    const tempUserDataDir = path.join(__dirname, 'temp_test_profile');
    await fs.remove(tempUserDataDir); // Clean slate
    await fs.ensureDir(tempUserDataDir);

    console.log('🚀 Launching browser with EXACT BrowserManager config...\n');

    const browser = await puppeteer.launch({
        executablePath,
        headless: false,
        defaultViewport: null,
        userDataDir: tempUserDataDir,
        args: finalArgs,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: true // EXACT MATCH: true (not array)
    });

    const page = await browser.newPage();

    console.log('📡 Navigating to iphey.com...\n');
    await page.goto('https://iphey.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    console.log('⏳ Waiting 20 seconds for IPHey to load...\n');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Check for red banner error
    const hasErrorBanner = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('unsupported') || text.includes('không được hỗ trợ');
    });

    // Check if content loaded
    const hasFingerprint = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('webgl') || text.includes('canvas') || text.includes('trustworthy');
    });

    // Take screenshot
    const screenshotPath = path.join(__dirname, `test_current_config_${Date.now()}.png`);
    await page.screenshot({
        path: screenshotPath,
        fullPage: true
    });

    // Result
    console.log('═'.repeat(70));
    console.log('RESULT:');
    console.log('═'.repeat(70));
    console.log(`  ❌ Red Banner Error: ${hasErrorBanner ? 'YES (BAD)' : 'NO (GOOD)'}`);
    console.log(`  ✅ Fingerprint Data Visible: ${hasFingerprint ? 'YES (GOOD)' : 'NO (BAD)'}`);
    console.log(`  📸 Screenshot: ${screenshotPath}`);
    console.log('═'.repeat(70));

    if (!hasErrorBanner && hasFingerprint) {
        console.log('\n✅ SUCCESS! Config works in isolation.');
        console.log('   → Issue is likely SESSION CACHING in Electron app.');
        console.log('   → Try deleting old session folders in app.');
    } else if (hasErrorBanner) {
        console.log('\n❌ FAILED! Red banner still appears.');
        console.log('   → Issue is with the Stealth Plugin itself.');
        console.log('   → May need to try different anti-detect method.');
    } else {
        console.log('\n⚠️  PARTIAL: No error banner but no data loaded either.');
        console.log('   → IPHey may be hanging for a different reason.');
    }

    console.log('\nKeeping browser open for 10 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    await browser.close();
    await fs.remove(tempUserDataDir); // Cleanup
    console.log('\n✓ Test complete. Browser closed.');
}

testCurrentConfig().catch(console.error);
