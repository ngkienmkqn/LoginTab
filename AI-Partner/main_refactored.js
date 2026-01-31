/**
 * Main Process Entry Point (Refactored)
 * Uses modular IPC handlers from src/main/
 */

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// Database
const { initDB, getPool, getDatabaseStats, resetDatabase } = require('./src/database/mysql');

// Managers
const BrowserManager = require('./src/managers/BrowserManager');
const AutomationManager = require('./src/managers/AutomationManager');

// Modular IPC Handlers
const { registerAllHandlers, setAutomationManager } = require('./src/main/ipc');

// Constants
const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

// ==================== Global State ====================
global.currentAuthUser = null; // { id, username, role }
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Helper to get mainWindow for IPC events from other modules
function getMainWindow() {
    return mainWindow;
}

// Export for other modules
module.exports = { getMainWindow };

// ==================== Single Instance Lock ====================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('[Main] Another instance is already running. Quitting...');
    app.quit();
    process.exit(0);
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

// ==================== Window Management ====================
async function createWindow() {
    const { session } = require('electron');
    await session.defaultSession.clearCache();
    console.log('[Main] Cache cleared for fresh start');

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
        show: false
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('focus', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-focused');
        }
    });

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

// ==================== System Tray ====================
function createTray() {
    if (tray) return;

    try {
        const iconPath = path.join(__dirname, 'src/ui/assets/icon.png');
        let icon;

        if (fs.existsSync(iconPath)) {
            icon = nativeImage.createFromPath(iconPath);
        } else {
            icon = nativeImage.createFromPath(path.join(__dirname, 'node_modules/electron/dist/resources/default_app.asar/icon.png'));
            if (icon.isEmpty()) {
                icon = nativeImage.createEmpty();
            }
            console.warn('[Tray] Icon missing at', iconPath, '. Using fallback.');
        }

        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Login Tab (Active)', enabled: false },
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

        tray.setToolTip('Login Tab');
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

// ==================== System Initialization ====================
async function initializeSystem() {
    try {
        console.log('[Main] App Data Path:', app.getPath('userData'));

        // Initialize database
        await initDB();
        await fs.ensureDir(SESSIONS_DIR);

        // Initialize automation manager
        const automationManager = new AutomationManager(BrowserManager);

        // Register all modular IPC handlers
        registerAllHandlers({
            dbFunctions: { getDatabaseStats, resetDatabase, initDB },
            automationManager
        });

        // Create main window
        createWindow();

        console.log('[Main] System initialized successfully');
    } catch (error) {
        console.error('System initialization failed:', error);
        dialog.showErrorBox('System Initialization Failed',
            `The application failed to start correctly.\n\nError: ${error.message}\n\nPlease check your internet connection or database settings.`);
        app.quit();
    }
}

// ==================== App Lifecycle ====================
app.on('ready', initializeSystem);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
