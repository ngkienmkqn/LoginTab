const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

(async () => {
    try {
        const portableExe = path.join(__dirname, 'resources', 'iron', 'IronPortable.exe');
        const userDataDir = path.join(__dirname, 'temp_debug_portable');

        console.log('Testing PORTABLE Launch with:');
        console.log('Exe:', portableExe);
        console.log('Data:', userDataDir);

        if (!fs.existsSync(portableExe)) throw new Error('Portable exe not found!');

        // 1. Try launching with spawn first to see if it even opens
        console.log('--- Spawning Process ---');
        const child = spawn(portableExe, [
            `--user-data-dir=${userDataDir}`,
            '--no-first-run',
            '--remote-debugging-port=9222',
            'https://google.com'
        ], {
            detached: false,
            stdio: 'inherit'
        });

        console.log('Spawned PID:', child.pid);

        child.on('exit', (code) => console.log('Child Exit Code:', code));
        child.on('error', (err) => console.error('Child Error:', err));

        // 2. Try Puppeteer Connect (Wait 5s)
        console.log('Waiting 5s for browser to warm up...');
        await new Promise(r => setTimeout(r, 5000));

        try {
            const browser = await puppeteer.connect({
                browserURL: 'http://127.0.0.1:9222'
            });
            console.log('SUCCESS: Puppeteer Connected to Portable!');
            await browser.close();
        } catch (e) {
            console.log('Puppeteer Connect Failed (Expected on Windows N?):', e.message);
        }

    } catch (e) {
        console.error('CRASH:', e);
    }
})();
