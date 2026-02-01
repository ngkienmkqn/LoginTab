/**
 * ElectronBrowserManager.js
 * 
 * Browser management using Electron BrowserView with custom navigation toolbar.
 * This provides a full browser experience with address bar and navigation controls.
 */

const { BrowserWindow, BrowserView, session, app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const ProxyChain = require('proxy-chain');
const SyncManager = require('./SyncManager');
const FingerprintGenerator = require('../utils/FingerprintGenerator');
const { getPool } = require('../database/mysql');

const DATA_DIR = app.getPath('userData');

class ElectronBrowserManager {
    static activeWindows = new Map();
    static proxyServers = new Map();
    static ipcRegistered = false;

    /**
     * Register IPC handlers for browser navigation (called once)
     */
    static registerIPC() {
        if (ElectronBrowserManager.ipcRegistered) return;
        ElectronBrowserManager.ipcRegistered = true;

        // Navigation controls from toolbar
        ipcMain.on('browser-navigate', (event, { accountId, url }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view) {
                    let targetUrl = url;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        targetUrl = 'https://' + url;
                    }
                    view.webContents.loadURL(targetUrl);
                }
            }
        });

        ipcMain.on('browser-back', (event, { accountId }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view && view.webContents.canGoBack()) {
                    view.webContents.goBack();
                }
            }
        });

        ipcMain.on('browser-forward', (event, { accountId }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view && view.webContents.canGoForward()) {
                    view.webContents.goForward();
                }
            }
        });

        ipcMain.on('browser-reload', (event, { accountId }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view) {
                    view.webContents.reload();
                }
            }
        });

        ipcMain.on('browser-devtools', (event, { accountId }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view) {
                    view.webContents.openDevTools();
                }
            }
        });

        ipcMain.on('browser-clear-cookies', async (event, { accountId }) => {
            const win = ElectronBrowserManager.activeWindows.get(accountId);
            if (win && !win.isDestroyed()) {
                const view = win.getBrowserView();
                if (view) {
                    await view.webContents.session.clearStorageData({
                        storages: ['cookies', 'localstorage', 'sessionstorage']
                    });
                    console.log(`[ElectronBrowser] Cleared cookies for: ${accountId}`);
                }
            }
        });

        console.log('[ElectronBrowser] ✓ IPC handlers registered');
    }

    /**
     * Launch a browser profile with navigation toolbar
     */
    static async launchProfile(account, mode = null) {
        ElectronBrowserManager.registerIPC();

        // Check if window already open
        if (ElectronBrowserManager.activeWindows.has(account.id)) {
            const existingWin = ElectronBrowserManager.activeWindows.get(account.id);
            if (!existingWin.isDestroyed()) {
                existingWin.focus();
                return existingWin;
            }
            ElectronBrowserManager.activeWindows.delete(account.id);
        }

        console.log(`[ElectronBrowser] Launching profile: ${account.name}`);

        // Fingerprint management
        if (!account.fingerprint || !account.fingerprint.userAgent) {
            account.fingerprint = FingerprintGenerator.generateFingerprint(account.id);
            const pool = await getPool();
            await pool.query(
                'UPDATE accounts SET fingerprint_config = ? WHERE id = ?',
                [JSON.stringify(account.fingerprint), account.id]
            );
        }

        // Session partition
        const partitionName = `persist:profile-${account.id}`;
        const profileSession = session.fromPartition(partitionName);

        // Proxy configuration
        if (account.proxy && account.proxy.host && account.proxy.port) {
            const { host, port, user, pass, type = 'http' } = account.proxy;
            if (user && pass) {
                const upstreamUrl = `${type}://${user}:${pass}@${host}:${port}`;
                const anonymizedUrl = await ProxyChain.anonymizeProxy(upstreamUrl);
                ElectronBrowserManager.proxyServers.set(account.id, anonymizedUrl);
                await profileSession.setProxy({ proxyRules: anonymizedUrl });
            } else {
                await profileSession.setProxy({ proxyRules: `${type}://${host}:${port}` });
            }
        } else {
            await profileSession.setProxy({ proxyRules: '' });
        }

        // User agent spoofing
        const userAgent = account.fingerprint?.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

        profileSession.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['User-Agent'] = userAgent;
            if (account.fingerprint?.language) {
                details.requestHeaders['Accept-Language'] = account.fingerprint.language;
            }
            callback({ requestHeaders: details.requestHeaders });
        });

        // Load saved cookies
        try {
            const storageData = await SyncManager.downloadStorage(account.id);
            if (storageData?.cookies?.length > 0) {
                for (const cookie of storageData.cookies) {
                    try {
                        await profileSession.cookies.set({
                            url: `https://${cookie.domain.replace(/^\./, '')}`,
                            name: cookie.name,
                            value: cookie.value,
                            domain: cookie.domain,
                            path: cookie.path || '/',
                            secure: cookie.secure || false,
                            httpOnly: cookie.httpOnly || false,
                            expirationDate: cookie.expirationDate
                        });
                    } catch (e) { }
                }
            }
        } catch (err) { }

        // Create main window (shell with toolbar)
        const resolution = account.fingerprint?.resolution?.split('x') || [1920, 1080];
        const TOOLBAR_HEIGHT = 50;

        const win = new BrowserWindow({
            width: parseInt(resolution[0]) || 1920,
            height: parseInt(resolution[1]) || 1080,
            title: `${account.name} - Login Tab`,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            autoHideMenuBar: true
        });

        // Load toolbar HTML
        const toolbarHTML = ElectronBrowserManager.getToolbarHTML(account.id, account.name);
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(toolbarHTML)}`);

        // Create BrowserView for actual browsing
        const view = new BrowserView({
            webPreferences: {
                session: profileSession,
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        win.setBrowserView(view);

        // Position the view below toolbar
        const updateViewBounds = () => {
            const [width, height] = win.getContentSize();
            view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: width, height: height - TOOLBAR_HEIGHT });
        };

        updateViewBounds();
        win.on('resize', updateViewBounds);

        // Track this window
        ElectronBrowserManager.activeWindows.set(account.id, win);

        // Update URL bar when navigation happens
        view.webContents.on('did-navigate', (event, url) => {
            win.webContents.executeJavaScript(`
                document.getElementById('url-input').value = '${url.replace(/'/g, "\\'")}';
            `);
        });

        view.webContents.on('did-navigate-in-page', (event, url) => {
            win.webContents.executeJavaScript(`
                document.getElementById('url-input').value = '${url.replace(/'/g, "\\'")}';
            `);
        });

        // Fingerprint injection
        view.webContents.on('did-finish-load', async () => {
            const evasionScript = ElectronBrowserManager.getEvasionScript(account.fingerprint);
            try {
                await view.webContents.executeJavaScript(evasionScript);
            } catch (e) { }
        });

        // Cookie sync on close
        win.on('close', async () => {
            try {
                const cookies = await profileSession.cookies.get({});
                await SyncManager.uploadStorage(account.id, {
                    cookies: cookies,
                    localStorage: {},
                    sessionStorage: {}
                });
            } catch (err) { }

            const proxyUrl = ElectronBrowserManager.proxyServers.get(account.id);
            if (proxyUrl) {
                ProxyChain.closeAnonymizedProxy(proxyUrl, true);
                ElectronBrowserManager.proxyServers.delete(account.id);
            }
        });

        win.on('closed', () => {
            ElectronBrowserManager.activeWindows.delete(account.id);
        });

        // Navigate to start URL
        const startUrl = account.platform?.url || 'https://www.google.com';
        view.webContents.loadURL(startUrl);

        return win;
    }

    /**
     * Generate toolbar HTML
     */
    static getToolbarHTML(accountId, accountName) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            height: 50px;
            display: flex;
            align-items: center;
            padding: 0 10px;
            gap: 8px;
            -webkit-app-region: drag;
        }
        button {
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            -webkit-app-region: no-drag;
            transition: all 0.2s;
        }
        button:hover { background: rgba(255,255,255,0.2); }
        button:active { transform: scale(0.95); }
        #url-input {
            flex: 1;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            -webkit-app-region: no-drag;
        }
        #url-input:focus {
            outline: none;
            border-color: #4CAF50;
            background: rgba(255,255,255,0.15);
        }
        .profile-badge {
            background: linear-gradient(135deg, #4CAF50, #2E7D32);
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    </style>
</head>
<body>
    <button id="btn-back" title="Back">◀</button>
    <button id="btn-forward" title="Forward">▶</button>
    <button id="btn-reload" title="Reload">⟳</button>
    <input type="text" id="url-input" placeholder="Enter URL..." />
    <button id="btn-go" title="Go">→</button>
    <button id="btn-menu" title="Menu" style="font-size: 14px;">⚙️</button>
    <div class="profile-badge">${accountName}</div>
    
    <div id="menu-dropdown" style="display:none; position:absolute; right:10px; top:45px; background:#1a1a2e; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:5px 0; min-width:180px; z-index:1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        <div class="menu-item" id="menu-devtools">🔧 Developer Tools</div>
        <div class="menu-item" id="menu-clear-cookies">🍪 Clear Cookies</div>
        <div class="menu-item" id="menu-home">🏠 Go to Google</div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:5px 0;">
        <div class="menu-item" id="menu-close" style="color:#ff6b6b;">✕ Close Browser</div>
    </div>
    
    <style>
        .menu-item {
            padding: 10px 15px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
        }
        .menu-item:hover {
            background: rgba(255,255,255,0.1);
        }
    </style>
    
    <script>
        const { ipcRenderer } = require('electron');
        const accountId = '${accountId}';
        
        document.getElementById('btn-back').onclick = () => {
            ipcRenderer.send('browser-back', { accountId });
        };
        document.getElementById('btn-forward').onclick = () => {
            ipcRenderer.send('browser-forward', { accountId });
        };
        document.getElementById('btn-reload').onclick = () => {
            ipcRenderer.send('browser-reload', { accountId });
        };
        document.getElementById('btn-go').onclick = () => {
            const url = document.getElementById('url-input').value;
            ipcRenderer.send('browser-navigate', { accountId, url });
        };
        document.getElementById('url-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = document.getElementById('url-input').value;
                ipcRenderer.send('browser-navigate', { accountId, url });
            }
        });
        
        // Menu toggle
        document.getElementById('btn-menu').onclick = () => {
            const menu = document.getElementById('menu-dropdown');
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        };
        
        // Menu actions
        document.getElementById('menu-devtools').onclick = () => {
            ipcRenderer.send('browser-devtools', { accountId });
            document.getElementById('menu-dropdown').style.display = 'none';
        };
        document.getElementById('menu-clear-cookies').onclick = () => {
            ipcRenderer.send('browser-clear-cookies', { accountId });
            document.getElementById('menu-dropdown').style.display = 'none';
            alert('Cookies cleared!');
        };
        document.getElementById('menu-home').onclick = () => {
            ipcRenderer.send('browser-navigate', { accountId, url: 'https://www.google.com' });
            document.getElementById('menu-dropdown').style.display = 'none';
        };
        document.getElementById('menu-close').onclick = () => {
            window.close();
        };
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#btn-menu') && !e.target.closest('#menu-dropdown')) {
                document.getElementById('menu-dropdown').style.display = 'none';
            }
        });
    </script>
</body>
</html>
        `;
    }

    static async closeProfile(accountId) {
        const win = ElectronBrowserManager.activeWindows.get(accountId);
        if (win && !win.isDestroyed()) {
            win.close();
            return true;
        }
        return false;
    }

    static async closeAll() {
        for (const [accountId, win] of ElectronBrowserManager.activeWindows) {
            if (!win.isDestroyed()) win.close();
        }
        ElectronBrowserManager.activeWindows.clear();
    }

    static getActiveCount() {
        return ElectronBrowserManager.activeWindows.size;
    }

    static getEvasionScript(fingerprint) {
        return `
            (() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { 
                    get: () => ['${fingerprint?.language || 'en-US'}', 'en'] 
                });
                ${fingerprint?.resolution ? `
                    Object.defineProperty(screen, 'width', { get: () => ${fingerprint.resolution.split('x')[0]} });
                    Object.defineProperty(screen, 'height', { get: () => ${fingerprint.resolution.split('x')[1]} });
                ` : ''}
            })();
        `;
    }
}

module.exports = ElectronBrowserManager;
