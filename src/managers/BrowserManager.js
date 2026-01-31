const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { app } = require('electron');

// Data directory (replaces Electron's app.getPath('userData'))
const DATA_DIR = app.getPath('userData');

// ... (imports)

// ... (inside launchBrowser)

// ... (imports)
const ProxyChain = require('proxy-chain');
const SyncManager = require('./SyncManager');
const OTPAuth = require('otpauth');
const crypto = require('crypto');
const FingerprintGenerator = require('../utils/FingerprintGenerator');
const PuppeteerEvasion = require('../utils/PuppeteerEvasion');
const { getPool } = require('../database/mysql');

// Helper to send events to frontend for UX feedback
function sendToUI(channel, data) {
    try {
        const { getMainWindow } = require('../../main');
        const mainWindow = getMainWindow();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send(channel, data);
        }
    } catch (e) {
        // Main module not ready yet, ignore
    }
}

// Helper function to generate TOTP code (replaces otplib)
function generateTOTP(secret) {
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        digits: 6,
        period: 30
    });
    return totp.generate();
}

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

        // ================================================================
        // PROFILE LOCK CHECK - Only 1 user at a time
        // ================================================================
        const currentUserId = global.currentAuthUser?.id;
        const currentUsername = global.currentAuthUser?.username;

        // Check if profile is in use by another user
        if (account.currently_used_by_user_id && account.currently_used_by_user_id !== currentUserId) {
            const inUseBy = account.currently_used_by_name || 'Unknown user';
            throw new Error(`🔒 Profile đang được "${inUseBy}" sử dụng. Vui lòng đợi hoặc liên hệ Admin.`);
        }

        // Check if current user is restricted from using this profile
        if (account.usage_restricted_until && account.restricted_for_user_id === currentUserId) {
            const restrictedUntil = new Date(account.usage_restricted_until);
            const now = new Date();

            if (restrictedUntil > now) {
                const remainingMs = restrictedUntil - now;
                const remainingMin = Math.ceil(remainingMs / 60000);
                throw new Error(`⏳ Bạn bị hạn chế sử dụng profile này. Còn ${remainingMin} phút.`);
            }
        }

        // ================================================================
        // SET PROFILE AS IN USE by current user
        // ================================================================
        try {
            const { getPool } = require('../database/mysql');
            const pool = await getPool();
            await pool.query(`
                UPDATE accounts SET 
                    currently_used_by_user_id = ?,
                    currently_used_by_name = ?
                WHERE id = ?
            `, [currentUserId, currentUsername, accountId]);
            console.log(`[BrowserManager] Profile ${accountId} marked as in use by ${currentUsername}`);
        } catch (dbErr) {
            console.error('[BrowserManager] Failed to mark profile as in use:', dbErr.message);
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
        sendToUI('browser-loading-progress', { accountId: account.id, step: 'Syncing session...' });
        await SyncManager.downloadSession(account.id);

        sendToUI('browser-loading-progress', { accountId: account.id, step: 'Loading cookies...' });
        const storageData = await SyncManager.downloadStorage(account.id);

        sendToUI('browser-loading-progress', { accountId: account.id, step: 'Launching browser...' });
        console.log(`[BrowserManager] Launching: ${account.name} (${account.id})`);

        // v2.5.1: Prioritize bundled Chromium, fallback to system browsers
        let executablePath = null;

        // Bundled Iron Browser 141 paths (relative to project root)
        const projectRoot = path.join(__dirname, '..', '..');
        const bundledPaths = {
            win32: path.join(projectRoot, 'browser', '141', 'Chrome-bin', 'chrome.exe'),
            darwin: path.join(projectRoot, 'browser', 'mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
        };

        // Priority order: GemLogin's Chromium (tested on Windows N) > System Chrome > Bundled Chromium
        const platform = process.platform;
        const bundledPath = bundledPaths[platform];

        const systemPaths = platform === 'win32' ? [
            // GemLogin's Iron Browser 141 - better anti-detection than Chromium!
            path.join(os.homedir(), '.gemlogin', 'browser', '141', 'Chrome-bin', 'chrome.exe'),
            // Fallback to Chromium 134 if 141 not available
            path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData', 'Local', 'Chromium', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Chromium\\Application\\chrome.exe',
        ] : [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
        ];

        // Check system Chrome FIRST (like GemLogin)
        console.log('[BrowserManager] Checking system paths...');
        for (const p of systemPaths) {
            const exists = fs.existsSync(p);
            console.log(`[BrowserManager]   ${p} => ${exists ? 'FOUND' : 'not found'}`);
            if (exists) {
                executablePath = p;
                console.log(`[BrowserManager] ✓ SELECTED: ${executablePath}`);
                break;
            }
        }

        // Fallback to bundled Chromium only if no system Chrome found
        if (!executablePath && bundledPath && fs.existsSync(bundledPath)) {
            executablePath = bundledPath;
            console.log(`[BrowserManager] Using BUNDLED Chromium (fallback): ${executablePath}`);
        }

        if (!executablePath) throw new Error('Browser executable not found. Please install Google Chrome or ensure bundled Chromium is present.');

        const userDataDir = path.join(DATA_DIR, 'sessions', account.id);
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

        // EXACT GemLogin flags from chrome://version (copy-paste, no modifications!)
        const args = [
            '--remote-debugging-port=0', // REQUIRED: Puppeteer needs this to connect (auto-assign port like GemLogin)
            '--no-first-run',
            '--no-crashpad',
            '--disable-crashpad',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--disable-features=FlashDeprecationWarning,EnablePasswordsAccountStorage,CalculateNativeWinOcclusion,AcceleratedVideoDecode,ChromeLabs,ReadLater,ChromeWhatsNewUI,TrackingProtection3pcd',
            '--disable-crash-reporter',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--hide-crash-restore-bubble',
            '--disable-background-mode',
            '--disable-timer-throttling',
            '--disable-render-backgrounding',
            '--disable-background-media-suspend',
            '--disable-external-intent-requests',
            '--disable-ipc-flooding-protection',
            '--disable-extension-turned-off',
            `--user-data-dir=${userDataDir}`,
            `--profile-directory=${account.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)}`, // Custom profile name like GemLogin
            '--force-device-scale-factor=1'
        ];

        if (account.fingerprint && account.fingerprint.resolution) {
            args.push(`--window-size=${account.fingerprint.resolution.replace('x', ',')}`);
        } else {
            args.push('--start-maximized');
        }

        // User Agent - MUST match Iron Browser 141 version!
        const ironBrowserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
        args.push(`--user-agent=${ironBrowserUA}`);

        args.push(`--lang=${account.fingerprint?.language || 'vi-VN'}`); // Match fingerprint language

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
            args: args,
            ignoreHTTPSErrors: true,
            // CRITICAL: Ignore ALL Puppeteer default flags (like chrome-launcher does!)
            // Puppeteer adds many extra flags that GemLogin doesn't use
            ignoreDefaultArgs: true,
            // Remove pipe: true - it can cause connection issues on Windows
        });

        // Notify frontend that browser is now running
        sendToUI('browser-opened', { accountId: account.id, accountName: account.name });

        // Update last_active, currently_used_by, and log usage
        try {
            const pool = await getPool();
            // Get current user from global auth
            const currentUserId = global.currentAuthUser?.id || null;
            const currentUsername = global.currentAuthUser?.username || 'Unknown';

            // Set currently_used_by for real-time status
            await pool.query(
                `UPDATE accounts SET 
                    last_active = NOW(), 
                    last_accessed_by = ?,
                    last_accessed_by_name = ?,
                    currently_used_by = ?,
                    currently_used_by_name = ?
                WHERE id = ?`,
                [currentUserId, currentUsername, currentUserId, currentUsername, account.id]
            );

            // Log open action to usage history
            await pool.query(
                `INSERT INTO profile_usage_log (account_id, user_id, username, action) VALUES (?, ?, ?, 'open')`,
                [account.id, currentUserId, currentUsername]
            );

            console.log(`[BrowserManager] Updated status for ${account.name} (opened by ${currentUsername})`);
        } catch (dbErr) {
            console.error('[BrowserManager] Failed to update status:', dbErr.message);
        }

        // ---------------------------------------------------------
        // EVASION INJECTION (Critical Step)
        // ---------------------------------------------------------
        const pages = await browser.pages();
        const evasionPage = pages.length > 0 ? pages[0] : await browser.newPage();

        // HYBRID SYNC: Inject All Storage Data (Cookies + LocalStorage + SessionStorage)
        if (storageData) {
            // Inject Cookies
            if (storageData.cookies?.length > 0) {
                console.log(`[Sync] ✓ Downloaded ${storageData.cookies.length} cookies from DB`);
                console.log(`[Sync] Cookie domains:`, storageData.cookies.map(c => c.domain).join(', '));
                try {
                    await evasionPage.setCookie(...storageData.cookies);
                    console.log(`[Sync] ✓ Cookies injected successfully`);
                } catch (err) {
                    console.error(`[Sync] ✗ Cookie injection failed:`, err.message);
                }
            }

            // Inject LocalStorage
            if (storageData.localStorage && Object.keys(storageData.localStorage).length > 0) {
                try {
                    await evasionPage.evaluateOnNewDocument((data) => {
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
                    await evasionPage.evaluateOnNewDocument((data) => {
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




        browser.on('disconnected', () => {
            console.log(`[BrowserManager] Browser closed. Cleaning up...`);

            // IMMEDIATELY: Clean up state + notify UI (no await, sync operations)
            BrowserManager.activeBrowsers.delete(account.id);
            sendToUI('browser-syncing', { accountId: account.id, accountName: account.name, status: 'syncing' });

            // Proxy cleanup (fast, non-blocking)
            if (anonymizedProxyUrl) {
                ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true).catch(e =>
                    console.error('[Proxy] Close error:', e)
                );
            }
            if (proxyExtensionPath) {
                fs.remove(proxyExtensionPath).catch(() => { });
            }

            // FIRE-AND-FORGET SYNC: Use setTimeout to completely detach from event chain
            // This allows Electron to process other events and stay responsive
            setTimeout(() => {
                (async () => {
                    try {
                        console.log('[Sync] Starting background sync for', account.name);

                        // HYBRID-ONLY MODE: Skip heavy session folder backup (184MB+)
                        // Cookies + LocalStorage are already synced via uploadStorage()
                        // Fingerprint is stored separately in accounts.fingerprint
                        // This is sufficient for maintaining login sessions across machines
                        // await SyncManager.uploadSession(account.id); // DISABLED - too large

                        // Update last_active + CLEAR currently_used_by + log close action
                        try {
                            const pool = await getPool();
                            const currentUserId = global.currentAuthUser?.id || null;
                            const currentUsername = global.currentAuthUser?.username || 'Unknown';

                            // Clear currently_used_by for real-time status
                            await pool.query(
                                `UPDATE accounts SET 
                                    last_active = NOW(),
                                    currently_used_by_user_id = NULL,
                                    currently_used_by_name = NULL
                                WHERE id = ?`,
                                [account.id]
                            );

                            // Log close action to usage history
                            await pool.query(
                                `INSERT INTO profile_usage_log (account_id, user_id, username, action) VALUES (?, ?, ?, 'close')`,
                                [account.id, currentUserId, currentUsername]
                            );
                        } catch (dbErr) {
                            console.error('[BrowserManager] status update failed:', dbErr.message);
                        }

                        console.log(`[Sync] ✓ Completed for ${account.name}`);
                        sendToUI('browser-closed', { accountId: account.id, accountName: account.name, status: 'synced' });
                    } catch (syncErr) {
                        console.error('[Sync] ✗ Error:', syncErr.message);
                        sendToUI('browser-closed', { accountId: account.id, accountName: account.name, status: 'error' });
                    }
                })();
            }, 100); // Small delay to let Electron process pending events first
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

                // 1.5. CRITICAL: Match Iron Browser 141 version!
                const chromeVersion = '141.0.0.0';
                const chromeMajor = '141';

                // Override userAgentData (Critical for iphey detection!)
                if (navigator.userAgentData) {
                    Object.defineProperty(navigator, 'userAgentData', {
                        get: () => ({
                            brands: [
                                { brand: 'Chromium', version: chromeMajor },
                                { brand: 'Not)A;Brand', version: '99' }
                            ],
                            mobile: false,
                            platform: 'Windows',
                            getHighEntropyValues: (hints) => Promise.resolve({
                                brands: [
                                    { brand: 'Chromium', version: chromeMajor },
                                    { brand: 'Not)A;Brand', version: '99' }
                                ],
                                fullVersionList: [
                                    { brand: 'Chromium', version: chromeVersion },
                                    { brand: 'Not)A;Brand', version: '99.0.0.0' }
                                ],
                                mobile: false,
                                platform: 'Windows',
                                platformVersion: '10.0.0',
                                architecture: 'x86',
                                bitness: '64',
                                model: '',
                                uaFullVersion: chromeVersion
                            })
                        })
                    });
                }

                // Override appVersion
                Object.defineProperty(navigator, 'appVersion', {
                    get: () => `5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
                });

                // Override userAgent property (backup)
                Object.defineProperty(navigator, 'userAgent', {
                    get: () => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
                });

                // 2. Mock Chrome Runtime (Critical for IPHey)
                if (!window.chrome) window.chrome = {};
                if (!window.chrome.runtime) window.chrome.runtime = {};

                // Add chrome.csi and chrome.loadTimes (real Chrome has these)
                if (!window.chrome.csi) window.chrome.csi = () => ({});
                if (!window.chrome.loadTimes) window.chrome.loadTimes = () => ({});

                // ============================================
                // CRITICAL: AUTOMATION FRAMEWORK HIDING
                // ============================================

                // 2.1. Remove cdc_ properties (ChromeDriver/Puppeteer markers)
                const cdcProps = [
                    'cdc_adoQpoasnfa76pfcZLmcfl_Array',
                    'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
                    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'
                ];
                for (const prop of cdcProps) {
                    if (document[prop]) delete document[prop];
                    if (window[prop]) delete window[prop];
                }
                // Deep scan for any cdc_ properties
                Object.keys(window).forEach(key => {
                    if (/^cdc_/.test(key)) {
                        try { delete window[key]; } catch (e) { }
                    }
                });

                // 2.2. Remove Puppeteer-specific markers
                delete window.__puppeteer_evaluation_script__;
                delete window.__playwright_evaluation_script__;
                delete window.__webdriverTimeout;
                delete window.callPhantom;
                delete window._phantom;
                delete window.phantom;
                delete window.domAutomation;
                delete window.domAutomationController;

                // 2.3. Hide automation properties from Error stack
                const originalError = Error;
                window.Error = function (...args) {
                    const error = new originalError(...args);
                    const originalStack = error.stack;
                    Object.defineProperty(error, 'stack', {
                        get: function () {
                            return originalStack
                                .split('\n')
                                .filter(line => !line.includes('puppeteer') && !line.includes('automation'))
                                .join('\n');
                        }
                    });
                    return error;
                };
                window.Error.prototype = originalError.prototype;

                // 2.4. Override Notification permission prompt detection
                const originalQuery = window.Notification && Notification.permission;
                if (window.Notification) {
                    Object.defineProperty(Notification, 'permission', {
                        get: () => 'default'
                    });
                }

                // 2.5. Hide automation in navigator (beyond webdriver)
                Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
                Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
                Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
                Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

                // 3. Mock Plugins & MimeTypes - Updated for Chrome 134!
                // Note: Native Client was removed in Chrome 88+, PDF Viewer is now built-in
                const mockPlugins = [
                    {
                        name: 'PDF Viewer',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 2
                    },
                    {
                        name: 'Chrome PDF Viewer',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 2
                    },
                    {
                        name: 'Chromium PDF Viewer',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 2
                    },
                    {
                        name: 'Microsoft Edge PDF Viewer',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 2
                    },
                    {
                        name: 'WebKit built-in PDF',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 2
                    }
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
                            { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] },
                            { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] }
                        ];
                        m.item = (i) => m[i];
                        m.namedItem = (type) => m.find(x => x.type === type);
                        return m;
                    }
                });

                // 4. Mock Languages (Must match --lang flag!)
                Object.defineProperty(navigator, 'languages', {
                    get: () => runInfo.languages || ['vi-VN', 'vi', 'en-US', 'en'],
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
            }

            // ===================================================================
            // HYBRID SYNC: Periodic Storage Backup (Every 30s)
            // Moved outside loginUrl block to ensure it ALWAYS runs
            // =================================================================== 
            const cookieSyncInterval = setInterval(async () => {
                try {
                    if (browser.isConnected()) {
                        const allPages = await browser.pages();
                        if (allPages.length > 0) {
                            const page = allPages[0];

                            // Extract all storage data
                            const storageInfo = await page.evaluate(() => {
                                const localStorageData = {};
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    localStorageData[key] = localStorage.getItem(key);
                                }

                                const sessionStorageData = {};
                                for (let i = 0; i < sessionStorage.length; i++) {
                                    const key = sessionStorage.key(i);
                                    sessionStorageData[key] = sessionStorage.getItem(key);
                                }

                                return {
                                    localStorage: localStorageData,
                                    sessionStorage: sessionStorageData
                                };
                            });

                            // Get cookies
                            const cookies = await page.cookies();

                            // Upload everything
                            await SyncManager.uploadStorage(account.id, {
                                cookies,
                                localStorage: storageInfo.localStorage,
                                sessionStorage: storageInfo.sessionStorage
                            });

                            console.log(`[Sync] ✓ Periodic backup: ${cookies.length} cookies, ${Object.keys(storageInfo.localStorage).length} localStorage, ${Object.keys(storageInfo.sessionStorage).length} sessionStorage`);
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
                    // Extract all storage data
                    const storageInfo = await page.evaluate(() => {
                        const localStorageData = {};
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            localStorageData[key] = localStorage.getItem(key);
                        }

                        const sessionStorageData = {};
                        for (let i = 0; i < sessionStorage.length; i++) {
                            const key = sessionStorage.key(i);
                            sessionStorageData[key] = sessionStorage.getItem(key);
                        }

                        return {
                            localStorage: localStorageData,
                            sessionStorage: sessionStorageData
                        };
                    });

                    const cookies = await page.cookies();

                    await SyncManager.uploadStorage(account.id, {
                        cookies,
                        localStorage: storageInfo.localStorage,
                        sessionStorage: storageInfo.sessionStorage
                    });

                    console.log(`[Sync] ✓ Page load backup: ${cookies.length} cookies, ${Object.keys(storageInfo.localStorage).length} localStorage, ${Object.keys(storageInfo.sessionStorage).length} sessionStorage`);
                } catch (e) {
                    console.error('[Sync] Page load sync error:', e.message);
                }
            });

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
