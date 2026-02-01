/**
 * System Tray Module
 * Extracted from main.js for modularity
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { getMainWindow, setQuitting } = require('./window');

let tray = null;

/**
 * Create system tray icon and menu
 */
function createTray() {
    if (tray) return tray;

    try {
        const iconPath = path.join(__dirname, '../ui/assets/icon.png');
        let icon;

        if (fs.existsSync(iconPath)) {
            icon = nativeImage.createFromPath(iconPath);
        } else {
            // If No Icon: Use a colored block as fallback so it's VISIBLE on taskbar
            // On Windows, empty icons are invisible.
            icon = nativeImage.createFromPath(path.join(__dirname, '../../node_modules/electron/dist/resources/default_app.asar/icon.png'));
            if (icon.isEmpty()) {
                icon = nativeImage.createEmpty();
            }
            console.warn('[Tray] Icon missing at', iconPath, '. Using fallback.');
        }

        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Login Tab (Active)',
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Show Window',
                click: () => {
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            {
                label: 'Quit',
                click: () => {
                    setQuitting(true);
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Login Tab');
        tray.setContextMenu(contextMenu);

        tray.on('double-click', () => {
            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.show();
        });

        tray.on('click', () => {
            const mainWindow = getMainWindow();
            if (!mainWindow) return;

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });

        return tray;
    } catch (err) {
        console.error('[Tray] Failed to create tray:', err);
        return null;
    }
}

/**
 * Get tray instance
 */
function getTray() {
    return tray;
}

/**
 * Destroy tray
 */
function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

module.exports = {
    createTray,
    getTray,
    destroyTray
};
