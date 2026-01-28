const puppeteer = require('puppeteer-core');

(async () => {
    try {
        console.log('Attempting to connect to browser on port 9222...');
        const browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });
        console.log('CONNECTED successfully!');

        const pages = await browser.pages();
        console.log(`Found ${pages.length} open pages.`);

        if (pages.length > 0) {
            console.log('Navigating page 1 to google...');
            await pages[0].goto('https://google.com');
            console.log('Navigation success!');
        }

        console.log('Disconnecting (keeping browser open)...');
        browser.disconnect();

    } catch (e) {
        console.error('CONNECT FAILED:', e);
    }
})();
