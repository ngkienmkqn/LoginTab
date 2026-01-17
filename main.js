const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { initDB, getPool, getDatabaseStats, resetDatabase } = require('./src/database/mysql');
const BrowserManager = require('./src/managers/BrowserManager');
const ProxyChecker = require('./src/managers/ProxyChecker');
const AutomationManager = require('./src/managers/AutomationManager');
const FingerprintGenerator = require('./src/utils/FingerprintGenerator'); // FIX IMPORT
const { v4: uuidv4 } = require('uuid');

const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

let mainWindow;
let tray = null;
let isQuitting = false;

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('[Main] Another instance is already running. Quitting...');
    app.quit();
    process.exit(0); // Ensure it exits immediately
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[Main] Second instance detected. Showing existing window...');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });
}
async function initializeSystem() {
    try {
        console.log('[Main] App Data Path:', app.getPath('userData'));
        await initDB();
        await fs.ensureDir(SESSIONS_DIR);
        createWindow();
    } catch (error) {
        console.error('System initialization failed:', error);
        dialog.showErrorBox('System Initialization Failed',
            `The application failed to start correctly.\n\nError: ${error.message}\n\nPlease check your internet connection or database settings.`);
        app.quit();
    }
}

async function createWindow() {
    // Clear cache before creating window to prevent stale files
    const { session } = require('electron');
    await session.defaultSession.clearCache();
    console.log('[Main] Cache cleared for fresh start');

    // Global menu disable
    Menu.setApplicationMenu(null);

    const iconPath = path.join(__dirname, 'src/ui/assets/icon.png');
    console.log('[Main] Loading Icon from:', iconPath);
    const appIcon = nativeImage.createFromPath(iconPath);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        },
        title: 'Login Tab',
        icon: appIcon,
        autoHideMenuBar: true,
        backgroundColor: '#1e1e1e',
        show: false // Show only when ready
    });

    mainWindow.setMenu(null);

    mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // DevTools behavior controlled by login role now
    });

    // Intercept close to hide in tray
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Toggle DevTools (RBAC)
    ipcMain.on('toggle-devtools', (event, { visible }) => {
        if (visible) {
            mainWindow.webContents.openDevTools();
        } else {
            mainWindow.webContents.closeDevTools();
        }
    });

    createTray();
}

function createTray() {
    if (tray) return;

    try {
        const iconPath = path.join(__dirname, 'src/ui/assets/icon.png');
        let icon;

        if (fs.existsSync(iconPath)) {
            icon = nativeImage.createFromPath(iconPath);
        } else {
            // If No Icon: Use a colored block as fallback so it's VISIBLE on taskbar
            // On Windows, empty icons are invisible.
            icon = nativeImage.createFromPath(path.join(__dirname, 'node_modules/electron/dist/resources/default_app.asar/icon.png'));
            if (icon.isEmpty()) {
                icon = nativeImage.createEmpty();
            }
            console.warn('[Tray] Icon missing at', iconPath, '. Using fallback.');
        }

        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Spectre Browser (Active)',
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Show Window',
                click: () => {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Spectre Browser');
        tray.setContextMenu(contextMenu);

        tray.on('double-click', () => {
            mainWindow.show();
        });

        tray.on('click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    } catch (err) {
        console.error('[Tray] Failed to create tray:', err);
    }
}

// --- IPC: Element Picker ---
ipcMain.handle('pick-element', async (event, url) => {
    return new Promise((resolve) => {
        const pickerWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true // Safer for external sites
            },
            title: 'Element Picker - Click an element to select it',
            autoHideMenuBar: true
        });

        let picked = false;

        pickerWindow.loadURL(url).catch(err => {
            console.error('Picker load failed:', err);
            pickerWindow.close();
            resolve(null);
        });

        // Inject Picker Script
        const pickerScript = `
            (() => {
                let lastElement = null;
                const highlightStyle = '2px solid red';

                document.addEventListener('mouseover', (e) => {
                    e.stopPropagation();
                    if (lastElement) lastElement.style.outline = '';
                    e.target.style.outline = highlightStyle;
                    lastElement = e.target;
                }, true);

                document.addEventListener('mouseout', (e) => {
                    e.stopPropagation();
                    e.target.style.outline = '';
                }, true);

                function generateSelector(el) {
                    if (el.id) return '#' + el.id;
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => c.trim().length > 0).join('.');
                        if (classes.length > 0) return '.' + classes;
                    }
                    if (el.tagName === 'BODY') return 'body';
                    
                    // Fallback to minimal path
                    let path = [], parent = el;
                    while (parent && parent.tagName !== 'HTML') {
                        let selector = parent.tagName.toLowerCase();
                        if (parent.id) { 
                            selector += '#' + parent.id;
                            path.unshift(selector);
                            break; 
                        }
                        if (parent.className && typeof parent.className === 'string') {
                             const c = parent.className.split(' ').filter(x => x).join('.');
                             if(c) selector += '.' + c;
                        }
                        // nth-child if siblings exist
                        let sibling = parent;
                        let nth = 1;
                        while(sibling = sibling.previousElementSibling) { nth++; }
                        if (nth > 1) selector += ':nth-child(' + nth + ')';
                        
                        path.unshift(selector);
                        parent = parent.parentElement;
                    }
                    return path.join(' > ');
                }

                document.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const selector = generateSelector(e.target);
                    // Send back via title or console
                    console.log('__SPECTRE_PICKED__:' + selector);
                }, true);
            })();
        `;

        pickerWindow.webContents.on('did-finish-load', () => {
            pickerWindow.webContents.executeJavaScript(pickerScript).catch(() => { });
            pickerWindow.setTitle('PICKER MODE: Click any element to select');
        });

        // Listen for the specific console message
        pickerWindow.webContents.on('console-message', (e, level, message) => {
            if (message.startsWith('__SPECTRE_PICKED__:')) {
                const selector = message.replace('__SPECTRE_PICKED__:', '');
                picked = true;
                pickerWindow.close(); // Triggers close event
                resolve(selector);
            }
        });

        pickerWindow.on('closed', () => {
            if (!picked) resolve(null);
        });
    });
});

if (gotTheLock) {
    app.whenReady().then(initializeSystem);
}

app.on('window-all-closed', () => {
    // If we're in tray mode, we DO NOT quit even if all windows are closed.
    if (process.platform !== 'darwin' && isQuitting) {
        app.quit();
    }
});

// --- IPC HANDLERS ---

// Get all accounts (With assigned users info)
ipcMain.handle('get-accounts', async (event, user) => {
    try {
        const pool = await getPool();
        let query = `
            SELECT a.*, 
            (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
             FROM account_assignments aa 
             JOIN users u ON aa.user_id = u.id 
             WHERE aa.account_id = a.id) as assignedUsers
            FROM accounts a
        `;
        let params = [];

        if (user && user.role === 'staff') {
            query = `
                SELECT a.*, 
                (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
                 FROM account_assignments aa 
                 JOIN users u ON aa.user_id = u.id 
                 WHERE aa.account_id = a.id) as assignedUsers
                FROM accounts a
                JOIN account_assignments aa ON a.id = aa.account_id
                WHERE aa.user_id = ?
            `;
            params = [user.id];
        }

        const [rows] = await pool.query(query, params);
        return rows.map(row => ({
            ...row,
            assignedUsers: row.assignedUsers || 'None',
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
            createdAt: row.createdAt,
            lastActive: row.lastActive
        }));
    } catch (error) {
        console.error('Failed to get accounts:', error);
        return [];
    }
});

// Manage Assignments
ipcMain.handle('get-assignments', async (event, userId) => {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT account_id FROM account_assignments WHERE user_id = ?', [userId]);
    return rows.map(r => r.account_id);
});

ipcMain.handle('update-assignments', async (event, { userId, accountIds }) => {
    const pool = await getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM account_assignments WHERE user_id = ?', [userId]);
        for (const accId of accountIds) {
            await connection.query('INSERT INTO account_assignments (user_id, account_id) VALUES (?, ?)', [userId, accId]);
        }
        await connection.commit();
        return { success: true };
    } catch (err) {
        await connection.rollback();
        return { success: false, error: err.message };
    } finally {
        connection.release();
    }
});

// Bulk Assignment from Profiles
ipcMain.handle('get-eligible-users', async (event, role) => {
    const pool = await getPool();
    let query = '';
    if (role === 'super_admin') {
        query = "SELECT id, username, role FROM users WHERE role IN ('admin', 'staff')";
    } else if (role === 'admin') {
        query = "SELECT id, username, role FROM users WHERE role = 'staff'";
    } else {
        return [];
    }
    const [rows] = await pool.query(query);
    return rows;
});

ipcMain.handle('bulk-assign', async (event, { accountIds, userIds }) => {
    const pool = await getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const accId of accountIds) {
            for (const uId of userIds) {
                // INSERT IGNORE to avoid primary key conflict if already assigned
                await connection.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [uId, accId]);
            }
        }
        await connection.commit();
        return { success: true };
    } catch (err) {
        await connection.rollback();
        return { success: false, error: err.message };
    } finally {
        connection.release();
    }
});

ipcMain.handle('bulk-revoke', async (event, { accountIds, userIds }) => {
    const pool = await getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const accId of accountIds) {
            for (const uId of userIds) {
                await connection.query('DELETE FROM account_assignments WHERE user_id = ? AND account_id = ?', [uId, accId]);
            }
        }
        await connection.commit();
        return { success: true };
    } catch (err) {
        await connection.rollback();
        return { success: false, error: err.message };
    } finally {
        connection.release();
    }
});

// Create new account
ipcMain.handle('create-account', async (event, { name, loginUrl, proxy, fingerprint, auth, extensionsPath, notes, platformId, workflowId }) => {
    try {
        const pool = await getPool();
        const id = uuidv4();
        const newAccount = {
            id,
            name,
            loginUrl: loginUrl || '',
            extensions_path: extensionsPath || '',
            proxy_config: JSON.stringify(proxy || {}),
            fingerprint_config: JSON.stringify(FingerprintGenerator.generateFingerprint(id)), // Generate IMMEDIATELY
            auth_config: JSON.stringify(auth || {}),
            lastActive: null,
            notes: notes || '',
            platform_id: platformId || null,
            workflow_id: workflowId || null
        };

        await pool.query(
            'INSERT INTO accounts (id, name, loginUrl, proxy_config, auth_config, fingerprint_config, extensions_path, lastActive, notes, platform_id, workflow_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, newAccount.name, newAccount.loginUrl, newAccount.proxy_config, newAccount.auth_config, newAccount.fingerprint_config, newAccount.extensions_path, newAccount.lastActive, newAccount.notes, newAccount.platform_id, newAccount.workflow_id]
        );

        return { success: true, account: { ...newAccount, proxy, fingerprint, auth } };
    } catch (error) {
        console.error('Create failed:', error);
        return { success: false, error: error.message };
    }
});

// Update existing account
ipcMain.handle('update-account', async (event, updatedData) => {
    try {
        const pool = await getPool();
        const updates = {
            name: updatedData.name,
            loginUrl: updatedData.loginUrl || '',
            proxy_config: JSON.stringify(updatedData.proxy || {}),
            auth_config: JSON.stringify(updatedData.auth || {}),
            fingerprint_config: JSON.stringify(updatedData.fingerprint || {}),
            extensions_path: updatedData.extensionsPath || '',
            notes: updatedData.notes || '',
            platform_id: updatedData.platformId || null,
            workflow_id: updatedData.workflowId || null
        };

        await pool.query(
            'UPDATE accounts SET name = ?, loginUrl = ?, proxy_config = ?, auth_config = ?, fingerprint_config = ?, extensions_path = ?, notes = ?, platform_id = ?, workflow_id = ? WHERE id = ?',
            [updates.name, updates.loginUrl, updates.proxy_config, updates.auth_config, updates.fingerprint_config, updates.extensions_path, updates.notes, updates.platform_id, updates.workflow_id, updatedData.id]
        );

        return { success: true };
    } catch (error) {
        console.error('Update failed:', error);
        return { success: false, error: error.message };
    }
});

// Get 2FA Codes
ipcMain.handle('get-2fa-codes', async (event, items) => {
    const { authenticator } = require('otplib');
    return items.map(item => {
        try {
            return { id: item.id, token: authenticator.generate(item.secret) };
        } catch (e) {
            return { id: item.id, token: 'ERROR' };
        }
    });
});

const SyncManager = require('./src/managers/SyncManager');

// --- Global Resource Handlers ---

// Proxies
ipcMain.handle('get-proxies', async () => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM proxies');
        return rows;
    } catch (error) {
        console.error('Failed to get proxies:', error);
        return [];
    }
});

ipcMain.handle('save-proxy', async (event, proxy) => {
    try {
        const pool = await getPool();
        if (proxy.id) {
            await pool.query(
                'UPDATE proxies SET type = ?, host = ?, port = ?, user = ?, pass = ? WHERE id = ?',
                [proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass, proxy.id]
            );
        } else {
            await pool.query(
                'INSERT INTO proxies (id, type, host, port, user, pass) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass]
            );
        }
        return { success: true };
    } catch (error) {
        console.error('Save proxy failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-proxy', async (event, id) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM proxies WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Login




// Extensions
ipcMain.handle('get-extensions', async () => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM extensions');
        return rows;
    } catch (error) {
        console.error('Get extensions failed:', error);
        return [];
    }
});

ipcMain.handle('save-extension', async (event, ext) => {
    try {
        const pool = await getPool();
        await pool.query(
            'INSERT INTO extensions (id, name, path) VALUES (?, ?, ?)',
            [uuidv4(), ext.name, ext.path]
        );
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-extension', async (event, id) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM extensions WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Platforms (Presets)
ipcMain.handle('get-platforms', async () => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM platforms');
        return rows;
    } catch (error) {
        return [];
    }
});

ipcMain.handle('save-platform', async (event, platform) => {
    try {
        const pool = await getPool();
        await pool.query(
            'INSERT INTO platforms (id, name, url) VALUES (?, ?, ?)',
            [uuidv4(), platform.name, platform.url]
        );
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('update-platform', async (event, platform) => {
    try {
        const pool = await getPool();
        await pool.query(
            'UPDATE platforms SET name = ?, url = ? WHERE id = ?',
            [platform.name, platform.url, platform.id]
        );
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-platform', async (event, id) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM platforms WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Launch Profile
ipcMain.handle('launch-browser', async (event, arg) => {
    try {
        let accountId = arg;
        let modeOverride = null;

        if (typeof arg === 'object' && arg.id) {
            accountId = arg.id;
            modeOverride = arg.mode;
        }

        const pool = await getPool();
        console.log(`[IPC] launch-browser called for: ${accountId} (Mode: ${modeOverride})`);

        // Get full account data
        const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
        if (rows.length === 0) throw new Error('Account not found');

        const row = rows[0];
        const account = {
            ...row,
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
            extensionsPath: row.extensions_path,
            automation_mode: row.automation_mode || 'auto'
        };

        // SYNC LOGIC: Check if local session exists
        const sessionPath = path.join(SESSIONS_DIR, accountId);
        const hasLocal = await fs.pathExists(sessionPath);

        if (!hasLocal) {
            console.log('[Main] Local session missing. Starting fresh.');
        }

        const browser = await BrowserManager.launchProfile(account, modeOverride);

        // Update Last Active timestamp on close
        browser.on('disconnected', async () => {
            const now = new Date();
            await pool.query('UPDATE accounts SET lastActive = ? WHERE id = ?', [now, accountId]);
        });

        // Execute workflow if assigned AND automation mode is 'auto'
        const automationMode = account.automation_mode || 'auto';
        console.log(`[IPC] Automation mode: ${automationMode}`);

        if (automationMode === 'manual') {
            console.log('[IPC] Manual mode - skipping workflow execution');
            console.log('[IPC] User should log in manually. Session will be saved automatically.');
        } else if (account.workflow_id) {
            console.log(`[IPC] Loading workflow: ${account.workflow_id}`);

            const [workflowRows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [account.workflow_id]);
            if (workflowRows.length > 0) {
                const workflow = workflowRows[0];
                // graph_data is already parsed by mysql2 driver
                const graphData = typeof workflow.graph_data === 'string'
                    ? JSON.parse(workflow.graph_data)
                    : workflow.graph_data || {};

                const workflowData = {
                    drawflow: {
                        Home: {
                            data: graphData
                        }
                    }
                };

                console.log(`[IPC] Executing workflow: ${workflow.name}`);

                // Get current page
                const page = BrowserManager.lastPage;
                if (page) {
                    const AutomationManager = require('./src/managers/AutomationManager');
                    const automationManager = new AutomationManager(BrowserManager);
                    await automationManager.runWorkflow(workflowData, page, account);
                    console.log('[IPC] Workflow execution completed');
                }
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Launch failed:', error);
        return { success: false, error: error.message };
    }
});

// Delete Account
ipcMain.handle('delete-account', async (event, accountId) => {
    try {
        const pool = await getPool();

        // Delete account record
        await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);

        // Delete session backup from MySQL
        await pool.query('DELETE FROM session_backups WHERE account_id = ?', [accountId]);
        console.log(`[Delete] Removed session backup for account: ${accountId}`);

        // Remove local session folder
        const sessionPath = path.join(SESSIONS_DIR, accountId);
        await fs.remove(sessionPath);
        console.log(`[Delete] Removed local session folder: ${sessionPath}`);

        return { success: true };
    } catch (error) {
        console.error('Delete failed:', error);
        return { success: false, error: error.message };
    }
});

// --- AUTHENTICATION ---
ipcMain.handle('auth-login', async (event, { username, password }) => {
    try {
        const pool = await getPool();
        // Check hardcoded admin (Bootstrap)
        if (username === 'admin' && password === 'Kien123!!') {
            // Ensure admin exists in DB
            const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"');
            let user;
            if (rows.length === 0) {
                const id = uuidv4();
                await pool.query('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', [id, 'admin', 'Kien123!!', 'super_admin']);
                user = { id, username: 'admin', role: 'super_admin' };
            } else {
                user = rows[0];
            }
            return { success: true, user: { id: user.id, username: user.username, role: user.role } };
        }

        // Check DB users
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (rows.length > 0) {
            const user = rows[0];
            return { success: true, user: { id: user.id, username: user.username, role: user.role } };
        }

        return { success: false, error: 'Valid username/password required' };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
});

// --- USER MANAGEMENT (RBAC) ---

ipcMain.handle('get-users', async () => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT id, username, role FROM users');
        return rows;
    } catch (error) {
        return [];
    }
});

ipcMain.handle('save-user', async (event, userData) => {
    try {
        const pool = await getPool();
        if (!userData.id) {
            const [exists] = await pool.query('SELECT * FROM users WHERE username = ?', [userData.username]);
            if (exists.length > 0) return { success: false, error: 'Username already exists' };

            await pool.query(
                'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
                [uuidv4(), userData.username, userData.password, userData.role]
            );
        } else {
            await pool.query(
                'UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?',
                [userData.username, userData.password, userData.role, userData.id]
            );
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Delete User
ipcMain.handle('delete-user', async (event, id) => {
    try {
        const pool = await getPool();
        // Prevent deleting default admin
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length > 0) {
            const user = rows[0];
            if (user.role === 'super_admin' && user.username === 'admin') {
                return { success: false, error: 'Cannot delete default Super Admin' };
            }
        }

        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Check Proxy Health
ipcMain.handle('check-proxy-health', async (event, proxy) => {
    try {
        const healthScore = await ProxyChecker.checkProxyHealth(proxy);
        return {
            success: true,
            score: healthScore,
            label: ProxyChecker.getHealthLabel(healthScore),
            color: ProxyChecker.getHealthColor(healthScore)
        };
    } catch (error) {
        return { success: false, score: 0 };
    }
});

// Update Account Notes
ipcMain.handle('update-account-notes', async (event, accountId, notes) => {
    try {
        const pool = await getPool();
        await pool.query('UPDATE accounts SET notes = ? WHERE id = ?', [notes, accountId]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Database Stats
ipcMain.handle('get-database-stats', async () => {
    return await getDatabaseStats();
});

// --- IPC: Database Management ---
ipcMain.handle('database:get-stats', async () => {
    return await getDatabaseStats();
});

ipcMain.handle('database:reset', async () => {
    console.log('[Main] Received database reset request (Keeping Workflows)');
    try {
        await resetDatabase(true); // true = keep workflows

        // Re-initialize any in-memory state if needed
        await initDB();

        return { success: true };
    } catch (error) {
        console.error('Reset failed:', error);
        return { success: false, error: error.message };
    }
});

// Automation Handlers
const automationManager = new AutomationManager(BrowserManager);

ipcMain.handle('save-workflow', async (event, workflow) => {
    try {
        const pool = await getPool();
        // Upsert logic
        const query = `
            INSERT INTO workflows (id, name, platform, graph_data, created_by, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), platform = VALUES(platform), graph_data = VALUES(graph_data), is_active = VALUES(is_active)
        `;
        const id = workflow.id || uuidv4();

        console.log('[SAVE] Received workflow.graph_data type:', typeof workflow.graph_data);
        console.log('[SAVE] Received workflow.graph_data:', workflow.graph_data);

        const jsonData = JSON.stringify(workflow.graph_data);
        console.log('[SAVE] Stringified length:', jsonData.length);
        console.log('[SAVE] Stringified preview:', jsonData.substring(0, 200));

        await pool.query(query, [id, workflow.name, workflow.platform || 'all', jsonData, workflow.createdBy || 'system', true]);
        return { success: true, id };
    } catch (e) {
        console.error('Save Workflow Error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-workflow', async (event, id) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM workflows WHERE id = ?', [id]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('clear-all-workflows', async (event) => {
    try {
        const pool = await getPool();
        await pool.query('TRUNCATE TABLE workflows');
        console.log('[ADMIN] All workflows cleared');
        return { success: true };
    } catch (e) {
        console.error('[ADMIN] Clear workflows error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-workflows', async () => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT id, name, platform, created_at FROM workflows ORDER BY created_at DESC');
        return rows;
    } catch (e) {
        return [];
    }
});



ipcMain.handle('load-workflow', async (event, id) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [id]);
        if (rows.length > 0) {
            let graphData = {};
            try {
                // CRITICAL FIX: MySQL might auto-parse JSON, check type first
                const rawData = rows[0].graph_data;

                if (typeof rawData === 'string') {
                    // It's a string, need to parse
                    graphData = JSON.parse(rawData);
                    console.log('[LOAD] Parsed JSON string to object');
                } else if (typeof rawData === 'object' && rawData !== null) {
                    // Already an object, use directly
                    graphData = rawData;
                    console.log('[LOAD] Data already parsed by MySQL');
                } else {
                    console.log('[LOAD] Unexpected data type:', typeof rawData);
                }

                console.log('[LOAD] Final graph_data:', graphData);
                console.log('[LOAD] Node count:', Object.keys(graphData || {}).length);
            } catch (err) {
                console.error('JSON Parse Error for Workflow:', err);
                // Return empty object if corrupted
            }
            return { success: true, workflow: { ...rows[0], graph_data: graphData } };
        }
        return { success: false, error: 'Not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('open-element-picker', async (event, { url, nodeId }) => {
    try {
        const fs = require('fs-extra');
        const path = require('path');

        console.log('[Element Picker] Launching browser for URL:', url);

        // Use same Chrome path detection as BrowserManager
        const possiblePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_PATH
        ];

        const executablePath = possiblePaths.find(p => p && fs.existsSync(p));
        if (!executablePath) {
            throw new Error('Chrome executable not found. Install Google Chrome first.');
        }

        // Use puppeteer-core with Chrome path
        const puppeteer = require('puppeteer-core');


        const browser = await puppeteer.launch({
            executablePath,
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        });

        const page = await browser.newPage();

        // Read picker script once
        const pickerScript = await fs.readFile(path.join(__dirname, 'src/scripts/element-picker.js'), 'utf8');

        // Navigate to initial URL
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Inject picker on initial page
        await page.evaluate(pickerScript);
        console.log('[Element Picker] Picker initialized on:', url);

        // Re-inject picker script on EVERY page navigation
        page.on('framenavigated', async (frame) => {
            if (frame === page.mainFrame()) {
                try {
                    await page.evaluate(pickerScript);
                    console.log('[Element Picker] Re-injected on:', page.url());
                } catch (e) {
                    console.warn('[Element Picker] Re-injection failed:', e.message);
                }
            }
        });

        console.log('[Element Picker] Waiting for selection (navigate freely)...');

        // Poll for selector (survives navigation)
        const selector = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearInterval(poll);
                reject(new Error('Timeout'));
            }, 120000);

            const poll = setInterval(async () => {
                try {
                    const picked = await page.evaluate(() => window.__pickedSelector);
                    if (picked) {
                        clearInterval(poll);
                        clearTimeout(timeout);
                        resolve(picked);
                    }
                } catch (e) { }
            }, 500);
        });

        console.log('[Element Picker] Selector captured:', selector);

        // Wait a bit before closing to ensure selector is fully captured
        await new Promise(resolve => setTimeout(resolve, 500));

        await browser.close();
        return { success: true, selector };
    } catch (error) {
        console.error('[Element Picker] Error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('run-automation-on-profile', async (event, { profileId, workflowId }) => {
    try {
        // 1. Launch Profile (if not already?) or attach?
        // Basic implementation: Launch new instance
        const launchRes = await BrowserManager.launchBrowser(profileId);
        if (!launchRes.success) return { success: false, error: launchRes.error };

        const { page } = launchRes;

        // 2. Load Workflow
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [workflowId]);
        if (rows.length === 0) return { success: false, error: 'Workflow not found' };

        const workflowData = JSON.parse(rows[0].graph_data);

        // 3. Execute
        await automationManager.runWorkflow({ drawflow: { Home: { data: workflowData } } }, page);
        return { success: true };
    } catch (e) {
        console.error('Run Automation Error:', e);
        return { success: false, error: e.message };
    }
});
// Element Picker
ipcMain.handle('start-element-picker', async () => {
    try {
        if (!BrowserManager.lastPage || BrowserManager.lastPage.isClosed()) {
            return { success: false, error: 'No active browser found. Please launch a profile first.' };
        }
        const selector = await BrowserManager.startElementPicker(BrowserManager.lastPage);
        return { success: true, selector };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
