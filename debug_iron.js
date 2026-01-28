const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
    try {
        const executablePath = path.join(__dirname, 'resources', 'iron', 'Iron', 'iron.exe');
        const userDataDir = path.join(__dirname, 'temp_debug_session');

        console.log('Testing Launch with:');
        console.log('Exe:', executablePath);
        console.log('Data:', userDataDir);

        if (!fs.existsSync(executablePath)) throw new Error('Exe not found!');

        const browser = await puppeteer.launch({
            executablePath,
            headless: false,
            defaultViewport: null,
            userDataDir,
            ignoreHTTPSErrors: false, // Keeping false as per fix
            // ignoreDefaultArgs: ['--enable-automation'],
            pipe: false,
            dumpio: false, // Turn off noise for now
            args: [
                '--no-first-run',
                '--no-sandbox',
                '--remote-debugging-port=9222', // Standard Puppeteer port
                `--user-data-dir=${userDataDir}`
            ]
        });

        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        await page.goto('https://google.com');
        console.log('Navigated to Google');

        setTimeout(async () => {
            await browser.close();
            console.log('Closed.');
        }, 5000);

    } catch (e) {
        console.error('CRASH:', e);
    }
})();
