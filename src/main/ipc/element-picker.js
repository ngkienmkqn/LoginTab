/**
 * Element Picker IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain, BrowserWindow } = require('electron');

/**
 * Register element picker IPC handlers
 */
function registerElementPickerHandlers() {
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
}

module.exports = { registerElementPickerHandlers };
