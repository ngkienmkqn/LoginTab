const puppeteer = require('puppeteer-core');
// const { addExtra } = require('puppeteer-extra');
// const puppeteer = addExtra(puppeteerCore);
// PURE PUPPETEER CORE: Fixes ERR_REQUIRE_ASYNC_MODULE definitively
// Stealth Plugin REMOVED to prevent ERR_REQUIRE_ASYNC_MODULE in Electron

// WINNING CONFIG: Manual Flags Only + IgnoreDefaultArgs: true
// (No plugins used)
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { spawn } = require('child_process');
const net = require('net');

// ... (imports)

// ... (inside launchBrowser)

// ... (imports)
const ProxyChain = require('proxy-chain');
const SyncManager = require('./SyncManager');
const { TOTP } = require('otplib');
const crypto = require('crypto');
const FingerprintGenerator = require('../utils/FingerprintGenerator');
const PuppeteerEvasion = require('../utils/PuppeteerEvasion');
const { getPool } = require('../database/mysql');

// Manually configure crypto for otplib v13+
const authenticator = new TOTP({
    createDigest: (algorithm, content) => crypto.createHash(algorithm).update(content).digest(),
    createRandomBytes: (size) => crypto.randomBytes(size)
});

class BrowserManager {
    // Track active browser instances by account ID
    static activeBrowsers = new Map();

    /**
     * Force close all active browser instances
     */
    static async closeAll() {
        console.log(`[BrowserManager] Closing all ${BrowserManager.activeBrowsers.size} active browsers...`);
        const closePromises = [];

        for (const [id, browser] of BrowserManager.activeBrowsers.entries()) {
            try {
                if (browser.close) {
                    closePromises.push(browser.close());
                } else if (browser.process) {
                    process.kill(browser.process().pid);
                }
            } catch (e) {
                console.error(`[BrowserManager] Error closing browser ${id}:`, e);
            }
        }

        await Promise.allSettled(closePromises);
        BrowserManager.activeBrowsers.clear();
        console.log('[BrowserManager] All browsers closed.');
    }



    /**
     * INJECT profile data into Portable location (Windows N)
     */
    static async injectProfile(source, target) {
        console.log(`[BrowserManager] Injecting Profile: ${source} -> ${target}`);
        try {
            await fs.emptyDir(target); // WIPE standard location
            if (await fs.pathExists(source)) {
                await fs.copy(source, target);
                console.log('[BrowserManager] ✓ Injection Complete');
            } else {
                console.log('[BrowserManager] No existing session to inject (Fresh Start)');
            }
        } catch (e) {
            console.error('[BrowserManager] Injection Failed:', e);
            throw new Error('Profile Injection Failed: ' + e.message);
        }
    }

    /**
     * EXTRACT profile data from Portable location (Windows N)
     */
    static async extractProfile(source, target) {
        console.log(`[BrowserManager] Extracting Profile: ${source} -> ${target}`);
        const maxRetries = 5;

        for (let i = 1; i <= maxRetries; i++) {
            try {
                await fs.ensureDir(target);
                // Use graceful-fs or simple retry
                await fs.copy(source, target, { overwrite: true, errorOnExist: false });

                // Only wipe AFTER successful copy
                try { await fs.emptyDir(source); } catch (e) { }

                console.log('[BrowserManager] ✓ Extraction Complete & Cleaned');
                return; // Success
            } catch (e) {
                if (e.code === 'EBUSY' || e.code === 'EPERM') {
                    console.log(`[BrowserManager] File Locked (Attempt ${i}/${maxRetries}). Waiting 2s...`);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    console.error('[BrowserManager] Extraction Failed (Fatal):', e);
                    break;
                }
            }
        }
        console.error(`[BrowserManager] Extraction Failed after ${maxRetries} attempts.`);
    }

    static async launchProfile(account, mode = null) {
        // [Browser Detection Strategy]
        // 1. System Chrome/Edge (Primary for Windows N / Stability)
        // 2. Fallback to Mac standard paths if on macOS

        let executablePath = null;
        let browserType = 'chrome'; // Default to chrome args

        if (process.platform === 'win32') {
            executablePath = await BrowserManager.detectSystemBrowser();
            if (!executablePath) {
                console.error('[BrowserManager] No System Browser Found!');
                throw new Error('No supported browser found (Chrome/Edge). Please install Google Chrome.');
            }
            console.log(`[BrowserManager] ✓ Found System Browser: ${executablePath}`);
        } else if (process.platform === 'darwin') {
            // macOS Logic (Keep existing or switch to system chrome?)
            // Let's stick to System Chrome for Mac too for consistency in v2.5.0 revert
            executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            if (!fs.existsSync(executablePath)) {
                executablePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
            }
            if (!fs.existsSync(executablePath)) {
                // Fallback to Iron just in case? No, sticking to Plan.
                throw new Error('Google Chrome or Edge not found.');
            }
        }

        // Remove Injection Logic (Not needed for System Browser with properly separated --user-data-dir)
        const userDataDir = path.join(app.getPath('userData'), 'sessions', account.id);
        await fs.ensureDir(userDataDir);

        // [Cloud Sync] Restore Download Logic
        console.log(`[BrowserManager] Syncing session for: ${account.name}`);
        await SyncManager.downloadSession(account.id);
        // Note: System Chrome manages LocalStorage/Cookies in userDataDir, 
        // but downloadSession ensures we have a baseline if this is a fresh machine.

        // Check if browser already open for this account
        if (BrowserManager.activeBrowsers.has(account.id)) {
            const existingBrowser = BrowserManager.activeBrowsers.get(account.id);
            try {
                const pages = await existingBrowser.pages();
                if (pages.length > 0) {
                    console.log(`[BrowserManager] ⚠ Account already open, focusing existing browser: ${account.name}`);
                    await pages[0].bringToFront();
                    return existingBrowser;
                }
            } catch (e) {
                console.log(`[BrowserManager] Existing browser disconnected, creating new instance`);
                BrowserManager.activeBrowsers.delete(account.id);
            }
        }

        console.log(`[BrowserManager] DEBUG: System Chrome Mode for: ${account.id}`);

        // Get Free Port
        const debugPort = await BrowserManager.getFreePort();
        console.log(`[BrowserManager] Assigned Debug Port: ${debugPort}`);

        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-save-password-bubble',
            '--password-store=basic',
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${userDataDir}`,
            '--window-size=1920,1080',
            '--disable-gpu-shader-disk-cache',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ];

        // Fingerprint / Proxy Args would go here if we were doing stealth,
        // but for System Chrome revert, we keep it simple or minimal.
        // Let's add Proxy back if present.
        let anonymizedProxyUrl = null;
        if (account.proxy_config) {
            try {
                let proxy = typeof account.proxy_config === 'string'
                    ? JSON.parse(account.proxy_config)
                    : account.proxy_config;

                if (proxy && proxy.host) {
                    anonymizedProxyUrl = await ProxyChain.anonymizeProxy(`http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`);
                    args.push(`--proxy-server=${anonymizedProxyUrl}`);
                    console.log('[Proxy] Anonymized Proxy injected.');
                }
            } catch (e) { console.error('[Proxy] Error parsing proxy:', e); }
        }

        try {
            console.log(`[BrowserManager] Launching Puppeteer with System Browser: ${executablePath}`);
            const browser = await puppeteer.launch({
                executablePath: executablePath,
                headless: false,
                defaultViewport: null,
                userDataDir: userDataDir,
                ignoreHTTPSErrors: true,
                ignoreDefaultArgs: ['--enable-automation'],
                args: args,
                pipe: false // Use WebSocket
            });

            // Store instance
            BrowserManager.activeBrowsers.set(account.id, browser);

            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Sync Session (Cookies/Storage)
            // Note: System Chrome might manage this itself, but injecting our DB session is still good.
            // Wait, v2.5.0 likely did this.
            // Let's restore simple Sync logic (inject cookies if missing).
            // Actually, we should just let Chrome handle its profile if we are using --user-data-dir natively.
            // But if user expects Sync *from DB*, we should probably inject.
            // Let's assume Native Profile usage for now (persistence via disk).
            // But we should UPDATE DB on exit.

            if (account.loginUrl) {
                try { await page.goto(account.loginUrl); } catch (e) { }
            }

            // Cleanup Listener
            const browserProcess = browser.process();
            if (browserProcess) {
                browserProcess.on('exit', async (code) => {
                    console.log(`[BrowserManager] System Chrome exited (Code ${code}). Syncing...`);
                    // We can call cleanupSession or simplified version
                    // Since we are not detecting exit reliably on Windows N iron, but this is CHROME.
                    // Chrome usually exits fine.
                    await BrowserManager.cleanupSession(account.id, null, userDataDir, anonymizedProxyUrl);
                });
            }

            browser.on('disconnected', () => {
                BrowserManager.activeBrowsers.delete(account.id);
            });

            return browser;

        } catch (err) {
            console.error('[BrowserManager] LAUNCH FAILED:', err);
            throw err;
        }
    }

    static async detectSystemBrowser() {
        const potentialPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
        ];

        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    }

    static async launchProfile_OLD(account, mode = null) { // Renaming old one to inactive

        // [Windows N] SINGLE INSTANCE ENFORCEMENT
        // Because of Portable Wrapper shared data, we must prevent multiple instances.
        if (process.platform === 'win32') {
            const portablePath = path.join(app.getAppPath(), 'resources', 'iron', 'IronPortable.exe');
            // If using Portable, enforce single instance
            if (fs.existsSync(portablePath)) {
                if (BrowserManager.activeBrowsers.size > 0) {
                    // Check if it's the SAME account (focus it)
                    if (BrowserManager.activeBrowsers.has(account.id)) {
                        // Fallthrough to existing logic will handle focus
                    } else {
                        throw new Error('WINDOWS N LIMITATION: Only one profile can be open at a time (Shared Portable Data). Please close the active profile first.');
                    }
                }
            }
        }

        // Check if browser already open for this account
        if (BrowserManager.activeBrowsers.has(account.id)) {
            const existingBrowser = BrowserManager.activeBrowsers.get(account.id);
            try {
                // Check if browser is still connected
                const pages = await existingBrowser.pages();
                if (pages.length > 0) {
                    console.log(`[BrowserManager] ⚠ Account already open, focusing existing browser: ${account.name}`);
                    // Focus the first page
                    await pages[0].bringToFront();
                    return existingBrowser;
                }
            } catch (e) {
                // Browser disconnected, remove from map
                console.log(`[BrowserManager] Existing browser disconnected, creating new instance`);
                BrowserManager.activeBrowsers.delete(account.id);
            }
        }

        console.log('[BrowserManager] Loaded v2-ProxyChain (Forced Update)');
        console.log(`[BrowserManager] Syncing session for: ${account.name}`);

        // Normalize Auth config & Clean Secret
        if (account.auth) {
            account.auth.twoFactorSecret = account.auth.twoFactorSecret || account.auth.secret2FA;
            if (account.auth.twoFactorSecret) {
                // Remove spaces and force uppercase
                account.auth.twoFactorSecret = account.auth.twoFactorSecret.replace(/\s+/g, '').toUpperCase();
            }
        }

        // ================================================================
        // FINGERPRINT MANAGEMENT - Persistent Device Identity
        // ================================================================
        console.log('[Fingerprint] DEBUG - account.fingerprint:', account.fingerprint ? 'EXISTS' : 'NULL');

        if (!account.fingerprint || !account.fingerprint.userAgent) {
            // Generate NEW fingerprint if missing or incomplete
            console.log('[Fingerprint] Generating new fingerprint for account...');
            account.fingerprint = FingerprintGenerator.generateFingerprint(account.id);

            // Save to database
            const pool = await getPool();
            await pool.query(
                'UPDATE accounts SET fingerprint_config = ? WHERE id = ?',
                [JSON.stringify(account.fingerprint), account.id]
            );
            console.log('[Fingerprint] ✓ Saved to database');
        } else {
            // Load existing fingerprint
            console.log('[Fingerprint] ✓ Loaded existing fingerprint from database');

            const isWinningConfig = FingerprintGenerator.isWinningConfig(account.fingerprint);

            // AUTO-UPGRADE FINGERPRINT (If not winning config)
            if (!isWinningConfig && account.fingerprint) {

                // FINGERPRINT LOCK: Disabled auto-upgrade to maintain session consistency
                // Tazapay and similar services validate fingerprint changes as suspicious activity
                // Once fingerprint is generated, it stays locked to prevent session invalidation
                /*
                if (!isWinningConfig) {
                    console.log('[Fingerprint] ⚠ NON-OPTIMAL FINGERPRINT DETECTED');
                    console.log(`[Fingerprint]   Current: ${account.fingerprint.resolution} / ${account.fingerprint.webglRenderer}`);
                }
                if (!hasOSFields) {
                    console.log('[Fingerprint] ⚠ OLD FINGERPRINT DETECTED (Missing OS-specific fields)');
                }
                console.log('[Fingerprint] ↻ UPGRADING to New Fingerprint (Winning Config + OS Consistency)...');
    
                // Get OS from account (stored in fingerprint_config.os or default to 'win')
                const os = account.fingerprint?.os || account.fingerprint_config?.os || 'win';
    
                // Regenerate (Generates ONLY winning config now)
                account.fingerprint = FingerprintGenerator.generateFingerprint(account.id, os);
    
                // Save immediately
                const pool = await getPool();
                await pool.query(
                    'UPDATE accounts SET fingerprint_config = ? WHERE id = ?',
                    [JSON.stringify(account.fingerprint), account.id]
                );
                console.log('[Fingerprint] ✓ Upgraded & Saved New Fingerprint');
                */
                console.log('[Fingerprint] 🔒 Fingerprint locked (no auto-upgrade)');

                if (account.fingerprint) {
                    console.log(`[Fingerprint]   Generated: ${account.fingerprint.generated} `);
                    console.log(`[Fingerprint]   Resolution: ${account.fingerprint.resolution} `);
                    console.log(`[Fingerprint]   WebGL: ${account.fingerprint.webglRenderer || 'Natural (Real)'} `);
                }
            }
        }

        // 1. Download session from MySQL before launch
        await SyncManager.downloadSession(account.id);
        const storageData = await SyncManager.downloadStorage(account.id);

        console.log(`[BrowserManager] Launching: ${account.name} (${account.id})`);
        console.log('[BrowserManager] DEBUG: Code Version -> Iron-Revert-v2 (Should force Direct Iron)');

        // v2.5.3: Cross-Platform Iron Support (Windows & macOS)
        let executablePath = null;
        let ironCwd = null;

        if (process.platform === 'darwin') {
            // macOS Logic
            const macStandardPath = '/Applications/Iron.app/Contents/MacOS/Iron';
            const macBundledPath = path.join(app.getAppPath(), 'resources', 'iron', 'Iron.app', 'Contents', 'MacOS', 'Iron');

            if (fs.existsSync(macBundledPath)) {
                executablePath = macBundledPath;
                ironCwd = path.dirname(executablePath);
                console.log('[BrowserManager] ✓ Found Bundled Iron (macOS)');
            } else if (fs.existsSync(macStandardPath)) {
                executablePath = macStandardPath;
                ironCwd = path.dirname(executablePath);
                console.log('[BrowserManager] ✓ Found Standard Iron (macOS)');
            } else {
                console.error('[BrowserManager] ❌ Iron Browser NOT FOUND on macOS.');
                throw new Error('Iron Browser not found. Please install in /Applications/Iron.app or resources/iron/');
            }
        } else {
            // Windows Logic (Direct Launch: Iron/iron.exe)
            // We bypass IronPortable.exe to ensure process isolation and correct exit tracking.
            // This enables Multi-Profile support and reliable Sync-on-Exit.

            const directPath = path.join(app.getAppPath(), 'resources', 'iron', 'Iron', 'iron.exe');
            const portablePath = path.join(app.getAppPath(), 'resources', 'iron', 'IronPortable.exe');

            if (fs.existsSync(portablePath)) {
                // Use IronPortable Wrapper (REQUIRED for Windows N to fix crashes)
                executablePath = portablePath;
                ironCwd = path.dirname(portablePath);
                console.log('[BrowserManager] ✓ Found IronPortable Wrapper (Preferred for Windows N)');

                // [Windows N] INJECT DATA
                // Copy session -> resources/iron/Profile
                const targetProfileDir = path.join(ironCwd, 'Profile');
                const userDataDir = path.join(app.getPath('userData'), 'sessions', account.id); // Valid source

                // Ensure source exists and inject
                await fs.ensureDir(userDataDir);
                await BrowserManager.injectProfile(userDataDir, targetProfileDir);

            } else if (fs.existsSync(directPath)) {
                // Fallback to Direct Iron if portable wrapper is missing
                executablePath = directPath;
                ironCwd = path.dirname(directPath);
                console.log('[BrowserManager] ⚠ Using Direct Iron (Legacy Mode)');
            } else {
                console.error('[BrowserManager] ❌ Iron Browser NOT FOUND.');
                throw new Error('Critical: Iron Browser executable not found. Please reinstall application.');
            }
        }

        if (!executablePath) throw new Error('Browser executable not found.');
        console.log(`[BrowserManager] ✓ Using Browser: ${executablePath}`);

        const userDataDir = path.join(app.getPath('userData'), 'sessions', account.id);
        await fs.ensureDir(userDataDir);

        // DISABLE PASSWORD SAVE POPUP (Edit Preferences File)
        try {
            const prefsDir = path.join(userDataDir, 'Default');
            await fs.ensureDir(prefsDir);
            const prefsPath = path.join(prefsDir, 'Preferences');

            let prefs = {};
            if (await fs.pathExists(prefsPath)) {
                try {
                    prefs = await fs.readJson(prefsPath);
                } catch (e) { console.warn('[Browser] Corrupt prefs, resetting.'); }
            }

            // Force disable password manager (Unconditional overwrite)
            prefs.credentials_enable_service = false;
            prefs.credentials_enable_autosignin = false;

            if (!prefs.profile) prefs.profile = {};
            prefs.profile.password_manager_enabled = false;

            await fs.writeJson(prefsPath, prefs);
            console.log('[Browser] Disabled Password Manager Popup via Preferences.');
        } catch (e) {
            console.warn('[Browser] Failed to patch preferences:', e);
        }

        // Get Free Port for Debugging
        const debugPort = await BrowserManager.getFreePort();
        console.log(`[BrowserManager] Assigned Debug Port: ${debugPort}`);

        const args = [
            '--test-type',
            '--ignore-certificate-errors',
            '--no-first-run',
            '--no-sandbox',
            `--remote-debugging-port=${debugPort}`
        ];

        // ALWAYS use isolated User Data Directory
        // Since we are launching Iron directly (or forcing Portable to behave), we must specify the profile path.
        // This ensures Multi-Profile concurrency works correctly.
        args.push(`--user-data-dir=${userDataDir}`);

        if (account.fingerprint && account.fingerprint.resolution) {
            args.push(`--window-size=${account.fingerprint.resolution.replace('x', ',')}`);
        } else {
            args.push('--start-maximized');
        }

        // User Agent from fingerprint (or default)
        // ALIGNMENT: Comment out UA override to use Real Browser UA (matches Test 3)
        /*
        if (account.fingerprint && account.fingerprint.userAgent) {
            args.push(`--user-agent=${account.fingerprint.userAgent}`);
        } else {
            // Fallback to latest Chrome if no fingerprint
            args.push(`--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`);
        }
        */

        args.push(`--lang=${account.fingerprint.language || 'en-US'}`); // Match fingerprint language
        // args.push('--exclude-switches=enable-automation'); // Redundant with ignoreDefaultArgs

        // TIMEZONE RANDOMIZATION (Compatible Zones)
        // Avoids static "Asia/Ho_Chi_Minh" flag for all accounts
        // Both are UTC+7, indistinguishable but changes the hash slightly
        const timezones = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Jakarta'];
        process.env.TZ = timezones[Math.floor(Math.random() * timezones.length)];

        let proxyExtensionPath = null;
        let anonymizedProxyUrl = null;







        if (account.proxy && account.proxy.host && account.proxy.port) {
            let type = (account.proxy.type || 'http').toLowerCase();
            let host = account.proxy.host;
            const port = account.proxy.port;
            const user = account.proxy.user;
            const pass = account.proxy.pass;

            if (host.includes(':') && !host.startsWith('[')) {
                host = `[${host}]`;
            }

            console.log(`[Proxy] Configuring ${type.toUpperCase()} Proxy via ProxyChain: ${host}:${port} `);
            let upstreamUrl = `${type}://${host}:${port}`;
            if (user && pass) {
                upstreamUrl = `${type}://${user}:${pass}@${host}:${port}`;
            }

            try {
                anonymizedProxyUrl = await ProxyChain.anonymizeProxy(upstreamUrl);
                console.log(`[Proxy] Bridge created: ${anonymizedProxyUrl} -> ${upstreamUrl}`);
                args.push(`--proxy-server=${anonymizedProxyUrl}`);
                args.push('--proxy-bypass-list=<-loopback>');

            } catch (err) {
                console.error('[Proxy] Failed to create proxy bridge:', err);
                throw new Error('Proxy Connection Failed: ' + err.message);
            }

        } else {
            console.log('[Proxy] Starting without proxy (Direct).');
        }

        // args.push('--disable-blink-features=AutomationControlled');
        // args.push('--no-sandbox'); // Moved up

        // UI & EXTENSION POLISH
        // args.push('--test-type'); // Moved to top for suppression effectiveness
        args.push('--disable-external-extensions'); // Blocks external/system extensions (McAfee, etc.)
        args.push('--disable-background-mode'); // CRITICAL: Ensures process exits when window closes (fixes Sync)
        args.push('--disable-background-networking');
        args.push('--disable-renderer-backgrounding');

        if (proxyExtensionPath) {
            args.push(`--disable-extensions-except=${proxyExtensionPath}`);
        } else {
            // If no proxy extension is needed, we can be more aggressive if desired
            // args.push('--disable-extensions');
        }

        // STABILITY FIXES (Cross-Platform)
        // Fix for Windows N (Missing Media Foundation) and general stability
        args.push('--disable-features=MediaFoundation');
        args.push('--disable-gpu-shader-disk-cache'); // Prevent some GPU artifacts
        // args.push('--disable-gpu'); // Uncomment if glitches persist

        console.log('[BrowserManager] Launch Args (Spawn Strategy):', args);



        // --- PROFILE INJECTION REMOVED ---
        // We now use Direct Launch with --user-data-dir, so native Chromium isolation handles this.
        // No need to copy/paste data to 'resources/iron/Profile' anymore.
        /*
        if (process.platform === 'win32' && executablePath.includes('IronPortable.exe')) {
             ... Logic Removed ...
        }
        */

        console.log(`[BrowserManager] Spawning: ${executablePath}`);
        console.log(`[BrowserManager] CWD: ${ironCwd}`);

        // SPAWN PROCESS
        const browserProcess = await BrowserManager.spawnBrowser(executablePath, args, ironCwd);

        // CONNECT VIA PUPPETEER
        let browser = null;
        let connectRetries = 10;

        while (connectRetries > 0) {
            try {
                console.log(`[BrowserManager] Connecting to port ${debugPort}... (${connectRetries})`);
                browser = await puppeteer.connect({
                    browserURL: `http://127.0.0.1:${debugPort}`,
                    defaultViewport: null
                });
                break; // Connected!
            } catch (e) {
                connectRetries--;
                if (connectRetries === 0) {
                    console.warn(`[BrowserManager] ⚠ AUTOMATION FAILED: Could not connect to port ${debugPort}.`);
                    console.warn(`[BrowserManager] Switching to MANUAL MODE (Sync-on-Exit) for: ${executablePath}`);

                    // FALLBACK: Manual Mode
                    // If IronPortable wrapper blocks the port, we assume it waits for exit.
                    // We attach the save logic to the process exit event.
                    browserProcess.on('exit', async (code) => {
                        console.log(`[BrowserManager] Manual Mode: Process exited with code ${code}. Syncing...`);
                        await BrowserManager.cleanupSession(account.id, portableProfilePath, userDataDir, anonymizedProxyUrl);
                    });

                    // We cannot return a puppeteer browser, but we must not throw to allow the user to browse.
                    // We return a "Dummy" object to preventing crashing, though automations will fail.

                    // ROBUST MANUAL MODE: Polling Watcher
                    // Windows N / Iron sometimes swallows the 'exit' event from spawn.
                    // We use manual PID polling to guarantee detection of browser closure.
                    const EventEmitter = require('events');
                    const manualEmitter = new EventEmitter();
                    const pid = browserProcess.pid;

                    console.log(`[BrowserManager] Watcher started for PID: ${pid}`);

                    const watcher = setInterval(() => {
                        try {
                            process.kill(pid, 0); // Check if running (throws if not)
                        } catch (e) {
                            clearInterval(watcher);
                            console.log(`[BrowserManager] Watcher: PID ${pid} gone. Triggering disconnect.`);
                            manualEmitter.emit('disconnected');
                        }
                    }, 1000);

                    const manualBrowser = {
                        ignoreHTTPSErrors: true,
                        pages: async () => [],
                        newPage: async () => { throw new Error('Automation unavailable in Manual Mode'); },
                        close: async () => { clearInterval(watcher); try { process.kill(pid); } catch (e) { } },
                        process: () => browserProcess,
                        isValid: true, // Marker
                        on: (event, handler) => {
                            if (event === 'disconnected') {
                                // Listen to our reliable polling emitter
                                manualEmitter.on('disconnected', handler);
                                // Also attach to process exit just in case (redundancy)
                                browserProcess.on('exit', () => manualEmitter.emit('disconnected'));
                            }
                            return manualBrowser;
                        },
                        once: (event, handler) => {
                            if (event === 'disconnected') {
                                manualEmitter.once('disconnected', handler);
                            }
                            return manualBrowser;
                        },
                        emit: (evt, ...pipeline) => manualEmitter.emit(evt, ...pipeline),
                        removeListener: (evt, handler) => manualEmitter.removeListener(evt, handler)
                    };

                    // Hook internal cleanup to the emitter too
                    manualEmitter.once('disconnected', async () => {
                        console.log(`[BrowserManager] Manual Mode: Disconnected signal received. Syncing...`);

                        // [Windows N] EXTRACTION (Sync Back)
                        if (process.platform === 'win32' && executablePath && executablePath.includes('IronPortable')) {
                            const targetProfileDir = path.join(ironCwd, 'Profile');
                            // userDataDir is already defined in scope as the Source/Destination
                            await BrowserManager.extractProfile(targetProfileDir, userDataDir);
                        }

                        await BrowserManager.cleanupSession(account.id, null, userDataDir, anonymizedProxyUrl);
                    });

                    return manualBrowser;
                }
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s
            }
        }

        console.log('[BrowserManager] ✓ PUPPETEER CONNECTED!');

        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        BrowserManager.lastPage = page; // Restore for AutomationManager compatibility

        // MINIMAL FINGERPRINT ONLY (User requested: remove all evasion scripts)
        if (account.fingerprint && account.fingerprint.userAgent) {
            await page.setUserAgent(account.fingerprint.userAgent);
        }

        // Inject Automation Scripts if needed (Simplified)
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Add to active map
        BrowserManager.activeBrowsers.set(account.id, browser);

        // HYBRID SYNC: Inject All Storage Data (Cookies + LocalStorage + SessionStorage)
        if (storageData) {
            // Inject Cookies
            if (storageData.cookies?.length > 0) {
                console.log(`[Sync] ✓ Downloaded ${storageData.cookies.length} cookies from DB`);
                console.log(`[Sync] Cookie domains:`, storageData.cookies.map(c => c.domain).join(', '));
                try {
                    await page.setCookie(...storageData.cookies);
                    console.log(`[Sync] ✓ Cookies injected successfully`);
                } catch (err) {
                    console.error(`[Sync] ✗ Cookie injection failed:`, err.message);
                }
            }

            // Inject LocalStorage
            if (storageData.localStorage && Object.keys(storageData.localStorage).length > 0) {
                try {
                    await page.evaluateOnNewDocument((data) => {
                        for (const [key, value] of Object.entries(data)) {
                            localStorage.setItem(key, value);
                        }
                    }, storageData.localStorage);
                    console.log(`[Sync] ✓ Injected ${Object.keys(storageData.localStorage).length} localStorage items`);
                } catch (err) {
                    console.error('[Sync] ✗ LocalStorage injection failed:', err.message);
                }
            }

            // Inject SessionStorage
            if (storageData.sessionStorage && Object.keys(storageData.sessionStorage).length > 0) {
                try {
                    await page.evaluateOnNewDocument((data) => {
                        for (const [key, value] of Object.entries(data)) {
                            sessionStorage.setItem(key, value);
                        }
                    }, storageData.sessionStorage);
                    console.log(`[Sync] ✓ Injected ${Object.keys(storageData.sessionStorage).length} sessionStorage items`);
                } catch (err) {
                    console.error('[Sync] ✗ SessionStorage injection failed:', err.message);
                }
            }
        } else {
            console.log('[Sync] ⚠ No storage data found in DB for this account');
        }

        // AUTO-NAVIGATE (UX Improvement) - Execute AFTER cookie injection
        if (account.loginUrl && account.loginUrl.startsWith('http')) {
            console.log(`[BrowserManager] Auto-navigating to: ${account.loginUrl}`);
            try {
                await page.goto(account.loginUrl);
            } catch (e) {
                console.warn('[BrowserManager] Auto-navigation failed:', e.message);
            }
        }

        console.log('[BrowserManager] ✓ Browser instance stored for account:', account.name);

        // IPC: Register automation mode handler
        browser.on('disconnected', async () => {
            console.log(`[BrowserManager] Browser closed. Cleaning up...`);
            BrowserManager.activeBrowsers.delete(account.id);

            // SAVE BACK PORTABLE PROFILE
            if (portableProfilePath) {
                try {
                    console.log(`[BrowserManager] 💾 Saving Portable Profile back to ${userDataDir}...`);
                    await fs.copy(portableProfilePath, userDataDir, { overwrite: true });
                } catch (err) {
                    console.error('[BrowserManager] Failed to save back portable profile:', err);
                }
            }

            if (anonymizedProxyUrl) {
                try {
                    await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
                    console.log('[Proxy] Bridge closed.');
                } catch (e) { console.error('[Proxy] Close error:', e); }
            }
            if (proxyExtensionPath) {
                try { await fs.remove(proxyExtensionPath); } catch (e) { }
            }

            // HYBRID SYNC: Export Cookies before upload
            console.log('[Sync] Starting cookie export...');
            try {
                const pages = await browser.pages();
                console.log(`[Sync] Found ${pages.length} pages`);
                if (pages.length > 0) {
                    const cookies = await pages[0].cookies();
                    console.log(`[Sync] ✓ Extracted ${cookies.length} cookies from browser`);
                    console.log(`[Sync] Cookie domains:`, cookies.map(c => c.domain).join(', '));
                    await SyncManager.uploadCookies(account.id, cookies);
                } else {
                    console.warn('[Sync] ⚠ No pages available for cookie extraction');
                }
            } catch (e) {
                console.error('[Sync] ✗ Failed to export cookies:', e.message);
            }

            await SyncManager.uploadSession(account.id);
            console.log(`[Sync] Finished upload for ${account.name}`);
        });


        return browser;
    }

    static getFreePort() {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', reject);
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => resolve(port));
            });
        });
    }

    static spawnBrowser(executablePath, args, cwd) {
        return new Promise((resolve, reject) => {
            console.log(`[BrowserManager] Spawning: ${executablePath}`);
            console.log(`[BrowserManager] CWD: ${cwd}`);

            const child = spawn(executablePath, args, {
                cwd: cwd,
                detached: true,
                windowsHide: true, // Hide the command line window
                stdio: ['ignore', 'ignore', 'ignore']
            });

            child.on('error', (err) => {
                console.error('[BrowserManager] Spawn Error:', err);
                reject(err);
            });

            child.unref();

            setTimeout(() => {
                resolve(child);
            }, 1500);
        });
    }

    static startElementPicker(page) {
        if (!page || page.isClosed()) throw new Error('Browser page is not available.');

        console.log('[BrowserManager] Starting Element Picker with Confirmation...');

        return new Promise(async (resolve, reject) => {
            let solved = false;
            let navigationListener = null;

            // Timeout after 120s (Extended for user decision)
            const timeout = setTimeout(() => {
                if (!solved) {
                    cleanup();
                    reject(new Error('Timed out waiting for element selection.'));
                }
            }, 120000);

            const cleanup = () => {
                solved = true;
                clearTimeout(timeout);
                if (navigationListener) {
                    page.off('framenavigated', navigationListener);
                }
            };

            try {
                // EXPOSE: Confirmation Callback (idempotent check)
                try {
                    await page.exposeFunction('spectreElementPicked', (selector) => {
                        if (solved) return;
                        cleanup();
                        console.log('[BrowserManager] Element Confirmed:', selector);
                        resolve(selector);
                    });
                } catch (e) {
                    // Ignore if already exposed
                }

                // DEFINITION: Injection Logic
                const injectSpectre = async () => {
                    if (solved) return;
                    try {
                        await page.evaluate(() => {
                            if (document.getElementById('spectre-overlay')) return;

                            // 1. Inject Styles
                            const style = document.createElement('style');
                            style.id = 'spectre-picker-style';
                            style.innerHTML = `
    .spectre - highlight {
    outline: 2px solid #007bff!important;
    background - color: rgba(0, 123, 255, 0.1)!important;
    cursor: crosshair!important;
}
#spectre - overlay {
    position: fixed;
    bottom: 20px;
    left: 50 %;
    transform: translateX(-50 %);
    background: #222;
    color: #fff;
    padding: 10px 20px;
    border - radius: 8px;
    box - shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z - index: 2147483647;
    font - family: sans - serif;
    font - size: 14px;
    display: flex;
    align - items: center;
    gap: 15px;
    border: 1px solid #444;
}
#spectre - overlay button {
    background: #28a745;
    color: white;
    border: none;
    padding: 6px 15px;
    border - radius: 4px;
    cursor: pointer;
    font - weight: bold;
}
#spectre - overlay button:disabled {
    background: #555;
    cursor: not - allowed;
    color: #888;
}
#spectre - target {
    font - family: monospace;
    background: #333;
    padding: 2px 6px;
    border - radius: 4px;
    color: #00bcd4;
    max - width: 300px;
    overflow: hidden;
    text - overflow: ellipsis;
    white - space: nowrap;
}
`;
                            document.head.appendChild(style);

                            // 2. Inject Overlay HTML
                            const overlay = document.createElement('div');
                            overlay.id = 'spectre-overlay';
                            overlay.innerHTML = `
    < span > Target:</span >
                                <span id="spectre-target">None</span>
                                <button id="spectre-confirm" disabled>Confirm Selection</button>
`;
                            document.body.appendChild(overlay);

                            const targetSpan = document.getElementById('spectre-target');
                            const confirmBtn = document.getElementById('spectre-confirm');
                            let lastElement = null;
                            let currentSelector = null;

                            // 3. Handlers
                            const mouseOverHandler = (e) => {
                                if (e.target.closest('#spectre-overlay')) return;
                                if (lastElement) lastElement.classList.remove('spectre-highlight');
                                e.target.classList.add('spectre-highlight');
                                lastElement = e.target;
                            };

                            const clickHandler = (e) => {
                                if (e.target.closest('#spectre-overlay')) return;
                                e.preventDefault();
                                e.stopPropagation();

                                document.removeEventListener('mouseover', mouseOverHandler);

                                // Generate Selector (Smart)
                                const getSmartSelector = (el) => {
                                    // 1. ID (Highest priority, if safe)
                                    // Ignore IDs that look dynamic (contain numbers or are too long)
                                    if (el.id && !/\d/.test(el.id) && el.id.length < 50) {
                                        return { selector: '#' + el.id, stop: true };
                                    }

                                    // 2. Unique Attributes (including button type)
                                    const uniqueAttrs = ['type', 'name', 'data-testid', 'data-test', 'aria-label', 'placeholder', 'alt', 'role'];
                                    for (const attr of uniqueAttrs) {
                                        if (el.hasAttribute(attr)) {
                                            const val = el.getAttribute(attr);
                                            // Escape double quotes in value
                                            const safeVal = val.replace(/"/g, '\\"');
                                            return { selector: `${el.tagName.toLowerCase()} [${attr} = "${safeVal}"]`, stop: true };
                                        }
                                    }

                                    // 3. Classes (Filter ALL dynamic utilities)
                                    if (el.className && typeof el.className === 'string') {
                                        const classes = el.className.split(' ').filter(c =>
                                            c !== 'spectre-highlight' &&
                                            !c.startsWith('tw-') &&
                                            !c.startsWith('hover:') &&
                                            !c.startsWith('active:') &&
                                            !c.startsWith('focus:') &&
                                            !c.startsWith('sm:') &&
                                            !c.startsWith('md:') &&
                                            !c.startsWith('lg:') &&
                                            c.length < 30
                                        ).join('.');
                                        if (classes) return { selector: el.tagName.toLowerCase() + '.' + classes, stop: true };
                                    }

                                    // 4. Fallback: Tag + Nth
                                    let siblingIndex = 1;
                                    let sibling = el.previousElementSibling;
                                    while (sibling) {
                                        if (sibling.tagName === el.tagName) siblingIndex++;
                                        sibling = sibling.previousElementSibling;
                                    }
                                    return { selector: el.tagName.toLowerCase() + `: nth - of - type(${siblingIndex})`, stop: false };
                                };

                                let path = [];
                                let current = e.target;
                                while (current && current.tagName.toLowerCase() !== 'html') {
                                    const result = getSmartSelector(current);
                                    path.unshift(result.selector);
                                    if (result.stop) break; // Found unique anchor, stop traversing up
                                    current = current.parentElement;
                                }
                                currentSelector = path.join(' > ');

                                targetSpan.innerText = currentSelector;
                                confirmBtn.disabled = false;
                                confirmBtn.onclick = () => {
                                    window.spectreElementPicked(currentSelector);
                                };
                            };

                            document.addEventListener('mouseover', mouseOverHandler);
                            document.addEventListener('click', clickHandler, true);
                        });
                        console.log('[BrowserManager] Picker injected on new page.');
                    } catch (err) {
                        console.warn('[BrowserManager] Injection failed (could be transient):', err.message);
                    }
                };

                // Initial Injection
                await injectSpectre();

                // Navigation Persistence
                navigationListener = async (frame) => {
                    if (frame === page.mainFrame()) {
                        try {
                            await frame.waitForFunction(() => document.body);
                            await injectSpectre();
                        } catch (e) { }
                    }
                };
                page.on('framenavigated', navigationListener);

            } catch (err) {
                cleanup();
                reject(err);
            }
        });
    }

    static startSupervisor(page, account) {
        if (!account.auth || !account.auth.twoFactorSecret) return;

        console.log('[Supervisor] Started. Monitoring for 2FA fields...');
        let active = true;
        page.on('close', () => active = false);
        page.browser().on('disconnected', () => active = false);

        const secret = account.auth.twoFactorSecret;

        async function loop() {
            while (active) {
                try {
                    // Check URL for efficiency
                    const url = await page.url();
                    if (url.includes('tazapay') || url.includes('dashboard')) {

                        // Look for the specific 6 input fields
                        const inputs = await page.$$('input[data-cy^="authenticator-authenticate-otp-field-otp-input-"]');

                        // Need exactly 6 visible inputs
                        if (inputs.length === 6) {
                            // Check if first is empty
                            const firstVal = await inputs[0].evaluate(el => el.value);

                            if (!firstVal) {
                                console.log('[Supervisor] 2FA Fields Detected (Empty). Initiating Trusted Input...');

                                let code = null;
                                try {
                                    // Custom TOTP Generation (Robust & No-Library-Hell)
                                    const base32 = require('hi-base32');
                                    const crypto = require('crypto');

                                    // TIME SYNC: Fetch real time to avoid user clock drift (User PC might be 2026!)
                                    let serverTime = Date.now();
                                    try {
                                        const fetch = (await import('node-fetch')).default || require('https').get;
                                        // Simple HEAD request to Google for 'date' header
                                        await new Promise((resolve) => {
                                            const req = require('https').request('https://google.com', { method: 'HEAD' }, (res) => {
                                                if (res.headers.date) {
                                                    const networkTime = new Date(res.headers.date).getTime();
                                                    console.log(`[Supervisor] Network Time: ${new Date(networkTime).toISOString()} (Drift: ${networkTime - Date.now()}ms)`);
                                                    serverTime = networkTime;
                                                }
                                                resolve();
                                            });
                                            req.on('error', () => resolve());
                                            req.end();
                                        });
                                    } catch (e) { console.log('[Supervisor] Time sync failed, using local time.'); }

                                    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
                                    console.log(`[Supervisor] Generating code for secret: ${cleanSecret.substring(0, 4)}... with Time: ${new Date(serverTime).toISOString()} `);

                                    const epoch = Math.floor(serverTime / 1000.0);
                                    const time = Buffer.alloc(8);
                                    let counter = Math.floor(epoch / 30);

                                    // Write counter to buffer (Big Endian)
                                    for (let i = 7; i >= 0; i--) {
                                        time[i] = counter & 0xff;
                                        counter = counter >>> 8;
                                    }

                                    // Decode Base32
                                    const key = Buffer.from(base32.decode.asBytes(cleanSecret));

                                    // HMAC-SHA1
                                    const hmac = crypto.createHmac('sha1', key);
                                    hmac.update(time);
                                    const digest = hmac.digest();

                                    // Truncate
                                    const offset = digest[digest.length - 1] & 0xf;
                                    const binary =
                                        ((digest[offset] & 0x7f) << 24) |
                                        ((digest[offset + 1] & 0xff) << 16) |
                                        ((digest[offset + 2] & 0xff) << 8) |
                                        (digest[offset + 3] & 0xff);

                                    const otp = (binary % 1000000).toString().padStart(6, '0');
                                    code = otp;

                                } catch (err) {
                                    console.error(`[Supervisor] FATAL ERROR generating TOTP: ${err.message} `);
                                    active = false; // Stop loop to avoid spam
                                    return;
                                }

                                if (code) {
                                    console.log(`[Supervisor] Generated Code: ${code} `);
                                    const chars = code.split('');

                                    // Sort inputs to be sure (though $$ usually returns DOM order)
                                    // We'll trust Puppeteer's order for now or we could sort by evaluation if needed

                                    for (let i = 0; i < 6; i++) {
                                        if (!active) break;
                                        const char = chars[i];

                                        // 1. Hover & Click (Trusted Mouse Event)
                                        await inputs[i].hover();
                                        await inputs[i].click();

                                        // 2. Small delay for focus
                                        await new Promise(r => setTimeout(r, 50));

                                        // 3. Type (Trusted Keyboard Event)
                                        await page.keyboard.type(char);

                                        console.log(`[Supervisor] Typed '${char}' into box ${i} `);
                                        await new Promise(r => setTimeout(r, 100)); // Natural typing speed
                                    }

                                    // Submit
                                    await new Promise(r => setTimeout(r, 500));
                                    const btn = await page.$('button[data-cy="authenticator-authenticate-authenticator-button"]');
                                    if (btn) {
                                        console.log('[Supervisor] Clicking Submit...');
                                        await btn.click();

                                        // Back off for a while to let navigation happen
                                        await new Promise(r => setTimeout(r, 5000));
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Ignore context errors (navigating, detaching, etc.)
                }

                // Wait before next check
                await new Promise(r => setTimeout(r, 1500));
            }
            console.log('[Supervisor] Stopped.');
        }

        loop();
    }

    // HELPER: Centralized Cleanup & Sync
    static async cleanupSession(accountId, portableProfilePath, userDataDir, proxyUrl) {
        console.log(`[BrowserManager] Cleaning up session for ${accountId}...`);
        BrowserManager.activeBrowsers.delete(accountId);

        // SAVE BACK PORTABLE PROFILE
        if (portableProfilePath) {
            try {
                console.log(`[BrowserManager] 💾 Saving Portable Profile back to ${userDataDir}...`);
                // Use copy with overwrite. Ensure target exists.
                await fs.ensureDir(userDataDir);
                await fs.copy(portableProfilePath, userDataDir, { overwrite: true, errorOnExist: false });
                console.log(`[BrowserManager] ✅ Sync Complete.`);
            } catch (err) {
                console.error('[BrowserManager] Failed to save back portable profile:', err);
            }
        }

        if (proxyUrl) {
            try {
                await ProxyChain.closeAnonymizedProxy(proxyUrl, true);
                console.log('[Proxy] Bridge closed.');
            } catch (e) { console.error('[Proxy] Close error:', e); }
        }

        // [Cloud Sync] Restore Upload Logic
        try {
            console.log(`[BrowserManager] Uploading session for ${accountId}...`);
            await SyncManager.uploadSession(accountId);
            console.log(`[BrowserManager] ✅ Sync Upload Complete.`);
        } catch (e) {
            console.error('[BrowserManager] Sync Upload Failed:', e);
        }
    }
}

module.exports = BrowserManager;
