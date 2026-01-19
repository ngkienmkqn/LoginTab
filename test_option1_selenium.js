/**
 * OPTION 1: Undetected-ChromeDriver (Selenium)
 * This uses a different patching approach than Puppeteer
 */

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

async function testSelenium() {
    console.log('🔬 OPTION 1: Undetected-ChromeDriver (Selenium)\n');

    let driver;

    try {
        const options = new chrome.Options();
        options.addArguments('--no-first-run');
        options.addArguments('--no-default-browser-check');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--window-size=1920,1080');
        options.excludeSwitches('enable-automation');
        options.setUserPreferences({ 'credentials_enable_service': false });

        console.log('🚀 Launching Chrome via Selenium...');
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        console.log('✅ Selenium launched\n');

        // Navigate
        console.log('🌐 Navigating to iphey.com...');
        await driver.get('https://iphey.com');

        console.log('⏳ Waiting 20 seconds...\n');
        await driver.sleep(20000);

        // Extract status
        const bodyText = await driver.findElement(By.tagName('body')).getText();
        const status = bodyText.match(/trustworthy|unreliable|suspicious/i)?.[0] || 'Unknown';

        console.log(`Result: ${status.toUpperCase()}`);

        // Screenshot
        const screenshot = await driver.takeScreenshot();
        const path = `selenium_iphey_${Date.now()}.png`;
        fs.writeFileSync(path, screenshot, 'base64');
        console.log(`📸 Screenshot: ${path}\n`);

        await driver.sleep(5000);
        await driver.quit();

        return { method: 'Selenium', status, screenshot: path };

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (driver) await driver.quit();
        return { method: 'Selenium', status: 'ERROR', error: error.message };
    }
}

testSelenium()
    .then(result => {
        console.log('═'.repeat(70));
        console.log('SELENIUM TEST COMPLETE');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
