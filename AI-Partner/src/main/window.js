/**
 * Window Management Module
 * Extracted from main.js for modularity
 */

const { BrowserWindow, Menu, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let isQuitting = false;

/**
 * Get the main window instance
 */
function getMainWindow() {
    return mainWindow;
}

/**
 * Set quitting flag
 */
function setQuitting(value) {
    isQuitting = value;
}

/**
 * Check if app is quitting
 */
function getQuitting() {
    return isQuitting;
}

/**
 * Create the main application window
 */
async function createWindow() {
    // Clear cache before creating window to prevent stale files
    const { session } = require('electron');
    await session.defaultSession.clearCache();
    console.log('[Main] Cache cleared for fresh start');

    // Global menu disable
    Menu.setApplicationMenu(null);

    const iconPath = path.join(__dirname, '../../ui/assets/icon.png');
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
        title: `Login Tab v${require('../../../package.json').version}`,
        icon: appIcon,
        autoHideMenuBar: true,
        backgroundColor: '#1e1e1e',
        show: false // Show only when ready
    });

    mainWindow.setMenu(null);

    mainWindow.loadFile(path.join(__dirname, '../../ui/index.html'));

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

    return mainWindow;
}

module.exports = {
    createWindow,
    getMainWindow,
    setQuitting,
    getQuitting
};
