/**
 * OPTION 2: Playwright with Stealth
 * Modern automation library with different detection signatures
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('playwright-extra-plugin-stealth')();
chromium.use(StealthPlugin);

async function testPlaywright() {
    console.log('🔬 OPTION 2: Playwright with Stealth Plugin\n');

    let browser;

    try {
        console.log('🚀 Launching Chromium via Playwright...');
        browser = await chromium.launch({
            headless: false,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        console.log('✅ Playwright launched\n');

        // Navigate
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', { waitUntil: 'domcontentloaded' });

        console.log('⏳ Waiting 20 seconds...\n');
        await page.waitForTimeout(20000);

        // Extract status
        const bodyText = await page.textContent('body');
        const status = bodyText.match(/trustworthy|unreliable|suspicious/i)?.[0] || 'Unknown';

        console.log(`Result: ${status.toUpperCase()}`);

        // Screenshot
        const path = `playwright_iphey_${Date.now()}.png`;
        await page.screenshot({ path, fullPage: true });
        console.log(`📸 Screenshot: ${path}\n`);

        await page.waitForTimeout(5000);
        await browser.close();

        return { method: 'Playwright', status, screenshot: path };

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
        return { method: 'Playwright', status: 'ERROR', error: error.message };
    }
}

testPlaywright()
    .then(result => {
        console.log('═'.repeat(70));
        console.log('PLAYWRIGHT TEST COMPLETE');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
