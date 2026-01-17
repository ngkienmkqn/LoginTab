console.log('Step 1: Loading electron...');
const { app, BrowserWindow, ipcMain } = require('electron');
console.log('Step 2: Electron loaded. app type:', typeof app);

if (!app) {
    console.error('FATAL: app is undefined after require!');
    process.exit(1);
}

console.log('Step 3: Loading other modules...');
const path = require('path');
const fs = require('fs-extra');
const { initDatabase, getDb } = require('./src/database/db');

console.log('Step 4: Loading BrowserManager...');
const BrowserManager = require('./src/managers/BrowserManager');

console.log('Step 5: Loading uuid...');
const { v4: uuidv4 } = require('uuid');

console.log('Step 6: All modules loaded successfully!');
console.log('App object:', app);

app.whenReady().then(() => {
    console.log('App is ready!');
    app.quit();
});
