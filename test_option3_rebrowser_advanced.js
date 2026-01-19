/**
 * OPTION 3: Rebrowser with Advanced Config
 * Adding mouse movement simulation and timing randomization
 */

const { connect } = require('puppeteer-real-browser');

async function testRebrowserAdvanced() {
    console.log('🔬 OPTION 3: Rebrowser with Advanced Config\n');

    let browser, page;

    try {
        console.log('🚀 Launching Rebrowser with full stealth config...');
        const response = await connect({
            headless: false,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ],
            turnstile: true,
            disableXvfb: true,
            customConfig: {
                userDataDir: undefined
            },
            plugins: {
                // Enable all evasion plugins
                userAgent: true,
                plugins: true,
                navigator: true,
                webgl: true
            }
        });

        browser = response.browser;
        page = response.page;
        console.log('✅ Rebrowser launched with advanced config\n');

        // Navigate
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', { waitUntil: 'domcontentloaded' });

        // Simulate human behavior - random mouse movements
        console.log('🖱️  Simulating mouse movements...');
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * 1000) + 100;
            const y = Math.floor(Math.random() * 600) + 100;
            await page.mouse.move(x, y, { steps: 10 });
            await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
        }

        console.log('⏳ Waiting 20 seconds for analysis...\n');
        await new Promise(r => setTimeout(r, 20000));

        // Extract status
        const bodyText = await page.evaluate(() => document.body.innerText);
        const status = bodyText.match(/trustworthy|unreliable|suspicious/i)?.[0] || 'Unknown';

        console.log(`Result: ${status.toUpperCase()}`);

        // Screenshot
        const path = `rebrowser_advanced_${Date.now()}.png`;
        await page.screenshot({ path, fullPage: true });
        console.log(`📸 Screenshot: ${path}\n`);

        await new Promise(r => setTimeout(r, 5000));
        await browser.close();

        return { method: 'Rebrowser Advanced', status, screenshot: path };

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
        return { method: 'Rebrowser Advanced', status: 'ERROR', error: error.message };
    }
}

testRebrowserAdvanced()
    .then(result => {
        console.log('═'.repeat(70));
        console.log('REBROWSER ADVANCED TEST COMPLETE');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
