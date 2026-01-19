/**
 * OPTION 4: Camoufox - Firefox Anti-Detect (Open-Source GoLogin Alternative)
 * This patches at C++ level like GoLogin does
 */

const { launch } = require('camoufox');

async function testCamoufox() {
    console.log('🦊 OPTION 4: Camoufox (Open-Source Anti-Detect)\n');
    console.log('This is Firefox-based with C++ level patches - like GoLogin!\n');

    let browser;

    try {
        console.log('🚀 Launching Camoufox...');
        browser = await launch({
            headless: false
        });

        console.log('✅ Camoufox launched successfully!\n');

        const page = await browser.newPage();

        // Navigate
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', { waitUntil: 'domcontentloaded' });

        console.log('⏳ Waiting 25 seconds for full analysis...\n');
        await page.waitForTimeout(25000);

        // Extract results
        const results = await page.evaluate(() => {
            const text = document.body.innerText;

            const statusMatch = text.match(/trustworthy|unreliable|suspicious/i);
            const status = statusMatch ? statusMatch[0] : 'Unknown';

            // Check individual sections
            const browserSection = text.match(/BROWSER[^]+?(?=LOCATION|$)/i)?.[0] || '';
            const locationSection = text.match(/LOCATION[^]+?(?=IP|$)/i)?.[0] || '';
            const hardwareSection = text.match(/HARDWARE[^]+?(?=SOFTWARE|$)/i)?.[0] || '';
            const softwareSection = text.match(/SOFTWARE[^]+?(?=Extended|$)/i)?.[0] || '';

            return {
                status,
                sections: {
                    browser: !browserSection.toLowerCase().includes('unusual') && !browserSection.toLowerCase().includes('outdated'),
                    location: locationSection.toLowerCase().includes('ordinary') || locationSection.toLowerCase().includes('real'),
                    hardware: !hardwareSection.toLowerCase().includes('masking') && !hardwareSection.toLowerCase().includes('breaking'),
                    software: !softwareSection.toLowerCase().includes('suspicious')
                },
                browserText: browserSection.substring(0, 150),
                hardwareText: hardwareSection.substring(0, 150)
            };
        });

        // Display
        console.log('═'.repeat(70));
        console.log('CAMOUFOX TEST RESULTS');
        console.log('═'.repeat(70));
        console.log(`Overall Status: ${results.status.toUpperCase()}`);
        console.log('');
        console.log('Section Breakdown:');
        console.log(`  BROWSER:   ${results.sections.browser ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  LOCATION:  ${results.sections.location ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  HARDWARE:  ${results.sections.hardware ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  SOFTWARE:  ${results.sections.software ? '✅ PASS' : '❌ FAIL'}`);
        console.log('═'.repeat(70));

        if (results.browserText) {
            console.log('\nBROWSER Section excerpt:');
            console.log(results.browserText);
        }

        if (results.hardwareText) {
            console.log('\nHARDWARE Section excerpt:');
            console.log(results.hardwareText);
        }

        // Screenshot
        const screenshotPath = `camoufox_iphey_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\n📸 Screenshot: ${screenshotPath}`);

        if (results.status.toLowerCase().includes('trust')) {
            console.log('\n🎉🎉🎉 SUCCESS! Camoufox achieves Trustworthy status! 🎉🎉🎉');
            console.log('   This is the WINNING solution!');
        } else {
            console.log(`\n⚠️  Status: ${results.status}`);
            console.log('   Analyzing what was detected...');
        }

        console.log('\n⏸️  Browser stays open for 15 seconds...');
        await page.waitForTimeout(15000);

        await browser.close();

        return {
            method: 'Camoufox (Firefox)',
            status: results.status,
            sections: results.sections,
            screenshot: screenshotPath
        };

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        if (browser) await browser.close();
        return {
            method: 'Camoufox (Firefox)',
            status: 'ERROR',
            error: error.message
        };
    }
}

testCamoufox()
    .then(result => {
        console.log('\n' + '═'.repeat(70));
        console.log('CAMOUFOX TEST COMPLETE');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
