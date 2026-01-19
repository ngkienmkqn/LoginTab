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

    static async launchProfile(account, mode = null) {
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

            // FORCE UPGRADE if:
            // 1. Non-Winning Config (Resolution + WebGL mismatch)
            // 2. OLD FINGERPRINT missing new OS-specific fields

            // "Natural" fingerprints have null webglRenderer. Consider them "Winning" (Valid).
            const isNatural = !account.fingerprint.webglRenderer;

            const isWinningConfig = isNatural || (
                account.fingerprint.resolution === '2560x1440' &&
                account.fingerprint.webglRenderer &&
                account.fingerprint.webglRenderer.includes('RTX 3060')
            );

            const hasOSFields =
                account.fingerprint.platformName &&
                account.fingerprint.fonts &&
                account.fingerprint.plugins;


            // FINGERPRINT LOCK: Disabled auto-upgrade to maintain session consistency
            // Tazapay and similar services validate fingerprint changes as suspicious activity
            // Once fingerprint is generated, it stays locked to prevent session invalidation
            /*
            if (!isWinningConfig || !hasOSFields) {
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
            }
            */
            console.log('[Fingerprint] 🔒 Fingerprint locked (no auto-upgrade)');

            console.log(`[Fingerprint]   Generated: ${account.fingerprint.generated} `);
            console.log(`[Fingerprint]   Resolution: ${account.fingerprint.resolution} `);
            console.log(`[Fingerprint]   WebGL: ${account.fingerprint.webglRenderer || 'Natural (Real)'} `);
        }

        // 1. Download session from MySQL before launch
        await SyncManager.downloadSession(account.id);
        const jsonCookies = await SyncManager.downloadCookies(account.id);

        console.log(`[BrowserManager] Launching: ${account.name} (${account.id})`);

        const possiblePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            process.env.CHROME_PATH
        ];

        let executablePath = null;
        for (const p of possiblePaths) {
            if (!p) continue;
            const exists = fs.existsSync(p);
            console.log(`[BrowserManager] Checking path: ${p} -> ${exists}`);
            if (exists) {
                executablePath = p;
                break;
            }
        }
        if (!executablePath) throw new Error('Chrome/Edge executable not found.');
        console.log(`[BrowserManager] Using executable: ${executablePath}`);

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

        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled', // CRITICAL: Re-enabled for Google Login (Stealth Plugin is NOT active)
            '--disable-infobars',
            '--disable-save-password-bubble',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-popup-blocking',
            '--disable-notifications'
        ];

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

        // MANUAL ADDITION (Since Stealth is gone) (Re-enabled)
        // CRITICAL UPDATE: REMOVED FLAG to fix "Unsupported Command-Line Flag"
        // We now hide automation using the Page Script above manually.
        // args.push('--disable-blink-features=AutomationControlled');
        console.log('[BrowserManager] Launch Args (Manual + Pure Puppeteer + No Flag):', args);

        const browser = await puppeteer.launch({
            executablePath,
            headless: false,
            defaultViewport: null,
            userDataDir,
            args: args, // Use direct args
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: true, // Keep this true (Clean Slate)
            pipe: true // CRITICAL: Required for packaged Electron apps to communicate with Chrome
        });

        // ---------------------------------------------------------
        // EVASION INJECTION (Critical Step)
        // ---------------------------------------------------------
        const pages = await browser.pages();
        const evasionPage = pages.length > 0 ? pages[0] : await browser.newPage();

        // HYBRID SYNC: Inject Portable Cookies
        if (jsonCookies) {
            console.log(`[Sync] ✓ Downloaded ${jsonCookies.length} cookies from DB`);
            console.log(`[Sync] Cookie domains:`, jsonCookies.map(c => c.domain).join(', '));
            try {
                await evasionPage.setCookie(...jsonCookies);
                console.log(`[Sync] ✓ Cookies injected successfully`);
            } catch (err) {
                console.error(`[Sync] ✗ Cookie injection failed:`, err.message);
            }
        } else {
            console.log('[Sync] ⚠ No cookies found in DB for this account');
        }

        const page = evasionPage; // Restore 'page' alias for downstream compatibility

        // 1. Remove "cdc_" property (Puppeteer marker)
        // 2. Inject advanced evasion scripts before ANY script loads
        // 1. Inject advanced evasion scripts before ANY script loads
        // (CDC removal is included in PuppeteerEvasion)

        // IPHEY FIX: PuppeteerEvasion DISABLED
        // The custom evasion scripts in PuppeteerEvasion.js break IPHey's fingerprint detection
        // Stealth Plugin alone is sufficient and IPHey-compatible
        // const evasionScript = PuppeteerEvasion.getAllEvasionScripts(account.fingerprint);
        // await evasionPage.evaluateOnNewDocument(evasionScript);
        console.log('[Evasion] Manual Mode (Stealth Plugin Disabled)');

        // PROXY PROTECTION: Prevent WebRTC IP leak when using proxy
        if (account.proxy && account.proxy.host) {
            console.log('[Proxy] Injecting WebRTC leak protection...');
            await evasionPage.evaluateOnNewDocument(() => {
                // Block WebRTC from exposing local IP addresses
                const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
                navigator.mediaDevices.getUserMedia = function () {
                    return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
                };

                // Override RTCPeerConnection to prevent IP leak
                const originalRTCPeerConnection = window.RTCPeerConnection;
                window.RTCPeerConnection = function (config = {}) {
                    // Force relay-only mode (no local IP exposure)
                    if (!config.iceServers) config.iceServers = [];
                    config.iceTransportPolicy = 'relay';
                    return new originalRTCPeerConnection(config);
                };
                window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;

                // Block mDNS candidate gathering
                const originalCreateOffer = RTCPeerConnection.prototype.createOffer;
                RTCPeerConnection.prototype.createOffer = function (options) {
                    if (!options) options = {};
                    options.offerToReceiveAudio = false;
                    options.offerToReceiveVideo = false;
                    return originalCreateOffer.apply(this, arguments);
                };
            });
        }




        browser.on('disconnected', async () => {
            console.log(`[BrowserManager] Browser closed. Cleaning up...`);
            BrowserManager.activeBrowsers.delete(account.id);

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

        // Continue with setup
        try {
            console.log('[BrowserManager] Setup Continuing (EvasionPage)...');
            BrowserManager.lastPage = evasionPage; // Track for Element Picker

            // ===================================================================
            // MANUAL STEALTH INJECTION (Replaces Stealth Plugin)
            // ===================================================================
            // ===================================================================
            // MANUAL STEALTH INJECTION (Level 3 - Robust)
            // ===================================================================
            await evasionPage.evaluateOnNewDocument((runInfo) => {
                // 1. Hide navigator.webdriver (Standard)
                Object.defineProperty(navigator, 'webdriver', { get: () => false });

                // 2. Mock Chrome Runtime (Critical for IPHey)
                if (!window.chrome) window.chrome = {};
                if (!window.chrome.runtime) window.chrome.runtime = {};

                // 3. Mock Plugins & MimeTypes (Linked)
                const mockPlugins = [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
                ];

                Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        const p = [...mockPlugins];
                        p.item = (i) => p[i];
                        p.namedItem = (name) => p.find(x => x.name === name);
                        p.refresh = () => { };
                        return p;
                    }
                });

                Object.defineProperty(navigator, 'mimeTypes', {
                    get: () => {
                        const m = [
                            { type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: mockPlugins[0] },
                            { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[1] }
                        ];
                        m.item = (i) => m[i];
                        m.namedItem = (type) => m.find(x => x.type === type);
                        return m;
                    }
                });

                // 4. Mock Languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });

                // 5. Polyfill Notification (Fixes ReferenceError)
                if (!window.Notification) {
                    window.Notification = {
                        permission: 'default',
                        requestPermission: () => Promise.resolve('default')
                    };
                }

                // 6. Pass Permissions Check (Safe Fallback)
                if (window.navigator.permissions) {
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => {
                        if (parameters.name === 'notifications') {
                            return Promise.resolve({ state: window.Notification.permission });
                        }
                        return originalQuery(parameters);
                    };
                }

                // 7. UA Client Hints (CRITICAL for Google Login)
                if (navigator.userAgentData) {
                    const majorVersion = "131";
                    const fullVersion = "131.0.0.0";
                    const brands = [
                        { brand: "Chromium", version: majorVersion },
                        { brand: "Google Chrome", version: majorVersion },
                        { brand: "Not=A?Brand", version: "24" }
                    ];

                    Object.defineProperty(navigator, 'userAgentData', {
                        get: () => ({
                            brands: brands,
                            mobile: false,
                            platform: "Windows",
                            getHighEntropyValues: (hints) => Promise.resolve({
                                architecture: "x86",
                                bitness: "64",
                                brands: brands,
                                mobile: false,
                                model: "",
                                platform: "Windows",
                                platformVersion: "15.0.0",
                                uaFullVersion: fullVersion
                            }),
                            toJSON: () => ({ brands, mobile: false, platform: "Windows" })
                        })
                    });
                }

                // 7. WebGL Vendor/Renderer (REMOVED to avoid "Masking Detected")
                // We will rely on the real GPU (RTX 3060) which is better than a detected mock.
                /*
                const mockWebGL = (context) => {
                    try {
                        if (!context) return;
                        const getParameter = context.prototype.getParameter;
                        context.prototype.getParameter = function (parameter) {
                            try {
                                // 37445 = UNMASKED_VENDOR_WEBGL
                                // 37446 = UNMASKED_RENDERER_WEBGL
                                if (parameter === 37445) return 'Google Inc. (NVIDIA)';
                                if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
                                return getParameter.apply(this, [parameter]);
                            } catch (err) {
                                return null; // Suppress INVALID_ENUM errors
                            }
                        };
                    } catch (e) { }
                };

                mockWebGL(window.WebGLRenderingContext);
                mockWebGL(window.WebGL2RenderingContext);
                */

                // 8. Hardware Concurrency & Memory (REMOVED to avoid "Masking Detected")
                // Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
                // Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
                // Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

            }, { /* Optional args */ });
            console.log('[Evasion] ✓ Manual Stealth Scripts Injected (Level 5 - Minimal/Native Hardware)');

            // Setup Supervisor (2FA & Click/Type listener)
            // RESTORED: Now that we have manual stealth, we can try restoring this.
            // If it hangs again, we will know for sure.
            await this.startSupervisor(evasionPage, account);

            console.log('[Evasion] ✓ Supervisor injected');
        } catch (err) {
            console.error('[BrowserManager] Injection error:', err);
        }




        // ===================================================================
        // RESTORED CLIENT SCRIPTS (Optimized)
        // ===================================================================

        // CLIENT-SIDE SCRIPT (Injected) - Handles Username, Password, Logs
        // ----------------------------------------------------------------
        // Expose for In-Page script (kept for redundancy/other fields)
        await page.exposeFunction('getTOTP', () => {
            if (account.auth.twoFactorSecret) {
                try { return authenticator.generate(account.auth.twoFactorSecret); } catch (e) { return null; }
            }
            return null;
        });

        await page.exposeFunction('has2FASecret', () => !!account.auth.twoFactorSecret);

        // ----------------------------------------------------------------
        // CLIENT-SIDE SCRIPT (Injected) - Handles Username, Password, Logs
        // ----------------------------------------------------------------
        try {
            await page.evaluateOnNewDocument((auth) => {
                // AGGRESSIVE PASSWORD MASKING ENFORCER
                setInterval(() => {
                    // 1. Force Input Type = Password
                    const passInputs = document.querySelectorAll('input[type="password"], div[data-cy="signin-password-input"] input');
                    passInputs.forEach(el => {
                        if (el.type !== 'password') {
                            el.type = 'password';
                            console.log('[Enforcer] Reverted password field to secure type.');
                        }
                    });

                    // 2. Kill Reveal Buttons (Tazapay specific & Generic)
                    const targets = [
                        'div[data-cy="signin-password-input"] svg',
                        'div[data-cy="signin-password-input"] button',
                        'div[data-cy="signin-password-input"] .ant-input-suffix', // Ant Design
                        '.MuiInputAdornment-positionEnd', // Material UI
                        // 'input::-ms-reveal' // Pseudo-elements can't be removed by JS, handled by CSS or just ignored as we enforce type
                    ];

                    targets.forEach(selector => {
                        document.querySelectorAll(selector).forEach(el => {
                            el.remove(); // DELETE FROM DOM
                        });
                    });
                }, 100);

                window.__loginState = { lastAction: 0 };
                const PLATFORMS = {
                    'tazapay': {
                        user: ['div[data-cy="signin-email-data"] input', 'input[placeholder="Enter email address"]'],
                        pass: ['div[data-cy="signin-password-input"] input', 'input[type="password"]'],
                        remember: ['input[name="saveSession"]'],
                        next: ['button[data-cy="signin-button"]'],
                        // Note: 2FA is now handled by Node-side Supervisor for reliability
                        twoFactor: ['input[data-cy^="authenticator-authenticate-otp-field-otp-input-"]']
                    }
                };

                function isVisible(el) {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                }

                function triggerEvents(el, val) {
                    if (!el) return;
                    el.focus();
                    el.value = val;
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    if (nativeInputValueSetter) nativeInputValueSetter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Auto-login logic removed as per user request to focus on Workflow Automations.
                // The previous setInterval loop (lines 301-343) has been deleted.
            }, account.auth);

            // ----------------------------------------------------------------
            // NODE-SIDE SUPERVISOR (Specific for complex interactions like 2FA)
            // ----------------------------------------------------------------
            BrowserManager.startSupervisor(page, account);

            // ===================================================================
            // END RESTORE BLOCK
            // ===================================================================
            // ===================================================================
            // END IPHEY DEBUG BLOCK
            // ===================================================================


            if (account.loginUrl) {
                console.log(`[Browser] Navigating to ${account.loginUrl}`);
                try {
                    await page.goto(account.loginUrl, { waitUntil: 'load', timeout: 60000 });
                } catch (e) { console.warn('Nav timeout, continuing...'); }

                // Automation Mode Check
                // Valid modes: 'auto' (default), 'manual'
                // If mode arg is passed (e.g. from Open button), it overrides DB config
                const automationMode = (mode || account.automation_mode || 'auto').toLowerCase();
                console.log(`[BrowserManager] Automation Mode: ${automationMode}`);

                if (automationMode === 'auto' && account.workflow_id) {
                    await BrowserManager.executeWorkflow(browser, page, account.workflow_id);
                    // If workflow completes, close browser?
                    // Usually executeWorkflow closes it, or we close it here.
                    // For now, let's assume we want to close after auto.
                    try { await browser.close(); } catch (e) { }
                } else {
                    console.log('[BrowserManager] Manual mode or no workflow. Keeping browser open.');
                }


                // IP Check
                try {
                    const ip = await page.evaluate(() => fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip));
                    console.log(`[Proxy-Check] Current Exit IP: ${ip}`);
                } catch (e) { }

                // ===================================================================
                // HYBRID SYNC: Periodic Cookie Backup (Every 30s)
                // ===================================================================
                const cookieSyncInterval = setInterval(async () => {
                    try {
                        if (browser.isConnected()) {
                            const allPages = await browser.pages();
                            if (allPages.length > 0) {
                                const cookies = await allPages[0].cookies();
                                if (cookies.length > 0) {
                                    await SyncManager.uploadCookies(account.id, cookies);
                                    console.log(`[Sync] ✓ Periodic cookie backup (${cookies.length} cookies)`);
                                }
                            }
                        } else {
                            clearInterval(cookieSyncInterval);
                        }
                    } catch (e) {
                        console.error('[Sync] Periodic backup error:', e.message);
                    }
                }, 30000); // Every 30 seconds

                // Also sync on navigation completion
                page.on('load', async () => {
                    try {
                        const cookies = await page.cookies();
                        if (cookies.length > 0) {
                            await SyncManager.uploadCookies(account.id, cookies);
                            console.log(`[Sync] ✓ Cookies synced on page load (${cookies.length} cookies)`);
                        }
                    } catch (e) {
                        console.error('[Sync] Page load sync error:', e.message);
                    }
                });
            }

            // Store browser instance in map
            BrowserManager.activeBrowsers.set(account.id, browser);
            console.log(`[BrowserManager] ✓ Browser instance stored for account: ${account.name} `);

            return browser;
        } catch (err) {
            console.error('[BrowserManager] Fatal Launch Error:', err);
            throw err;
        }
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
}

module.exports = BrowserManager;
