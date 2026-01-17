const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
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

    static async launchProfile(account) {
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
            const isWinningConfig =
                account.fingerprint.resolution === '2560x1440' &&
                account.fingerprint.webglRenderer.includes('RTX 3060');

            const hasOSFields =
                account.fingerprint.platformName &&
                account.fingerprint.fonts &&
                account.fingerprint.plugins;

            if (!isWinningConfig || !hasOSFields) {
                if (!isWinningConfig) {
                    console.log('[Fingerprint] ⚠ NON-OPTIMAL FINGERPRINT DETECTED');
                    console.log(`[Fingerprint]   Current: ${account.fingerprint.resolution} / ${account.fingerprint.webglRenderer}`);
                }
                if (!hasOSFields) {
                    console.log('[Fingerprint] ⚠ OLD FINGERPRINT DETECTED (Missing OS-specific fields)');
                    console.log(`[Fingerprint]   platformName: ${account.fingerprint.platformName || 'MISSING'}`);
                    console.log(`[Fingerprint]   fonts: ${account.fingerprint.fonts ? 'OK' : 'MISSING'}`);
                    console.log(`[Fingerprint]   plugins: ${account.fingerprint.plugins ? 'OK' : 'MISSING'}`);
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

            console.log(`[Fingerprint]   Generated: ${account.fingerprint.generated} `);
            console.log(`[Fingerprint]   Resolution: ${account.fingerprint.resolution} `);
            console.log(`[Fingerprint]   WebGL: ${account.fingerprint.webglRenderer} `);
        }

        // 1. Download session from MySQL before launch
        await SyncManager.downloadSession(account.id);

        console.log(`[BrowserManager] Launching: ${account.name} (${account.id})`);

        const possiblePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_PATH
        ];

        const executablePath = possiblePaths.find(p => p && fs.existsSync(p));
        if (!executablePath) throw new Error('Chrome executable not found.');

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
            '--disable-infobars',
            // '--disable-features=IsolateOrigins,site-per-process,PasswordManager,PasswordImport,PasswordExport,PasswordBreachDetection,AutofillServerCommunication,CreditCard,ProactivePasswordGeneration', // REMOVED: Too suspicious
            '--disable-save-password-bubble',
            '--password-store=basic',
            '--use-mock-keychain',
            // '--disable-blink-features=AutomationControlled', // REMOVED: Detected by modern Chrome/Cloudflare
            '--disable-popup-blocking',
            '--disable-notifications'
        ];

        if (account.fingerprint && account.fingerprint.resolution) {
            args.push(`--window - size=${account.fingerprint.resolution.replace('x', ',')} `);
        } else {
            args.push('--start-maximized');
        }

        // User Agent from fingerprint (or default)
        if (account.fingerprint && account.fingerprint.userAgent) {
            args.push(`--user - agent=${account.fingerprint.userAgent} `);
        } else {
            // Fallback to latest Chrome if no fingerprint
            args.push(`--user - agent=Mozilla / 5.0(Windows NT 10.0; Win64; x64) AppleWebKit / 537.36(KHTML, like Gecko) Chrome / 131.0.0.0 Safari / 537.36`);
        }
        args.push(`--lang = ${account.fingerprint.language || 'en-US'} `); // Match fingerprint language
        args.push('--exclude-switches=enable-automation');

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

        const finalArgs = args.filter(a => !a.includes('AutomationControlled'));

        console.log('[BrowserManager] Final Launch Args:', finalArgs);

        const browser = await puppeteer.launch({
            executablePath,
            headless: false,
            defaultViewport: null,
            userDataDir,
            args: finalArgs,
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'] // Only remove automation flags
        });

        // ---------------------------------------------------------
        // EVASION INJECTION (Critical Step)
        // ---------------------------------------------------------
        const pages = await browser.pages();
        const evasionPage = pages.length > 0 ? pages[0] : await browser.newPage();
        const page = evasionPage; // Restore 'page' alias for downstream compatibility

        // 1. Remove "cdc_" property (Puppeteer marker)
        // 2. Inject advanced evasion scripts before ANY script loads
        await evasionPage.evaluateOnNewDocument(() => {
            // Strip cdc_ artifacts
            const cdc = Object.getOwnPropertyNames(window).filter(k => k.startsWith('cdc_'));
            cdc.forEach(k => delete window[k]);
        });

        const evasionScript = PuppeteerEvasion.getAllEvasionScripts(account.fingerprint);
        await evasionPage.evaluateOnNewDocument(evasionScript);
        console.log('[Evasion] Injecting comprehensive evasion scripts...');

        browser.on('disconnected', async () => {
            // ... existing cleanup code (will not be touched by replace if I target correctly)
            // functionality remains same
            console.log(`[BrowserManager] Browser closed. Cleaning up...`);
            BrowserManager.activeBrowsers.delete(account.id);
            // ...
        });

        // Use start line and end line to skip the disconnect block to keep it simple, 
        // wait, I can't skip the middle with replace_file_content easily without providing content.
        // I will just change the variable name in the top part.


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
            await SyncManager.uploadSession(account.id);
            console.log(`[Sync] Finished upload for ${account.name}`);
        });

        // Continue with setup
        try {
            console.log('[BrowserManager] Setup Continuing (EvasionPage)...');
            BrowserManager.lastPage = evasionPage; // Track for Element Picker

            // Setup Supervisor (2FA & Click/Type listener)
            await this.startSupervisor(evasionPage, account);

            console.log('[Evasion] ✓ All evasion scripts injected');

            // Apply Comprehensive Fingerprint
            await evasionPage.evaluateOnNewDocument((fp) => {
                // Hardware Properties
                if (fp.deviceMemory) {
                    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory }); } catch (e) { }
                }
                if (fp.hardwareConcurrency) {
                    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency }); } catch (e) { }
                }

                // WebGL Fingerprinting
                if (fp.webglRenderer) {
                    try {
                        const getParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function (parameter) {
                            if (parameter === 37445) return fp.webglVendor || 'Google Inc. (NVIDIA)';
                            if (parameter === 37446) return fp.webglRenderer;
                            return getParameter.apply(this, arguments);
                        };

                        // WebGL2 support
                        if (window.WebGL2RenderingContext) {
                            const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
                            WebGL2RenderingContext.prototype.getParameter = function (parameter) {
                                if (parameter === 37445) return fp.webglVendor || 'Google Inc. (NVIDIA)';
                                if (parameter === 37446) return fp.webglRenderer;
                                return getParameter2.apply(this, arguments);
                            };
                        }
                    } catch (e) { }
                }

                // Canvas Fingerprinting with Noise
                if (fp.canvasNoise) {
                    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                    const originalToBlob = HTMLCanvasElement.prototype.toBlob;

                    HTMLCanvasElement.prototype.toDataURL = function (type) {
                        const context = this.getContext('2d');
                        if (context) {
                            const imageData = context.getImageData(0, 0, this.width, this.height);
                            for (let i = 0; i < imageData.data.length; i += 4) {
                                imageData.data[i] = (imageData.data[i] + fp.canvasNoise.r) % 256;
                                imageData.data[i + 1] = (imageData.data[i + 1] + fp.canvasNoise.g) % 256;
                                imageData.data[i + 2] = (imageData.data[i + 2] + fp.canvasNoise.b) % 256;
                            }
                            context.putImageData(imageData, 0, 0);
                        }
                        return originalToDataURL.apply(this, arguments);
                    };
                }

                // Font Fingerprinting
                if (fp.fonts) {
                    // Override font detection
                    const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
                    CanvasRenderingContext2D.prototype.measureText = function (text) {
                        const result = originalMeasureText.call(this, text);
                        // Add slight variations based on fingerprint
                        if (fp.canvasNoise) {
                            result.width += (fp.canvasNoise.r % 3) * 0.01;
                        }
                        return result;
                    };
                }
            }, account.fingerprint);
        } catch (err) {
            console.error('[BrowserManager] Injection error:', err);
        }

        // Enhanced Anti-Detection Fingerprinting
        await evasionPage.evaluateOnNewDocument((fp) => {
            // 1. Navigator Properties
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

            // 2. Chrome Runtime
            window.chrome = {
                runtime: {},
                loadTimes: function () { },
                csi: function () { },
                app: {}
            };

            // 3. Permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // 4. Canvas Fingerprinting Protection
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function (type) {
                if (type === 'image/png' && this.width === 280 && this.height === 60) {
                    // Likely fingerprinting attempt
                    const context = this.getContext('2d');
                    const imageData = context.getImageData(0, 0, this.width, this.height);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        imageData.data[i] = imageData.data[i] ^ 0x01; // Add noise
                    }
                    context.putImageData(imageData, 0, 0);
                }
                return originalToDataURL.apply(this, arguments);
            };

            // 5. Audio Context Fingerprinting Protection
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
                AudioContext.prototype.createAnalyser = function () {
                    const analyser = originalCreateAnalyser.call(this);
                    const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
                    analyser.getFloatFrequencyData = function (array) {
                        originalGetFloatFrequencyData.call(this, array);
                        for (let i = 0; i < array.length; i++) {
                            array[i] = array[i] + (Math.random() - 0.5) * 0.0001; // Add noise
                        }
                    };
                    return analyser;
                };
            }

            // 6. WebRTC Leak Prevention
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = function () {
                return originalGetUserMedia.apply(this, arguments).catch(() => {
                    throw new DOMException('Permission denied', 'NotAllowedError');
                });
            };

            // 7. Timezone Consistency
            if (fp.timezone) {
                const originalDateTimeFormat = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function (...args) {
                    if (args.length === 0 || !args[0]) {
                        args[0] = fp.timezone;
                    }
                    return new originalDateTimeFormat(...args);
                };
                Intl.DateTimeFormat.prototype = originalDateTimeFormat.prototype;
            }

            // 8. Screen Properties
            if (fp.resolution) {
                const [width, height] = fp.resolution.split('x').map(Number);
                Object.defineProperty(window.screen, 'width', { get: () => width });
                Object.defineProperty(window.screen, 'height', { get: () => height });
                Object.defineProperty(window.screen, 'availWidth', { get: () => width });
                Object.defineProperty(window.screen, 'availHeight', { get: () => height - 40 });
            }

            // 9. Battery API
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1
                });
            }

            // 10. Connection API
            if (navigator.connection) {
                Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
                Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
                Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
            }
        }, account.fingerprint || {});

        // CLIENT-SIDE SCRIPT (Injected) - Handles Username, Password, Logs
        // ----------------------------------------------------------------
        // Expose for In-Page script (kept for redundancy/other fields)
        await page.exposeFunction('getTOTP', () => {
            /* Removed duplicate Enforcer
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
                    'input::-ms-reveal' // Pseudo-elements can't be removed by JS, handled by CSS or just ignored as we enforce type
                ];
    
                targets.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        el.remove(); // DELETE FROM DOM
                    });
                });
            }, 100); 
            */
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
                        'input::-ms-reveal' // Pseudo-elements can't be removed by JS, handled by CSS or just ignored as we enforce type
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


            if (account.loginUrl) {
                console.log(`[Browser] Navigating to ${account.loginUrl}`);
                try {
                    await page.goto(account.loginUrl, { waitUntil: 'load', timeout: 60000 });
                } catch (e) { console.warn('Nav timeout, continuing...'); }

                // IP Check
                try {
                    const ip = await page.evaluate(() => fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip));
                    console.log(`[Proxy-Check] Current Exit IP: ${ip}`);
                } catch (e) { }
            }
        } catch (err) {
            console.warn('[Browser] Navigation/Autofill issues:', err.message);
        }

        // Store browser instance in map
        BrowserManager.activeBrowsers.set(account.id, browser);
        console.log(`[BrowserManager] ✓ Browser instance stored for account: ${account.name}`);

        return browser;
    }

    static async startElementPicker(page) {
        if (!page || page.isClosed()) throw new Error('Browser page is not available.');

        console.log('[BrowserManager] Starting Element Picker...');

        // 1. Expose callback function
        // We use a promise to wait for the user to pick
        return new Promise(async (resolve, reject) => {
            let solved = false;

            // Timeout after 60s
            const timeout = setTimeout(() => {
                if (!solved) {
                    solved = true;
                    reject(new Error('Timed out waiting for element selection.'));
                }
            }, 60000);

            try {
                await page.exposeFunction('spectreElementPicked', (selector) => {
                    if (solved) return;
                    solved = true;
                    clearTimeout(timeout);
                    console.log('[BrowserManager] Element Picked:', selector);
                    resolve(selector);
                });

                // 2. Inject Inspector Script
                await page.evaluate(() => {
                    // Create Highlighter
                    const style = document.createElement('style');
                    style.id = 'spectre-picker-style';
                    style.innerHTML = `
                        .spectre-highlight {
                            outline: 2px solid #ff0000 !important;
                            background-color: rgba(255, 0, 0, 0.1) !important;
                            cursor: crosshair !important;
                        }
                    `;
                    document.head.appendChild(style);

                    let lastElement = null;

                    const mouseOverHandler = (e) => {
                        if (lastElement) lastElement.classList.remove('spectre-highlight');
                        e.target.classList.add('spectre-highlight');
                        lastElement = e.target;
                    };

                    const mouseOutHandler = (e) => {
                        e.target.classList.remove('spectre-highlight');
                    };

                    const clickHandler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Generate Selector (Basic)
                        const getSelector = (el) => {
                            if (el.tagName.toLowerCase() === 'html') return 'html';
                            if (el.id) return '#' + el.id;
                            if (el.className && typeof el.className === 'string') {
                                const classes = el.className.split(' ').filter(c => c !== 'spectre-highlight').join('.');
                                if (classes) return el.tagName.toLowerCase() + '.' + classes;
                            }
                            // Fallback to siblings
                            let siblingIndex = 1;
                            let sibling = el.previousElementSibling;
                            while (sibling) {
                                if (sibling.tagName === el.tagName) siblingIndex++;
                                sibling = sibling.previousElementSibling;
                            }
                            return el.tagName.toLowerCase() + ':nth-of-type(' + siblingIndex + ')';
                        };

                        // Build path
                        let path = [];
                        let current = e.target;
                        while (current && current.tagName.toLowerCase() !== 'body') {
                            path.unshift(getSelector(current));
                            current = current.parentElement;
                        }
                        const fullSelector = path.join(' > ');

                        // Cleanup
                        document.removeEventListener('mouseover', mouseOverHandler);
                        document.removeEventListener('mouseout', mouseOutHandler);
                        document.removeEventListener('click', clickHandler, true);
                        const styleNode = document.getElementById('spectre-picker-style');
                        if (styleNode) styleNode.remove();
                        if (lastElement) lastElement.classList.remove('spectre-highlight');

                        // Send back
                        window.spectreElementPicked(fullSelector);
                    };

                    document.addEventListener('mouseover', mouseOverHandler);
                    document.addEventListener('mouseout', mouseOutHandler);
                    document.addEventListener('click', clickHandler, { capture: true, once: true });
                });
            } catch (err) {
                clearTimeout(timeout);
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
                                    console.log(`[Supervisor] Generating code for secret: ${cleanSecret.substring(0, 4)}... with Time: ${new Date(serverTime).toISOString()}`);

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
                                    console.error(`[Supervisor] FATAL ERROR generating TOTP: ${err.message}`);
                                    active = false; // Stop loop to avoid spam
                                    return;
                                }

                                if (code) {
                                    console.log(`[Supervisor] Generated Code: ${code}`);
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

                                        console.log(`[Supervisor] Typed '${char}' into box ${i}`);
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
