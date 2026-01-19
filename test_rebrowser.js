/**
 * Test Rebrowser-Patches on IPHey
 * This should achieve "Trustworthy" status
 */

const { connect } = require('puppeteer-real-browser');

async function testRebrowser() {
    console.log('🚀 Testing Rebrowser-Patches on IPHey\n');

    let browser, page;

    try {
        console.log('🔧 Launching patched Chromium...');
        const response = await connect({
            headless: false,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--window-size=1920,1080'
            ],
            turnstile: true,
            disableXvfb: true,
            customConfig: {},
        });

        browser = response.browser;
        page = response.page;

        console.log('✅ Rebrowser launched successfully!\n');

        // Navigate to IPHey
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('⏳ Waiting 20 seconds for analysis...\n');
        await new Promise(resolve => setTimeout(resolve, 20000));

        // Extract results
        const results = await page.evaluate(() => {
            const text = document.body.innerText;

            const statusMatch = text.match(/trustworthy|unreliable|suspicious/i);
            const status = statusMatch ? statusMatch[0] : 'Unknown';

            // Check sections
            const browser = text.match(/BROWSER[^]+?(?=LOCATION|$)/i)?.[0] || '';
            const location = text.match(/LOCATION[^]+?(?=IP|$)/i)?.[0] || '';
            const hardware = text.match(/HARDWARE[^]+?(?=SOFTWARE|$)/i)?.[0] || '';
            const software = text.match(/SOFTWARE[^]+?(?=Extended|$)/i)?.[0] || '';

            return {
                status,
                browserOK: browser.toLowerCase().includes('real') || !browser.toLowerCase().includes('unusual'),
                locationOK: location.toLowerCase().includes('ordinary') || location.toLowerCase().includes('real'),
                hardwareOK: hardware.toLowerCase().includes('match') || !hardware.toLowerCase().includes('masking'),
                softwareOK: !software.toLowerCase().includes('suspicious')
            };
        });

        // Display
        console.log('═'.repeat(70));
        console.log('REBROWSER TEST RESULTS');
        console.log('═'.repeat(70));
        console.log(`Overall Status: ${results.status.toUpperCase()}`);
        console.log('');
        console.log('Section Breakdown:');
        console.log(`  BROWSER:   ${results.browserOK ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  LOCATION:  ${results.locationOK ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  HARDWARE:  ${results.hardwareOK ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  SOFTWARE:  ${results.softwareOK ? '✅ PASS' : '❌ FAIL'}`);
        console.log('═'.repeat(70));

        // Screenshot
        const screenshotPath = `rebrowser_iphey_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\n📸 Screenshot: ${screenshotPath}`);

        if (results.status.toLowerCase().includes('trust')) {
            console.log('\n🎉 SUCCESS! Rebrowser achieves Trustworthy status!');
            console.log('   This is production-ready for Google, Tazapay, etc.');
        } else {
            console.log('\n⚠️  Still showing as Unreliable.');
            console.log('   Further analysis needed.');
        }

        console.log('\n⏸️  Browser stays open for 15 seconds...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        await browser.close();

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
    }
}

testRebrowser().catch(console.error);
