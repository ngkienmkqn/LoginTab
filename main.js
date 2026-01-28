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

// ==================== RBAC v2: Session Management ====================
global.currentAuthUser = null; // { id, username, role }

// ==================== RBAC v2: Audit Logging ====================
async function auditLog(action, userId, details) {
    try {
        const pool = await getPool();
        await pool.execute(
            `INSERT INTO audit_log (action, user_id, target_user_id, details, timestamp) 
             VALUES (?, ?, ?, ?, NOW())`,
            [
                action,
                userId,
                details.targetUserId || null,
                JSON.stringify(details)
            ]
        );
        console.log(`[AUDIT] ${action} by ${userId}:`, details);
    } catch (error) {
        console.error('[AUDIT] Failed to log:', error);
    }
}

// ==================== RBAC v2: Authorization Helpers ====================

// Helper: Check if caller has scope access to target user
async function checkScope(caller, target) {
    if (caller.role === 'super_admin') return true;
    if (caller.role === 'admin') {
        // Admin can access: managed staff + self
        if (target.id === caller.id) return true;
        return target.managed_by_admin_id === caller.id;
    }
    return false; // Staff cannot manage users
}

// Helper: Check if user has specific permission (override > role default)
async function checkPermission(userId, permissionKey) {
    try {
        const pool = await getPool();

        // Check for override first
        const [overrides] = await pool.query(
            'SELECT enabled FROM user_permissions WHERE user_id = ? AND permission_key = ?',
            [userId, permissionKey]
        );

        if (overrides.length > 0) {
            return overrides[0].enabled === 1;
        }

        // Fall back to role defaults
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return false;

        const role = users[0].role;
        const roleDefaults = {
            super_admin: ['users.view', 'users.edit', 'users.delete', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.delete', 'accounts.create'],
            admin: ['users.view', 'users.edit', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.create'],
            staff: ['accounts.view']
        };

        return (roleDefaults[role] || []).includes(permissionKey);
    } catch (error) {
        console.error('[Permission] Check failed:', error);
        return false;
    }
}

// Helper: Combined authorization check (scope + permission)
async function authorize(callerId, action, targetId) {
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return false;

        const caller = callers[0];

        // Step 1: Scope Gate (if target is specified)
        if (targetId) {
            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
            if (targets.length === 0) return false;

            const target = targets[0];
            const hasScope = await checkScope(caller, target);
            if (!hasScope) {
                console.log('[Auth] Denied: Target out of scope');
                return false;
            }
        }

        // Step 2: Permission Check
        const hasPermission = await checkPermission(callerId, action);
        if (!hasPermission) {
            console.log('[Auth] Denied: Missing permission');
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Auth] Error:', error);
        return false;
    }
}

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
        title: `Login Tab v${require('./package.json').version}`,
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

    // Emit window-focused event for input focus recovery
    mainWindow.on('focus', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-focused');
        }
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
// REMOVED: Duplicate handler - see RBAC v2 version at line ~980
/*
ipcMain.handle('get-accounts', async (event) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const user = callers[0];

        let query = `
            SELECT a.*, 
            (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
             FROM account_assignments aa 
             JOIN users u ON aa.user_id = u.id 
             WHERE aa.account_id = a.id) as assignedUsers
            FROM accounts a
        `;
        let params = [];

        if (user.role === 'staff') {
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
*/

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

// Reset Database & Clear Sessions (CRITICAL FIX)
ipcMain.handle('reset-db', async (event, { keepWorkflows }) => {
    console.log('[reset-db] Starting complete database reset...');
    const pool = await getPool();
    const connection = await pool.getConnection();

    try {
        // 1. Close all open browsers
        const { BrowserManager } = require('./src/managers/BrowserManager');
        if (BrowserManager && BrowserManager.closeAll) {
            await BrowserManager.closeAll();
        }

        // 2. Clear Session Files (Force Delete)
        try {
            const sessionsDir = path.join(app.getPath('userData'), 'sessions');
            await fs.emptyDir(sessionsDir);
            console.log('[reset-db] ✓ Sessions directory cleared.');
        } catch (e) {
            console.error('[reset-db] ⚠ Failed to clear sessions dir:', e.message);
        }

        // 3. Truncate Tables
        await connection.beginTransaction();

        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('TRUNCATE TABLE account_assignments');
        await connection.query('TRUNCATE TABLE accounts');
        await connection.query('TRUNCATE TABLE proxies');
        await connection.query('TRUNCATE TABLE extensions');
        // await connection.query('TRUNCATE TABLE user_permissions'); // Keep permissions? Maybe reset.
        // await connection.query('TRUNCATE TABLE audit_log');

        if (!keepWorkflows) {
            await connection.query('TRUNCATE TABLE workflow_nodes');
            await connection.query('TRUNCATE TABLE automations');
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
        console.log('[reset-db] ✓ Database truncated.');

        return { success: true };

    } catch (err) {
        await connection.rollback();
        console.error('[reset-db] Failed:', err);
        return { success: false, error: err.message };
    } finally {
        connection.release();
    }
});

// Create new account
ipcMain.handle('create-account', async (event, { name, loginUrl, proxy, fingerprint, auth, extensionsPath, notes, platformId, workflowId }) => {
    // Retry logic for network errors
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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

            // Auto-assign to creator (Fix for Admin ownership)
            if (global.currentAuthUser && global.currentAuthUser.id) {
                await pool.query(
                    'INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)',
                    [global.currentAuthUser.id, id]
                );
                console.log(`[create-account] Auto-assigned ${id} to creator ${global.currentAuthUser.username}`);
            }

            console.log(`[create-account] ✓ Profile created successfully: ${name}`);
            return { success: true, account: { ...newAccount, proxy, fingerprint, auth } };

        } catch (error) {
            lastError = error;

            // Retry on network errors
            if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') && attempt < maxRetries) {
                console.log(`[create-account] Network error (attempt ${attempt}/${maxRetries}), retrying in 1s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // Non-retryable error or max retries reached
            console.error('[create-account] Failed:', error);
            return { success: false, error: error.message || 'Failed to create profile' };
        }
    }

    // All retries failed
    console.error('[create-account] All retries exhausted');
    return { success: false, error: lastError?.message || 'Failed to create profile after retries' };
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

ipcMain.handle('delete-user', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();

        // Authorization check
        const authorized = await authorize(callerId, 'users.delete', userId);
        if (!authorized) {
            throw new Error('Unauthorized: Cannot delete this user');
        }

        // Get target user for audit
        const [targets] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
        const targetUsername = targets[0]?.username || 'unknown';

        await pool.query('DELETE FROM users WHERE id = ?', [userId]);

        await auditLog('delete_user', callerId, {
            targetUserId: userId,
            username: targetUsername
        });

        return { success: true };
    } catch (error) {
        console.error('[delete-user] Error:', error);
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

// Generate Fingerprint Preview
ipcMain.handle('preview-fingerprint', async (event, currentId, os) => {
    try {
        const id = currentId || 'PREVIEW_' + Date.now(); // Volatile seed for "New" accounts
        const fp = FingerprintGenerator.generateFingerprint(id, os || 'win');
        return { success: true, fingerprint: fp };
    } catch (e) {
        console.error('Preview failed:', e);
        return { success: false, error: e.message };
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
                    await automationManager.runWorkflow(
                        workflowData,
                        page,
                        {}, // userProfile (placeholder)
                        { // profileContext (Variables)
                            username: account.auth?.username || '',
                            password: account.auth?.password || '',
                            twofa: account.auth?.twoFactorSecret || account.auth?.secret2FA || ''
                        }
                    );
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
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();

        // STEP 1: SCOPE GATE - Check account ownership/assignment
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];

        if (caller.role === 'staff') {
            // Staff can only delete accounts assigned to them
            const [assignments] = await pool.query(
                'SELECT * FROM account_assignments WHERE account_id = ? AND user_id = ?',
                [accountId, callerId]
            );
            if (assignments.length === 0) {
                throw new Error('Access denied: Account not assigned to you');
            }
        } else if (caller.role === 'admin') {
            // Admin can only delete accounts assigned to managed staff OR assigned to self
            const [accounts] = await pool.query(
                `SELECT a.* FROM accounts a
                 JOIN account_assignments aa ON a.id = aa.account_id
                 LEFT JOIN users u ON aa.user_id = u.id
                 WHERE a.id = ? AND (u.managed_by_admin_id = ? OR aa.user_id = ?)`,
                [accountId, callerId, callerId]
            );
            if (accounts.length === 0) {
                throw new Error('Access denied: Account out of scope');
            }
        }
        // Super Admin can delete any account (no scope restriction)

        // STEP 2: PERMISSION CHECK
        const hasPermission = await checkPermission(callerId, 'accounts.delete');
        if (!hasPermission) {
            throw new Error('Unauthorized: Missing accounts.delete permission');
        }

        // Delete account record
        await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);

        // Delete session backup from MySQL
        await pool.query('DELETE FROM session_backups WHERE account_id = ?', [accountId]);
        console.log(`[Delete] Removed session backup for account: ${accountId}`);

        // Remove local session folder
        const sessionPath = path.join(SESSIONS_DIR, accountId);
        await fs.remove(sessionPath);
        console.log(`[Delete] Removed local session folder: ${sessionPath}`);

        await auditLog('delete_account', callerId, {
            targetAccountId: accountId
        });

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

            // RBAC v2: Set global session
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);

            return { success: true, user: { id: user.id, username: user.username, role: user.role } };
        }

        // Check DB users
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (rows.length > 0) {
            const user = rows[0];

            // RBAC v2: Set global session
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);

            return { success: true, user: { id: user.id, username: user.username, role: user.role } };
        }

        return { success: false, error: 'Valid username/password required' };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
});

// RBAC v2: Logout handler
ipcMain.handle('auth-logout', async (event) => {
    console.log('[Auth] Logout:', global.currentAuthUser);
    global.currentAuthUser = null;
    return { success: true };
});

// --- USER MANAGEMENT (RBAC) ---

// ==================== RBAC v2: Account Scoping ====================

// Get Accounts (Scoped by Role)
ipcMain.handle('get-accounts', async () => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        let query, params;

        if (caller.role === 'super_admin') {
            // Super Admin sees ALL accounts
            query = `
                SELECT a.*, 
                (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
                 FROM account_assignments aa 
                 JOIN users u ON aa.user_id = u.id 
                 WHERE aa.account_id = a.id) as assignedUsers
                FROM accounts a
            `;
            params = [];
        } else if (caller.role === 'admin') {
            // Admin sees ONLY accounts assigned to managed staff + self
            query = `
                SELECT DISTINCT a.*,
                (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') 
                 FROM account_assignments aa 
                 JOIN users u ON aa.user_id = u.id 
                 WHERE aa.account_id = a.id) as assignedUsers
                FROM accounts a
                LEFT JOIN account_assignments aa ON a.id = aa.account_id
                WHERE aa.user_id IN (
                    SELECT id FROM users 
                    WHERE managed_by_admin_id = ? OR id = ?
                )
            `;
            params = [callerId, callerId];
        } else if (caller.role === 'staff') {
            // Staff sees ONLY accounts assigned to self
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
            params = [callerId];
        } else {
            // Unknown role
            return [];
        }

        const [accounts] = await pool.query(query, params);

        // Parse JSON configs (like old handler)
        return accounts.map(row => ({
            ...row,
            assignedUsers: row.assignedUsers || 'None',
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
            createdAt: row.createdAt,
            lastActive: row.lastActive
        }));

    } catch (error) {
        console.error('[get-accounts] Error:', error);
        throw error;
    }
});

// Get Users (Scoped by Role)
ipcMain.handle('get-users', async () => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        // STEP 1: PERMISSION CHECK (users.view required for scope-first-then-permission)
        const hasPermission = await checkPermission(callerId, 'users.view');
        if (!hasPermission) {
            throw new Error('Unauthorized: Missing users.view permission');
        }

        // STAFF DENIAL: Staff cannot access user management at backend
        if (caller.role === 'staff') {
            throw new Error('Access denied: Staff users cannot view user list');
        }

        // STEP 2: SCOPE GATE
        let query, params;
        if (caller.role === 'super_admin') {
            // Super Admin sees ALL users with account counts
            query = `
                SELECT 
                    u.id, 
                    u.username, 
                    u.role, 
                    u.managed_by_admin_id,
                    COUNT(DISTINCT aa.account_id) as assigned_accounts_count
                FROM users u
                LEFT JOIN account_assignments aa ON u.id = aa.user_id
                GROUP BY u.id, u.username, u.role, u.managed_by_admin_id
            `;
            params = [];
            const [rows] = await pool.query(query, params);
            return rows;
        } else if (caller.role === 'admin') {
            // Admin sees: managed staff + self, with account counts
            query = `
                SELECT 
                    u.id, 
                    u.username, 
                    u.role, 
                    u.managed_by_admin_id,
                    COUNT(DISTINCT aa.account_id) as assigned_accounts_count
                FROM users u
                LEFT JOIN account_assignments aa ON u.id = aa.user_id
                WHERE u.managed_by_admin_id = ? OR u.id = ?
                GROUP BY u.id, u.username, u.role, u.managed_by_admin_id
            `;
            params = [callerId, callerId];
            const [rows] = await pool.query(query, params);
            return rows;
        } else {
            // Staff cannot view users
            return [];
        }
    } catch (error) {
        console.error('[get-users] Error:', error);
        throw error;
    }
});

// Get User's Assigned Accounts
ipcMain.handle('get-user-assigned-accounts', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    console.log('[get-user-assigned-accounts] Called with userId:', userId, 'by caller:', callerId);
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        // AUTHORIZATION
        if (caller.role !== 'super_admin') {
            if (caller.role === 'admin') {
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied');
                }
            } else if (userId !== callerId) {
                throw new Error('Access denied');
            }
        }

        // Get accounts with full data
        const [accounts] = await pool.query(`
            SELECT 
                a.id,
                a.name AS profile_name,
                a.loginUrl,
                p.name AS platform_name
            FROM accounts a
            JOIN account_assignments aa ON a.id = aa.account_id
            LEFT JOIN platforms p ON a.platform_id = p.id
            WHERE aa.user_id = ?
            ORDER BY a.name
        `, [userId]);
        console.log('[get-user-assigned-accounts] Found', accounts.length, 'accounts for user', userId);
        return accounts;
    } catch (error) {
        console.error('[get-user-assigned-accounts] Error:', error);
        throw error;
    }
});

ipcMain.handle('save-user', async (event, userData) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('Caller not found');
        const caller = callers[0];

        // Authorization
        if (caller.role === 'staff') {
            throw new Error('Access denied: Staff users cannot manage other users');
        }

        // CREATE NEW USER
        if (!userData.id) {
            // Admin can only create Staff
            if (caller.role === 'admin' && userData.role !== 'staff') {
                throw new Error('Admin can only create Staff users');
            }

            // Super Admin can create anyone
            if (!userData.username || !userData.password) {
                throw new Error('Username and password required for new user');
            }

            const newId = require('uuid').v4();

            // Auto-assign managed_by for Admin creating Staff
            let managed_by_admin_id = userData.managed_by_admin_id || null;
            if (caller.role === 'admin' && userData.role === 'staff') {
                managed_by_admin_id = callerId; // Auto-assign to creator
            }

            await pool.query(
                'INSERT INTO users (id, username, password, role, managed_by_admin_id) VALUES (?, ?, ?, ?, ?)',
                [newId, userData.username, userData.password, userData.role, managed_by_admin_id]
            );

            await auditLog('create_user', callerId, {
                targetUserId: newId,
                role: userData.role,
                managed_by: managed_by_admin_id
            });

            return { success: true };
        }
        // UPDATE EXISTING USER
        else {
            // Check scope
            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [userData.id]);
            if (targets.length === 0) throw new Error('User not found');
            const target = targets[0];

            // Admin can only edit their managed staff
            if (caller.role === 'admin') {
                if (target.role !== 'staff' || target.managed_by_admin_id !== callerId) {
                    throw new Error('Admin can only edit their own managed Staff');
                }
            }

            // Enforce: Only Super Admin can change role
            if ('role' in userData && caller.role !== 'super_admin') {
                throw new Error('Only Super Admin can change user roles');
            }

            // Build dynamic UPDATE query
            let fieldsToUpdate = [];
            let values = [];

            if (userData.username) {
                fieldsToUpdate.push('username = ?');
                values.push(userData.username);
            }

            // Only update password if provided (not undefined/null)
            if (userData.password) {
                fieldsToUpdate.push('password = ?');
                values.push(userData.password);
            }

            if (userData.role) {
                fieldsToUpdate.push('role = ?');
                values.push(userData.role);
            }

            // managed_by_admin_id (Super Admin only)
            if (caller.role === 'super_admin' && 'managed_by_admin_id' in userData) {
                fieldsToUpdate.push('managed_by_admin_id = ?');
                values.push(userData.managed_by_admin_id || null);
            }

            if (fieldsToUpdate.length === 0) {
                return { success: true }; // Nothing to update
            }

            values.push(userData.id); // WHERE id = ?

            await pool.query(
                `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
                values
            );

            await auditLog('edit_user', callerId, {
                targetUserId: userData.id,
                fields_updated: Object.keys(userData)
            });

            return { success: true };
        }
    } catch (error) {
        console.error('[save-user] Error:', error);
        return { success: false, error: error.message };
    }
});

// ==================== RBAC v2: New Handlers ====================


// ==================== RBAC v2: New Handlers ====================

// Transfer User Ownership (Super Admin only) - Alias to match frontend call
ipcMain.handle('transfer-user-ownership', async (event, payload) => {
    // Frontend sends {userId, newAdminId}, backend expects same format
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0 || callers[0].role !== 'super_admin') {
            throw new Error('Only Super Admin can transfer ownership');
        }

        const { userId, newAdminId } = payload;

        const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (targets.length === 0) throw new Error('Target user not found');
        if (targets[0].role !== 'staff') {
            throw new Error('Only Staff users can be transferred');
        }

        if (newAdminId) {
            const [admins] = await pool.query('SELECT * FROM users WHERE id = ?', [newAdminId]);
            if (admins.length === 0 || admins[0].role !== 'admin') {
                throw new Error('Target must be an Admin');
            }
        }

        await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', [newAdminId || null, userId]);

        await auditLog('transfer_ownership', callerId, {
            targetUserId: userId,
            from_admin: targets[0].managed_by_admin_id,
            to_admin: newAdminId || 'unassigned'
        });

        return { success: true };
    } catch (error) {
        console.error('[transfer-user-ownership] Error:', error);
        return { success: false, error: error.message };
    }
});

// Transfer User Ownership (Super Admin only) - Original handler
ipcMain.handle('transfer-user-to-admin', async (event, { userId, newAdminId }) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0 || callers[0].role !== 'super_admin') {
            throw new Error('Only Super Admin can transfer ownership');
        }

        const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (targets.length === 0) throw new Error('Target user not found');
        if (targets[0].role !== 'staff') {
            throw new Error('Only Staff users can be transferred');
        }

        if (newAdminId) {
            const [admins] = await pool.query('SELECT * FROM users WHERE id = ?', [newAdminId]);
            if (admins.length === 0 || admins[0].role !== 'admin') {
                throw new Error('Target must be an Admin');
            }
        }

        await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', [newAdminId || null, userId]);

        // Audit log: differentiate transfer vs unassign
        if (newAdminId) {
            await auditLog('transfer_ownership', callerId, {
                targetUserId: userId,
                from_admin: targets[0].managed_by_admin_id,
                to_admin: newAdminId
            });
        } else {
            await auditLog('unassign_staff', callerId, {
                targetUserId: userId,
                from_admin: targets[0].managed_by_admin_id
            });
        }

        return { success: true };
    } catch (error) {
        console.error('[transfer-user] Error:', error);
        return { success: false, error: error.message };
    }
});

// Get Available Accounts for Assignment (Super Admin/Admin only)
ipcMain.handle('get-available-accounts', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        // AUTHORIZATION: Only Super Admin + Admin
        if (caller.role === 'admin') {
            // Admin can only assign to managed staff
            const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                throw new Error('Access denied: Cannot manage this user');
            }
        } else if (caller.role !== 'super_admin') {
            throw new Error('Access denied: Insufficient permissions');
        }

        // Get accounts NOT yet assigned to this user
        let query, params;
        if (caller.role === 'super_admin') {
            // Super Admin: ALL unassigned accounts
            query = `
                SELECT a.*, p.name as platform_name
                FROM accounts a
                LEFT JOIN platforms p ON a.platform_id = p.id
                WHERE a.id NOT IN (
                    SELECT account_id FROM account_assignments WHERE user_id = ?
                )
                ORDER BY p.name, a.id
            `;
            params = [userId];
        } else {
            // Admin: Only accounts from managed staff pool (accounts assigned to managed users or self)
            query = `
                SELECT DISTINCT a.*, p.name as platform_name
                FROM accounts a
                LEFT JOIN platforms p ON a.platform_id = p.id
                LEFT JOIN account_assignments aa ON a.id = aa.account_id
                WHERE aa.user_id IN (
                    SELECT id FROM users WHERE managed_by_admin_id = ? OR id = ?
                )
                AND a.id NOT IN (
                    SELECT account_id FROM account_assignments WHERE user_id = ?
                )
                ORDER BY p.name, a.id
            `;
            params = [callerId, callerId, userId];
        }

        const [accounts] = await pool.query(query, params);

        // Parse and return with profile names
        return accounts.map(acc => ({
            id: acc.id,
            platform_name: acc.platform_name,
            profile_name: (() => {
                try {
                    const auth = typeof acc.auth_config === 'string' ? JSON.parse(acc.auth_config) : acc.auth_config;
                    return auth?.email || auth?.username || `Account #${acc.id.substring(0, 8)}`;
                } catch {
                    return `Account #${acc.id.substring(0, 8)}`;
                }
            })()
        }));
    } catch (error) {
        console.error('[get-available-accounts] Error:', error);
        throw error;
    }
});

// Assign Accounts to User (Bulk Assignment)
ipcMain.handle('assign-accounts', async (event, { userId, accountIds }) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        // AUTHORIZATION: Only Super Admin + Admin
        if (caller.role === 'admin') {
            const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                throw new Error('Access denied: Cannot manage this user');
            }
        } else if (caller.role !== 'super_admin') {
            throw new Error('Access denied: Insufficient permissions');
        }

        // Bulk insert assignments (IGNORE duplicates)
        const values = accountIds.map(accountId => [accountId, userId]);
        await pool.query(
            'INSERT IGNORE INTO account_assignments (account_id, user_id) VALUES ?',
            [values]
        );

        // Audit log
        await auditLog('assign_accounts', callerId, { userId, accountIds, count: accountIds.length });

        return { success: true };
    } catch (error) {
        console.error('[assign-accounts] Error:', error);
        return { success: false, error: error.message };
    }
});

// Get User Permissions
ipcMain.handle('get-user-permissions', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const authorized = await authorize(callerId, 'users.view', userId);
        if (!authorized) throw new Error('Access denied: Cannot view this user');

        const pool = await getPool();
        const [rows] = await pool.query(
            'SELECT permission_key, enabled FROM user_permissions WHERE user_id = ?',
            [userId]
        );
        return rows;
    } catch (error) {
        console.error('[get-user-permissions] Error:', error);
        return [];
    }
});

// Update User Permissions (with transaction)
ipcMain.handle('update-user-permissions', async (event, userId, permissions) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const authorized = await authorize(callerId, 'users.edit', userId);
        if (!authorized) throw new Error('Access denied: Cannot edit this user');

        const pool = await getPool();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // DELETE all overrides
            await connection.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

            // INSERT new ones
            for (const perm of permissions) {
                await connection.execute(
                    'INSERT INTO user_permissions (id, user_id, permission_key, enabled) VALUES (?, ?, ?, ?)',
                    [uuidv4(), userId, perm.permission_key, perm.enabled]
                );
            }

            await connection.commit();

            await auditLog('update_permissions', callerId, {
                targetUserId: userId,
                permissions_changed: permissions.map(p => p.permission_key)
            });

            return { success: true };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('[update-user-permissions] Error:', error);
        return { success: false, error: error.message };
    }
});

// Clear User Permissions (Reset to role defaults)
ipcMain.handle('clear-user-permissions', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const authorized = await authorize(callerId, 'users.edit', userId);
        if (!authorized) throw new Error('Access denied');

        const pool = await getPool();
        await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);

        await auditLog('clear_permissions', callerId, { targetUserId: userId });

        return { success: true };
    } catch (error) {
        console.error('[clear-user-permissions] Error:', error);
        return { success: false, error: error.message };
    }
});

// Check Permission (UI only - does NOT check scope)
ipcMain.handle('check-permission', async (event, permissionKey) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        return await checkPermission(callerId, permissionKey);
    } catch (error) {
        console.error('[check-permission] Error:', error);
        return false;
    }
});

// Helper for debug: Check if window is focused
ipcMain.handle('is-window-focused', async (event) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    return mainWindow?.isFocused() || false;
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

ipcMain.handle('get-available-nodes', async () => {
    return automationManager.getRegistryJson();
});

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
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (!callers.length) throw new Error('User not found');
        const role = callers[0].role;

        let query = 'SELECT id, name, platform, created_at, created_by FROM workflows';
        let params = [];

        if (role === 'super_admin') {
            // Super Admin sees all
            query += ' ORDER BY created_at DESC';
        } else {
            // Admin sees only their own creation. 
            // Staff also limited to own creation (if they could create).
            // NOTE: Future "Assignment" logic will expand this.
            query += ' WHERE created_by = ? ORDER BY created_at DESC';
            params = [callerId];
        }

        const [rows] = await pool.query(query, params);
        return rows;
    } catch (e) {
        console.error('[get-workflows] Error:', e);
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

        // Navigate to initial URL
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('[Element Picker] Waiting for selection via BrowserManager...');

        // Use the CENTRALIZED Picker Logic (with Confirmation UI)
        try {
            const selector = await BrowserManager.startElementPicker(page);
            await browser.close();
            return { success: true, selector };
        } catch (err) {
            await browser.close();
            return { success: false, error: err.message };
        }
    } catch (e) {
        return { success: false, error: e.message };
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

        const [accRows] = await pool.query('SELECT auth_config FROM accounts WHERE id = ?', [profileId]);
        const accountData = accRows[0] || {};

        let auth = accountData.auth_config || {};
        if (typeof auth === 'string') {
            try { auth = JSON.parse(auth); } catch (e) { console.warn('Failed to parse auth_config:', e); auth = {}; }
        }

        console.log('[Main] Loaded Profile Auth:', {
            hasUser: !!auth.username,
            hasPass: !!auth.password,
            usernameVal: auth.username // Log actual value for debugging (remove in prod)
        });

        // 3. Execute with Profile Context
        await automationManager.runWorkflow(
            { drawflow: { Home: { data: workflowData } } },
            page,
            {}, // userProfile (default)
            { // profileContext
                username: auth.username || '',
                password: auth.password || '',
                twofa: auth.twofaSecret || auth.twofa_secret || ''
            }
        );
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

