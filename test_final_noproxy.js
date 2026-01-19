/**
 * Final IPHey Test - Current App Config (No Proxy)
 * Testing with Stealth Plugin + AutomationControlled flag
 */

const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');

// Apply Stealth
const stealth = StealthPlugin();
puppeteer.use(stealth);

async function finalTest() {
    console.log('🎯 FINAL TEST - Current App Config (No Proxy)\n');

    let browser;

    try {
        // Find Chrome
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ];

        let executablePath = null;
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }

        if (!executablePath) throw new Error('Chrome not found!');

        // Exact args from BrowserManager.js
        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-save-password-bubble',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-popup-blocking',
            '--disable-notifications',
            '--window-size=1920,1080',
            '--exclude-switches=enable-automation'
        ];

        console.log('🚀 Launching with app config...');
        console.log('   Stealth Plugin: ENABLED');
        console.log('   AutomationControlled: DISABLED');
        console.log('   Proxy: NONE\n');

        browser = await puppeteer.launch({
            executablePath,
            headless: false,
            args,
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();

        // Navigate
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('⏳ Waiting 25 seconds for full analysis...\n');
        await new Promise(resolve => setTimeout(resolve, 25000));

        // Extract detailed results
        const results = await page.evaluate(() => {
            const text = document.body.innerText;

            // Overall status
            const status = text.match(/trustworthy|unreliable|suspicious/i)?.[0] || 'Unknown';

            // Individual sections - look for green checkmarks or red X
            const sections = {
                browser: !text.includes('BROWSER') || !text.toLowerCase().includes('unusual'),
                location: text.includes('LOCATION') && !text.toLowerCase().includes('spoofing'),
                ipAddress: text.includes('IP ADDRESS') || text.includes('IP'),
                hardware: !text.toLowerCase().includes('masking') && !text.toLowerCase().includes('breaking'),
                software: !text.toLowerCase().includes('suspicious network')
            };

            // Get section text for debugging
            const browserText = text.match(/BROWSER[^]+?(?=LOCATION|$)/i)?.[0]?.substring(0, 200) || 'Not found';
            const hardwareText = text.match(/HARDWARE[^]+?(?=SOFTWARE|$)/i)?.[0]?.substring(0, 200) || 'Not found';
            const softwareText = text.match(/SOFTWARE[^]+?(?=Extended|How|$)/i)?.[0]?.substring(0, 200) || 'Not found';

            return {
                status,
                sections,
                browserText,
                hardwareText,
                softwareText
            };
        });

        // Count greens
        const greenCount = Object.values(results.sections).filter(Boolean).length;

        // Display
        console.log('═'.repeat(70));
        console.log('FINAL TEST RESULTS');
        console.log('═'.repeat(70));
        console.log(`Overall Status: ${results.status.toUpperCase()}`);
        console.log('');
        console.log('Section Breakdown:');
        console.log(`  BROWSER:    ${results.sections.browser ? '✅ GREEN' : '❌ RED'}`);
        console.log(`  LOCATION:   ${results.sections.location ? '✅ GREEN' : '❌ RED'}`);
        console.log(`  IP ADDRESS: ${results.sections.ipAddress ? '✅ GREEN' : '❌ RED'}`);
        console.log(`  HARDWARE:   ${results.sections.hardware ? '✅ GREEN' : '❌ RED'}`);
        console.log(`  SOFTWARE:   ${results.sections.software ? '✅ GREEN' : '❌ RED'}`);
        console.log('');
        console.log(`GREEN SECTIONS: ${greenCount}/5`);
        console.log('═'.repeat(70));

        // Show problematic sections
        if (!results.sections.browser) {
            console.log('\n❌ BROWSER section text:');
            console.log(results.browserText);
        }
        if (!results.sections.hardware) {
            console.log('\n❌ HARDWARE section text:');
            console.log(results.hardwareText);
        }
        if (!results.sections.software) {
            console.log('\n❌ SOFTWARE section text:');
            console.log(results.softwareText);
        }

        // Screenshot
        const screenshotPath = `final_test_noproxy_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\n📸 Screenshot: ${screenshotPath}`);

        // Verdict
        console.log('\n' + '═'.repeat(70));
        console.log('VERDICT');
        console.log('═'.repeat(70));

        if (greenCount >= 4) {
            console.log('🎉 EXCELLENT! 4+ sections green - production ready!');
        } else if (greenCount >= 3) {
            console.log('✅ GOOD! 3+ sections green - acceptable for production');
        } else {
            console.log('⚠️  Only', greenCount, 'sections green - needs investigation');
        }

        console.log('\n⏸️  Keeping browser open for 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        await browser.close();

        return {
            status: results.status,
            greenCount,
            sections: results.sections,
            screenshot: screenshotPath
        };

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
        return { status: 'ERROR', error: error.message };
    }
}

finalTest()
    .then(result => {
        console.log('\n' + '═'.repeat(70));
        console.log('TEST COMPLETE');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
