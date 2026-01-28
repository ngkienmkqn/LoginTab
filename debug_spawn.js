const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

(async () => {
    try {
        const ironPath = path.join(__dirname, 'resources', 'iron', 'IronPortable.exe');
        // Point CWD specifically to the folder containing IronPortable.exe
        const ironCwd = path.dirname(ironPath);
        const userDataDir = path.join(__dirname, 'temp_debug_session_spawn');

        console.log('Spawning IronPortable from:', ironPath);
        console.log('CWD:', ironCwd);

        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--no-sandbox',
            '--remote-debugging-port=9222',
            `--user-data-dir=${userDataDir}`,
            'about:blank'
        ];

        const chromeProcess = spawn(ironPath, args, {
            cwd: ironCwd, // CRITICAL FIX
            detached: true,
            stdio: 'ignore'
        });

        console.log('Process spawned, PID:', chromeProcess.pid);

        // Wait for browser to initialize
        await new Promise(r => setTimeout(r, 3000));

        console.log('Attempting to connect...');
        const browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });

        console.log('CONNECTED via Spawn + Connect!');
        const pages = await browser.pages();
        console.log(`Open pages: ${pages.length}`);

        await pages[0].goto('https://example.com');
        console.log('Navigated to example.com');

        console.log('Closing browser...');
        browser.close();

    } catch (e) {
        console.error('FAILED:', e);
    }
})();
