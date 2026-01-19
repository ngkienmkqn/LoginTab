/**
 * IPHey Deep Analysis - No Proxy
 * Test to see what EXACTLY IPHey is detecting
 */

const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');

// Apply Stealth
const stealth = StealthPlugin();
puppeteer.use(stealth);

async function deepAnalysis() {
    console.log('🔬 IPHey Deep Analysis - NO PROXY\n');

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

        // MINIMAL args - exactly like real Chrome
        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--exclude-switches=enable-automation'
        ];

        console.log('🚀 Launching Chrome with MINIMAL evasion...\n');
        browser = await puppeteer.launch({
            executablePath,
            headless: false,
            args,
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();

        // Check what's visible BEFORE going to IPHey
        console.log('🔍 Pre-flight checks:\n');
        const preChecks = await page.evaluate(() => {
            return {
                webdriver: navigator.webdriver,
                automation: window.navigator.automation,
                permissions: typeof navigator.permissions,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                languages: navigator.languages,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                cdcVars: Object.keys(window).filter(k => k.startsWith('cdc_'))
            };
        });

        console.log('  navigator.webdriver:', preChecks.webdriver);
        console.log('  window.navigator.automation:', preChecks.automation);
        console.log('  CDC variables:', preChecks.cdcVars.length > 0 ? preChecks.cdcVars : 'None ✅');
        console.log('  User-Agent:', preChecks.userAgent.substring(0, 50) + '...');
        console.log('  Platform:', preChecks.platform);
        console.log('  Languages:', preChecks.languages);
        console.log('  Hardware Concurrency:', preChecks.hardwareConcurrency);
        console.log('  Device Memory:', preChecks.deviceMemory, 'GB\n');

        // Navigate to IPHey
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('⏳ Waiting 20 seconds for full analysis...\n');
        await new Promise(resolve => setTimeout(resolve, 20000));

        // Extract DETAILED results
        const results = await page.evaluate(() => {
            const text = document.body.innerText;

            // Status
            const statusElem = document.querySelector('[class*="status"], [class*="trust"]');
            const status = statusElem ? statusElem.textContent : text.match(/trustworthy|unreliable|suspicious/i)?.[0] || 'Unknown';

            // Individual sections
            const browser = text.match(/BROWSER[^]+?(?=LOCATION|$)/i)?.[0] || '';
            const location = text.match(/LOCATION[^]+?(?=IP ADDRESS|$)/i)?.[0] || '';
            const hardware = text.match(/HARDWARE[^]+?(?=SOFTWARE|$)/i)?.[0] || '';
            const software = text.match(/SOFTWARE[^]+?(?=Extended check|$)/i)?.[0] || '';

            return {
                status,
                sections: {
                    browser: browser.toLowerCase().includes('real') || browser.toLowerCase().includes('trustworthy'),
                    location: location.toLowerCase().includes('ordinary') || location.toLowerCase().includes('trustworthy'),
                    hardware: hardware.toLowerCase().includes('match') || hardware.toLowerCase().includes('trustworthy'),
                    software: software.toLowerCase().includes('suspicious') ? false : true
                },
                rawBrowser: browser.substring(0, 200),
                rawLocation: location.substring(0, 200),
                rawHardware: hardware.substring(0, 200),
                rawSoftware: software.substring(0, 200)
            };
        });

        // Display results
        console.log('═'.repeat(70));
        console.log('IPHey ANALYSIS RESULTS');
        console.log('═'.repeat(70));
        console.log(`Overall Status: ${results.status.toUpperCase()}`);
        console.log('');
        console.log('Section Breakdown:');
        console.log(`  BROWSER:   ${results.sections.browser ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  LOCATION:  ${results.sections.location ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  HARDWARE:  ${results.sections.hardware ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  SOFTWARE:  ${results.sections.software ? '✅ PASS' : '❌ FAIL'}`);
        console.log('═'.repeat(70));

        // Detailed failure reasons
        if (!results.sections.browser) {
            console.log('\n❌ BROWSER SECTION FAILED:');
            console.log(results.rawBrowser);
        }

        if (!results.sections.hardware) {
            console.log('\n❌ HARDWARE SECTION FAILED:');
            console.log(results.rawHardware);
        }

        if (!results.sections.software) {
            console.log('\n❌ SOFTWARE SECTION FAILED:');
            console.log(results.rawSoftware);
        }

        // Screenshot
        const screenshotPath = `iphey_analysis_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\n📸 Screenshot: ${screenshotPath}`);

        // Post-analysis checks
        console.log('\n🔍 Post-analysis checks:\n');
        const postChecks = await page.evaluate(() => {
            // Check what IPHey might be detecting
            const checks = {
                webdriver: navigator.webdriver,
                chromeRuntime: !!window.chrome?.runtime,
                permissions: typeof navigator.permissions,
                plugins: navigator.plugins.length,
                mimeTypes: navigator.mimeTypes.length,
                cdcVars: Object.keys(window).filter(k => k.startsWith('cdc_')),
                // Check for Puppeteer signatures
                __puppeteer: !!window.__puppeteer,
                _Selenium: !!window._Selenium,
                callPhantom: !!window.callPhantom,
                // Check prototype modifications
                prototypeModified: Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver') !== undefined
            };

            return checks;
        });

        console.log('  Puppeteer markers:', postChecks.__puppeteer ? '❌ DETECTED' : '✅ Clean');
        console.log('  Selenium markers:', postChecks._Selenium ? '❌ DETECTED' : '✅ Clean');
        console.log('  Phantom markers:', postChecks.callPhantom ? '❌ DETECTED' : '✅ Clean');
        console.log('  Navigator.webdriver prototype:', postChecks.prototypeModified ? '⚠️  Modified' : '✅ Original');
        console.log('  chrome.runtime:', postChecks.chromeRuntime ? '✅ Present' : '❌ Missing');
        console.log('  Plugins:', postChecks.plugins);
        console.log('  MimeTypes:', postChecks.mimeTypes);

        console.log('\n⏸️  Browser stays open for 15 seconds. LOOK CLOSELY AT IPHEY!\n');
        await new Promise(resolve => setTimeout(resolve, 15000));

        await browser.close();

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('SUMMARY');
        console.log('═'.repeat(70));

        if (results.status.toLowerCase().includes('trust')) {
            console.log('✅ SUCCESS! IPHey shows Trustworthy.');
            console.log('   Current config is production-ready.');
        } else {
            console.log('❌ FAILED. IPHey detected automation.');
            console.log('\nPossible causes:');
            console.log('  1. Stealth Plugin patches are detectable');
            console.log('  2. Chrome launch flags create fingerprint mismatch');
            console.log('  3. Navigator prototype modifications visible');
            console.log('  4. Timing of script injection detectable');
            console.log('\nSolution: Requires PATCHED CHROMIUM binary (rebrowser-patches)');
        }
        console.log('═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
    }
}

deepAnalysis().catch(console.error);
