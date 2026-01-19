/**
 * Automated IPHey Compatibility Test Suite
 * Tests different evasion configurations to find what works
 */

const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const path = require('path');

// Test results directory
const RESULTS_DIR = path.join(__dirname, 'iphey_test_results');
fs.ensureDirSync(RESULTS_DIR);

// Find Chrome executable
function findChrome() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`✓ Found browser: ${p}`);
            return p;
        }
    }
    throw new Error('Chrome/Edge not found!');
}

// Test configurations
const TEST_CONFIGS = [
    {
        name: 'Test 1 - Pure Puppeteer (No Evasions)',
        useStealth: false,
        useCustomScript: false,
        description: 'Baseline test with zero modifications'
    },
    {
        name: 'Test 2 - Only AutomationControlled Flag',
        useStealth: false,
        useCustomScript: false,
        extraArgs: ['--disable-blink-features=AutomationControlled'],
        description: 'Single flag to hide navigator.webdriver'
    },
    {
        name: 'Test 3 - Stealth Plugin Only',
        useStealth: true,
        useCustomScript: false,
        description: 'puppeteer-extra-plugin-stealth alone'
    },
    {
        name: 'Test 4 - Stealth + AutomationControlled',
        useStealth: true,
        useCustomScript: false,
        extraArgs: ['--disable-blink-features=AutomationControlled'],
        description: 'Stealth plugin with webdriver flag'
    },
    {
        name: 'Test 5 - Custom Script Only (No Stealth)',
        useStealth: false,
        useCustomScript: true,
        description: 'PuppeteerEvasion without Stealth plugin'
    },
];

// Minimal custom evasion script (just the essentials)
function getMinimalEvasionScript() {
    return `
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        
        // Remove CDP signatures
        const cdcProps = ['cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise', 'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'];
        cdcProps.forEach(prop => { try { delete window[prop]; } catch(e) {} });
        
        // Mock chrome.runtime
        if (!window.chrome) window.chrome = {};
        if (!window.chrome.runtime) {
            window.chrome.runtime = {
                connect: () => {},
                sendMessage: () => {},
                onMessage: { addListener: () => {}, removeListener: () => {} }
            };
        }
    `;
}

async function runTest(config, index) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${config.name}`);
    console.log(`${config.description}`);
    console.log(`${'='.repeat(70)}\n`);

    let browser;
    try {
        const executablePath = findChrome();

        // Base args
        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            '--disable-notifications',
            '--window-size=1920,1080',
        ];

        // Add extra args if specified
        if (config.extraArgs) {
            args.push(...config.extraArgs);
        }

        // Configure Stealth if enabled
        if (config.useStealth) {
            const stealth = StealthPlugin();
            puppeteer.use(stealth);
            console.log('✓ Stealth Plugin enabled');
        }

        // Launch browser
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            executablePath,
            headless: false,
            ignoreDefaultArgs: true,
            args
        });

        const page = await browser.newPage();

        // Inject custom script if enabled
        if (config.useCustomScript) {
            await page.evaluateOnNewDocument(getMinimalEvasionScript());
            console.log('✓ Custom evasion script injected');
        }

        // Navigate to IPHey
        console.log('Navigating to iphey.com...');
        await page.goto('https://iphey.com', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('Waiting 15 seconds for IPHey to fully load...');
        // Wait for IPHey to load (it's slow)
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Check if page loaded (look for main container)
        const hasContent = await page.evaluate(() => {
            return document.body.innerText.length > 100;
        });

        // Take screenshot
        const screenshotPath = path.join(RESULTS_DIR, `test_${index + 1}_${Date.now()}.png`);
        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });

        console.log(`✓ Screenshot saved: ${screenshotPath}`);

        // Check for spinner (infinite loading)
        const hasSpinner = await page.evaluate(() => {
            const spinners = Array.from(document.querySelectorAll('*')).filter(el => {
                const styles = window.getComputedStyle(el);
                return styles.animation && styles.animation.includes('spin');
            });
            return spinners.length > 0;
        });

        // Check if fingerprint data is visible
        const hasFingerprint = await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            return text.includes('webgl') || text.includes('canvas') || text.includes('trustworthy');
        });

        // Result
        const result = {
            config: config.name,
            loaded: hasContent,
            hasSpinner: hasSpinner,
            hasFingerprint: hasFingerprint,
            screenshot: screenshotPath,
            status: hasFingerprint ? '✅ SUCCESS' : (hasSpinner ? '⚠️ LOADING' : '❌ FAILED')
        };

        console.log('\nRESULT:');
        console.log(`  Status: ${result.status}`);
        console.log(`  Page Loaded: ${hasContent ? 'Yes' : 'No'}`);
        console.log(`  Has Spinner: ${hasSpinner ? 'Yes' : 'No'}`);
        console.log(`  Fingerprint Visible: ${hasFingerprint ? 'Yes' : 'No'}`);

        // Keep browser open for 5 seconds so user can see
        console.log('Keeping browser open for 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        await browser.close();
        return result;

    } catch (error) {
        console.error(`❌ Test failed with error:`, error.message);
        if (browser) await browser.close();
        return {
            config: config.name,
            status: '❌ ERROR',
            error: error.message
        };
    }
}

async function runAllTests() {
    console.log('🧪 IPHey Compatibility Test Suite');
    console.log(`Results will be saved to: ${RESULTS_DIR}\n`);

    const results = [];

    for (let i = 0; i < TEST_CONFIGS.length; i++) {
        const result = await runTest(TEST_CONFIGS[i], i);
        results.push(result);

        // Wait between tests
        if (i < TEST_CONFIGS.length - 1) {
            console.log('\nWaiting 2 seconds before next test...\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(70) + '\n');

    results.forEach((result, i) => {
        console.log(`${i + 1}. ${result.config}`);
        console.log(`   ${result.status}`);
        if (result.screenshot) {
            console.log(`   Screenshot: ${result.screenshot}`);
        }
        console.log('');
    });

    // Find best config
    const successfulTests = results.filter(r => r.status.includes('SUCCESS'));
    if (successfulTests.length > 0) {
        console.log('✅ WINNING CONFIGURATION:');
        console.log(`   ${successfulTests[0].config}`);
        console.log('\n📸 Check screenshots to verify fingerprint data is displayed correctly.');
    } else {
        console.log('❌ No configuration successfully loaded IPHey fingerprint data.');
        console.log('   This indicates IPHey requires binary-level modifications (custom Chromium).');
    }

    // Save results to JSON
    const resultsPath = path.join(RESULTS_DIR, 'test_results.json');
    await fs.writeJSON(resultsPath, results, { spaces: 2 });
    console.log(`\n📄 Full results saved to: ${resultsPath}`);
}

// Run tests
runAllTests().catch(console.error);
