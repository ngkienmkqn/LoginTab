console.log('Starting Electron app...');
console.log('process.versions:', process.versions);

try {
    const electron = require('electron');
    console.log('Electron loaded, type:', typeof electron);

    if (typeof electron === 'object') {
        const { app, BrowserWindow } = electron;
        console.log('app:', typeof app);
        console.log('BrowserWindow:', typeof BrowserWindow);

        app.whenReady().then(() => {
            console.log('App is ready!');
            const win = new BrowserWindow({
                width: 800,
                height: 600,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });
            win.loadURL('https://www.google.com');
        });

        app.on('window-all-closed', () => {
            app.quit();
        });
    } else {
        console.error('Electron is not an object, it is:', electron);
    }
} catch (error) {
    console.error('Error loading electron:', error.message);
    console.error(error.stack);
}
