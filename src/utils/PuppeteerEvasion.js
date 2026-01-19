/**
 * Advanced Puppeteer Evasion Scripts
 * Makes Puppeteer indistinguishable from real Chrome
 * Based on research from puppeteer-extra-plugin-stealth and real Chrome behavior
 */

class PuppeteerEvasion {
    /**
     * Get all evasion scripts to inject for a specific fingerprint
     * @param {Object} fingerprint - The fingerprint object to match
     */
    static getAllEvasionScripts(fingerprint) {
        if (!fingerprint) {
            console.warn('[Evasion] No fingerprint provided, using defaults');
            fingerprint = {};
        }

        return [
            // TEST CASE 4: MANUAL EVASION ONLY (No Stealth Plugin)
            this.fixChromeRuntime(fingerprint), // ENABLED: Replaces Stealth
            this.fixPermissions(fingerprint),   // ENABLED: Replaces Stealth
            this.fixPlugins(fingerprint),       // ENABLED: Replaces Stealth (Fixed Name Bug)
            this.fixWebGL(fingerprint),
            this.fixNavigator(fingerprint),
            this.fixUserAgentData(fingerprint),
            this.fixFonts(fingerprint),
            this.fixWindow(fingerprint),
            this.fixIframe(fingerprint),
            this.fixMediaDevices(fingerprint),
            this.fixBattery(fingerprint),
            this.fixConnection(fingerprint),
            this.fixWebRTC(fingerprint),
            // this.fixCanvas(fingerprint),    // DISABLED: Noise
            // this.fixAudio(fingerprint),     // DISABLED: Noise
            this.removeCDC()
        ].join('\n\n');
    }

    /**
     * 1. Fix Chrome Runtime (Critical!)
     */
    static fixChromeRuntime(fp) {
        return `
// Chrome Runtime Fix
if (!window.chrome) {
    window.chrome = {};
}
if (!window.chrome.runtime) {
    window.chrome.runtime = {
        connect: function() {
            return {
                onMessage: { addListener: function() {}, removeListener: function() {} },
                postMessage: function() {},
                disconnect: function() {}
            };
        },
        sendMessage: function() {},
        onMessage: { addListener: function() {}, removeListener: function() {} }
    };
}
window.chrome.loadTimes = function() {
    return {
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        commitLoadTime: Date.now() / 1000,
        finishDocumentLoadTime: Date.now() / 1000,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2'
    };
};
window.chrome.csi = function() {
    return {
        startE: Date.now(),
        onloadT: Date.now(),
        pageT: Math.random() * 1000,
        tran: 15
    };
};
window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
};
        `;
    }

    /**
     * 2. Fix Permissions API
     */
    static fixPermissions(fp) {
        return `
// Permissions API Fix
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = function(parameters) {
    if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery.call(this, parameters);
};
        `;
    }

    /**
     * 3. Fix Plugins (Dynamic from Fingerprint)
     */
    static fixPlugins(fp) {
        const inputPlugins = fp.plugins || [
            'PDF Viewer',
            'Chrome PDF Viewer',
            'WebKit built-in PDF'
        ];

        // Mime types mapping
        const mimeMap = {
            'PDF Viewer': { type: 'application/pdf', suffixes: 'pdf' },
            'Chrome PDF Viewer': { type: 'application/pdf', suffixes: 'pdf' },
            'WebKit built-in PDF': { type: 'application/pdf', suffixes: 'pdf' },
            'Chrome PDF Plugin': { type: 'application/pdf', suffixes: 'pdf' }
        };

        const pluginsData = inputPlugins.map(p => {
            const name = typeof p === 'string' ? p : p.name;
            const filename = typeof p === 'string' ? 'internal-pdf-viewer' : (p.filename || 'internal-pdf-viewer');

            return {
                name: name,
                filename: filename,
                description: 'Portable Document Format',
                mimeTypes: [mimeMap[name] || { type: 'application/pdf', suffixes: 'pdf' }]
            };
        });

        return `
// Plugins Fix
Object.defineProperty(navigator, 'plugins', {
    get: () => {
        const plugins = ${JSON.stringify(pluginsData)};
        
        // Make it array-like
        const pluginArray = Object.create(PluginArray.prototype);
        plugins.forEach((p, i) => {
            const plugin = Object.create(Plugin.prototype);
            Object.defineProperties(plugin, {
                name: { value: p.name },
                filename: { value: p.filename },
                description: { value: p.description },
                length: { value: 1 },
                item: { value: () => mime }
            });
            // Mime linkage
            const mime = Object.create(MimeType.prototype);
            Object.defineProperties(mime, {
                type: { value: p.mimeTypes[0].type },
                suffixes: { value: p.mimeTypes[0].suffixes },
                description: { value: p.description },
                enabledPlugin: { value: plugin }
            });
            plugin[0] = mime;
            plugin['application/pdf'] = mime;
            
            pluginArray[i] = plugin;
            pluginArray[p.name] = plugin;
        });
        Object.defineProperty(pluginArray, 'length', { value: plugins.length });
        return pluginArray;
    }
});

Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
        const mimeTypeArray = Object.create(MimeTypeArray.prototype);
        const mime = Object.create(MimeType.prototype);
        Object.defineProperties(mime, {
            type: { value: 'application/pdf' },
            suffixes: { value: 'pdf' },
            description: { value: 'Portable Document Format' },
            enabledPlugin: { value: navigator.plugins[0] }
        });
        
        mimeTypeArray[0] = mime;
        mimeTypeArray['application/pdf'] = mime;
        Object.defineProperty(mimeTypeArray, 'length', { value: 1 });
        return mimeTypeArray;
    }
});
        `;
    }

    /**
     * 3.5 Fix Fonts (Masking)
     */
    static fixFonts(fp) {
        // Font Masking Disabled
        // Real Chrome on Windows has access to local fonts. blocking them returns [] which is suspicious.
        // We let the natural system fonts show through for maximum authenticity.
        return `
            // Font masking disabled to allow natural system fonts
            if (window.queryLocalFonts) {
                // ====================================================================
    // WebGL Spoofing (DISABLED FOR NATIVE HARDWARE STRATEGY)
    // IPHey detects inconsistencies when we mock WebGL but real GPU timing leaks through
    // SOLUTION: Use 100% REAL hardware - no mocking
    // ====================================================================
    static fixWebGL(fp) {
        // NATIVE STRATEGY: Return empty string to skip ALL WebGL mocking
        // Real GPU (RTX 3060, etc.) will pass through naturally
        return '';
        
        /* DISABLED - causes "masking detected" on IPHey
        if (!fp.webglVendor || !fp.webglRenderer) return ''; // Real Mode

        const vendor = fp.webglVendor;
        const renderer = fp.webglRenderer;

        return `
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            if (parameter === 37445) return '${vendor}';
            if (parameter === 37446) return '${renderer}';
            return getParameter.call(this, parameter);
        };

        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (parameter) {
            if (parameter === 37445) return '${vendor}';
            if (parameter === 37446) return '${renderer}';
            return getParameter2.call(this, parameter);
        };
        `;
        */
    }
            }
        `;
    }

    /**
     * 5. Fix Navigator Properties
     */
    static fixNavigator(fp) {
        const platform = fp.platform || 'Win32';
        const oscpu = fp.oscpu; // May be undefined for Mac
        const hardwareConcurrency = fp.hardwareConcurrency || 4;
        const deviceMemory = fp.deviceMemory || 8;

        return `
// Navigator Properties Fix
Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); // RESTORED: Manual Mode
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'platform', { get: () => '${platform}' });
// Only set oscpu on Windows/Linux (Mac doesn't have it)
${oscpu ? `Object.defineProperty(navigator, 'oscpu', { get: () => '${oscpu}' });` : ''}
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${hardwareConcurrency} });
Object.defineProperty(navigator, 'deviceMemory', { get: () => ${deviceMemory} });

// DEEP CLEAN: Delete webdriver from prototype chain
try {
    delete Object.getPrototypeOf(navigator).webdriver;
} catch(e) {}
        `;
    }

    /**
     * 5.5 Fix User Agent Data (Client Hints) - CRITICAL for Modern Chrome
     */
    static fixUserAgentData(fp) {
        const fullVersion = fp.chromeVersion || '131.0.0.0';
        const majorVersion = fullVersion.split('.')[0];
        const platformName = fp.platformName || 'Windows'; // Use platformName not platform
        const architecture = 'x86';
        const bitness = '64';
        const model = '';

        return `
// User Agent Data (UA-CH) Fix
if (navigator.userAgentData) {
    const brands = [
        { brand: "Chromium", version: "${majorVersion}" },
        { brand: "Google Chrome", version: "${majorVersion}" },
        { brand: "Not=A?Brand", version: "24" }
    ];

    Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
            brands: brands,
            mobile: false,
            platform: "${platformName}",
            getHighEntropyValues: function(hints) {
                const values = {
                    architecture: "${architecture}",
                    bitness: "${bitness}",
                    brands: brands,
                    fullVersionList: [
                        { brand: "Chromium", version: "${fullVersion}" },
                        { brand: "Google Chrome", version: "${fullVersion}" },
                        { brand: "Not=A?Brand", version: "24" }
                    ],
                    mobile: false,
                    model: "${model}",
                    platform: "${platformName}",
                    platformVersion: "15.0.0", // Windows 11-ish
                    uaFullVersion: "${fullVersion}"
                };
                
                // Return checked hints
                const result = {};
                if (Array.isArray(hints)) {
                    hints.forEach(h => {
                        if (values[h]) result[h] = values[h];
                    });
                }
                return Promise.resolve(result);
            },
            toJSON: function() { return { brands, mobile: false, platform: "${platformName}" }; }
        })
    });
}
        `;
    }

    /**
     * 7. Fix Permissions API (Gmail Check)
     */
    static fixPermissions() {
        return `
// Override Permissions API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
);
        `;
    }

    /**
     * 8. Mock Chrome Runtime (Extensions Check)
     */
    static fixChromeRuntime() {
        return `
// Mock chrome.runtime
if (!window.chrome) window.chrome = {};
if (!window.chrome.runtime) {
    window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {}, removeListener: () => {} },
        getManifest: () => ({ version: '1.0' }),
        id: 'ophjlpahpchlmihnnnihgmmeilfjmjjc' // Dummy ID
    };
}
        `;
    }

    /**
     * 9. Remove CDP Signatures (CDC)
     */
    static removeCDC() {
        return `
// Remove CDP signatures
const cdcProps = [
    'cdc_adoQpoasnfa76pfcZLmcfl_Array',
    'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'
];
cdcProps.forEach(prop => {
    try { delete window[prop]; } catch(e) {}
});

// Deep scan for other cdc_ properties
Object.keys(window).forEach(key => {
    if (/^cdc_/.test(key)) {
        try { delete window[key]; } catch(e) {}
    }
});
        `;
    }

    /**
     * 6. Fix Window Properties
     */
    static fixWindow(fp) {
        return `
// Window Properties Fix (Strict 2560x1440)
const width = 2560;
const height = 1440;

Object.defineProperty(window.screen, 'width', { get: () => width });
Object.defineProperty(window.screen, 'height', { get: () => height });
Object.defineProperty(window.screen, 'availWidth', { get: () => width });
Object.defineProperty(window.screen, 'availHeight', { get: () => height - 40 }); // Taskbar space

Object.defineProperty(window, 'innerWidth', { get: () => width });
Object.defineProperty(window, 'innerHeight', { get: () => height });
Object.defineProperty(window, 'outerWidth', { get: () => width });
Object.defineProperty(window, 'outerHeight', { get: () => height });
Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 }); // Standard DPI

// Fix iframe detection
Object.defineProperty(window, 'top', { get: () => window });
Object.defineProperty(window, 'self', { get: () => window });
        `;
    }

    /**
     * 11. Fix WebRTC (Prevent IP Leak - Critical for "Farming" tools)
     */
    static fixWebRTC(fp) {
        return `
// WebRTC Fix - Block Private IP Leaks
const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = function(args) {
    return originalGetUserMedia.apply(this, arguments);
};

// Mask RTCPeerConnection to prevent local IP discovery
const originalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(config) {
    const pc = new originalRTCPeerConnection(config);
    const originalCreateDataChannel = pc.createDataChannel;
    
    // Override createDataChannel to mimic standard behavior but safe
    pc.createDataChannel = function(label, options) {
        return originalCreateDataChannel.apply(this, arguments);
    };

    return pc;
};
window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
        `;
    }

    /**
     * 7. Fix Iframe Detection
     */
    static fixIframe(fp) {
        return `
// Iframe Detection Fix
Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get: function() {
        return window;
    }
});
        `;
    }

    /**
     * 8. Fix Media Devices
     */
    static fixMediaDevices(fp) {
        return `
// Media Devices Fix
if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
    navigator.mediaDevices.enumerateDevices = function() {
        return originalEnumerateDevices.call(this).then(devices => {
            // Add fake devices if empty
            if (devices.length === 0) {
                return [
                    { deviceId: 'default', kind: 'audioinput', label: 'Default Audio Input', groupId: 'default' },
                    { deviceId: 'default', kind: 'audiooutput', label: 'Default Audio Output', groupId: 'default' },
                    { deviceId: 'default', kind: 'videoinput', label: 'Default Video Input', groupId: 'default' }
                ];
            }
            return devices;
        });
    };
}
        `;
    }

    /**
     * 9. Fix Battery API
     */
    static fixBattery(fp) {
        return `
// Battery API Fix
if (navigator.getBattery) {
    const originalGetBattery = navigator.getBattery;
    navigator.getBattery = function() {
        return Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return true; }
        });
    };
}
        `;
    }

    /**
     * 10. Fix Connection API
     */
    static fixConnection(fp) {
        return `
// Connection API Fix
if (navigator.connection) {
    Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
    Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
    Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
    Object.defineProperty(navigator.connection, 'saveData', { get: () => false });
}
        `;
    }

    /**
     * 11. Fix WebRTC
     */
    static fixWebRTC(fp) {
        return `
// WebRTC Fix
const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = function() {
    return originalGetUserMedia.apply(this, arguments).catch(() => {
        throw new DOMException('Permission denied', 'NotAllowedError');
    });
};
        `;
    }

    /**
     * 12. Fix Canvas Fingerprinting - UNIQUE & CONSISTENT
     */
    static fixCanvas(fp) {
        // Use persistent canvas noise from fingerprint, or default to 1 (add)
        // shift: -5 to 5, channel: 0=R, 1=G, 2=B, 3=A
        const noise = fp.canvasNoise || { shift: 1, channel: 0 };
        const shift = noise.shift;
        const channel = noise.channel;

        return `
// Canvas Fingerprinting Fix (Consistent unique noise)
const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(type) {
    const context = this.getContext('2d');
    if (context) {
        // Only apply noise once per canvas to avoid accumulation
        if (!this._noiseApplied) {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            const data = imageData.data;
            const len = data.length;
            const s = ${shift};
            const c = ${channel};
            
            // Apply consistent noise to specific channel
            for (let i = c; i < len; i += 4) {
                // Safe bit manipulation to avoid clamping at 0/255 if possible, or just wrap
                data[i] = (data[i] + s) % 256; 
            }
            context.putImageData(imageData, 0, 0);
            this._noiseApplied = true;
        }
    }
    return originalToDataURL.apply(this, arguments);
};
        `;
    }

    /**
     * 13. Fix Audio Context - UNIQUE & CONSISTENT
     */
    static fixAudio(fp) {
        // Use persistent audio noise from fingerprint
        // value: small float like 0.0000123
        const noiseVal = fp.audioNoise || 0.00001;

        return `
// Audio Context Fix (Consistent unique noise)
const AudioContext = window.AudioContext || window.webkitAudioContext;
if (AudioContext) {
    const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function() {
        const analyser = originalCreateAnalyser.call(this);
        const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
        analyser.getFloatFrequencyData = function(array) {
            originalGetFloatFrequencyData.call(this, array);
            // Add CONSISTENT noise (not random)
            const noise = ${noiseVal};
            for (let i = 0; i < array.length; i++) {
                // Simple deterministic modulation based on index + noise
                // This preserves shape but shifts values uniquely per account
                array[i] = array[i] + noise;
            }
        };
        return analyser;
    };
}
        `;
    }


    /**
     * 14. Fix Permissions API (Gmail Check)
     */
    static fixPermissions() {
        return `
// Override Permissions API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
);
        `;
    }

    /**
     * 15. Mock Chrome Runtime (Extensions Check)
     */
    static fixChromeRuntime() {
        return `
// Mock chrome.runtime
if (!window.chrome) window.chrome = {};
if (!window.chrome.runtime) {
    window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {}, removeListener: () => {} },
        getManifest: () => ({ version: '1.0' }),
        id: 'ophjlpahpchlmihnnnihgmmeilfjmjjc'
    };
}
        `;
    }

    /**
     * 16. Remove CDP Signatures (CDC)
     */
    static removeCDC() {
        return `
// Remove CDP signatures
const cdcProps = [
    'cdc_adoQpoasnfa76pfcZLmcfl_Array',
    'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'
];
cdcProps.forEach(prop => {
    try { delete window[prop]; } catch(e) {}
});

// Deep scan for other cdc_ properties
Object.keys(window).forEach(key => {
    if (/^cdc_/.test(key)) {
        try { delete window[key]; } catch(e) {}
    }
});
        `;
    }


}

module.exports = PuppeteerEvasion;
