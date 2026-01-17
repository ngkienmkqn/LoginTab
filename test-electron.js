console.log('Testing Electron require...');
const electron = require('electron');
console.log('Electron loaded:', typeof electron);
console.log('app:', typeof electron.app);
console.log('BrowserWindow:', typeof electron.BrowserWindow);

if (electron.app) {
    console.log('SUCCESS: Electron app object is available');
    electron.app.whenReady().then(() => {
        console.log('App is ready!');
        electron.app.quit();
    });
} else {
    console.error('ERROR: Electron app object is undefined!');
}
