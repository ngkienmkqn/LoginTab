const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron:', electron);

const { app, BrowserWindow } = require('electron');
console.log('app type:', typeof app);
console.log('BrowserWindow type:', typeof BrowserWindow);

if (app) {
    app.whenReady().then(() => {
        console.log('Electron app is ready!');
        const win = new BrowserWindow({ width: 800, height: 600 });
        win.loadURL('https://www.google.com');
    });

    app.on('window-all-closed', () => {
        app.quit();
    });
} else {
    console.error('app is undefined!');
}
