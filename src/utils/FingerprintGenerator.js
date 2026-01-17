const crypto = require('crypto');

/**
 * Comprehensive Browser Fingerprint Generator
 * Generates consistent, realistic fingerprints that persist across sessions
 */
class FingerprintGenerator {
    /**
     * Generate a complete browser fingerprint
     * @param {string} accountId - Account ID for seeding randomness
     * @param {string} os - Operating system: 'win', 'mac', or 'linux'
     * @returns {Object} Complete fingerprint object
     */
    static generateFingerprint(accountId, os = 'win') {
        // Use account ID as seed for consistent generation
        const seed = this.hashSeed(accountId);
        const random = this.seededRandom(seed);

        // Get OS-specific configuration
        const osConfig = this.getOSConfig(os);

        // HIGH TRUST: Use only very recent Stable Chrome versions
        const chromeVersion = this.pickRandom(random, ['132.0.0.0', '131.0.0.0', '130.0.0.0']);

        const fingerprint = {
            // Screen: STRICTLY LOCKED via helper (2560x1440)
            resolution: this.generateResolution(random),
            colorDepth: 24,
            pixelRatio: this.pickRandom(random, [1, 1, 1.25]), // Mostly standard DPI

            // Navigator Properties (OS-Specific)
            userAgent: osConfig.userAgent.replace('${chromeVersion}', chromeVersion),
            platform: osConfig.platform,
            platformName: osConfig.platformName, // For userAgentData
            oscpu: osConfig.oscpu, // May be undefined for Mac
            language: 'en-US',
            languages: ['en-US', 'en'],
            doNotTrack: null,

            // Hardware: High-performance profile (Gamers/Devs)
            hardwareConcurrency: this.pickRandom(random, [8, 12, 16, 24]), // Avoid 4 cores (too weak/VM-like)
            deviceMemory: this.pickRandom(random, [8, 16, 32]), // High RAM

            // Explicitly store Chrome Version for checks
            chromeVersion: chromeVersion,

            // WebGL Fingerprint (OS-Synchronized & High Trust)
            webglVendor: osConfig.webglVendor,
            webglRenderer: osConfig.webglRenderer,
            webglVersion: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',

            // Canvas & Audio Noise
            canvasNoise: this.generateCanvasNoise(seed),
            audioNoise: random() * 0.00001, // Extremely subtle noise

            // Fonts (OS-Specific)
            fonts: osConfig.fonts,

            // Plugins (OS-Specific)
            plugins: osConfig.plugins,

            // Timezone (Vietnam)
            timezone: 'Asia/Ho_Chi_Minh',
            timezoneOffset: -420, // UTC+7

            // Battery (realistic)
            battery: {
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 0.90 + random() * 0.10
            },

            // Connection (realistic 4G)
            connection: {
                effectiveType: '4g',
                downlink: 10,
                rtt: 50,
                saveData: false
            },

            // Media Devices (realistic)
            mediaDevices: this.generateMediaDevices(random),

            // Plugins (realistic Windows plugins)
            plugins: this.generatePlugins(random),

            // Touch Support (desktop = no touch)
            maxTouchPoints: 0,
            touchSupport: false,

            // Permissions
            permissions: {
                notifications: 'default',
                geolocation: 'prompt',
                camera: 'prompt',
                microphone: 'prompt'
            },

            // Generation metadata
            generated: new Date().toISOString(),
            version: '1.0',
            chromeVersion: chromeVersion
        };

        return fingerprint;
    }

    /**
     * Get OS-specific configuration
     * @param {string} os - 'win', 'mac', or 'linux'
     * @returns {Object} OS-specific fingerprint configuration
     */
    static getOSConfig(os) {
        const configs = {
            win: {
                platform: 'Win32',
                platformName: 'Windows',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36',
                oscpu: 'Windows NT 10.0; Win64; x64',
                webglVendor: 'Google Inc. (NVIDIA)',
                webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                fonts: [
                    'Arial', 'Calibri', 'Cambria', 'Consolas', 'Segoe UI', 'Tahoma',
                    'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
                    'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Lucida Console'
                ],
                plugins: [
                    { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-plugin' }
                ]
            },
            mac: {
                platform: 'MacIntel',
                platformName: 'macOS',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36',
                oscpu: undefined, // Mac doesn't expose oscpu
                webglVendor: 'Apple Inc.',
                webglRenderer: 'Apple M1',
                fonts: [
                    'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Helvetica',
                    'Arial', 'San Francisco', 'Monaco', 'Menlo', 'Courier New',
                    'Times New Roman', 'Georgia', 'Verdana'
                ],
                plugins: [
                    { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' }
                ]
            },
            linux: {
                platform: 'Linux x86_64',
                platformName: 'Linux',
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36',
                oscpu: 'Linux x86_64',
                webglVendor: 'Intel Inc.',
                webglRenderer: 'Mesa DRI Intel(R) UHD Graphics 630 (CML GT2)',
                fonts: [
                    'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Arial', 'Helvetica',
                    'DejaVu Serif', 'Liberation Mono', 'Courier New', 'Times New Roman'
                ],
                plugins: [
                    { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' }
                ]
            }
        };

        return configs[os] || configs.win; // Default to Windows
    }

    /**
     * Hash account ID to create consistent seed
     */
    static hashSeed(accountId) {
        return crypto.createHash('sha256').update(accountId).digest('hex');
    }

    /**
     * Create seeded random number generator
     */
    static seededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash = hash & hash;
        }

        return function () {
            hash = (hash * 9301 + 49297) % 233280;
            return hash / 233280;
        };
    }

    static pickRandom(random, array) {
        if (!array || array.length === 0) return null;
        const val = random();
        // Ensure val is within [0, 1) and valid
        const safeVal = (typeof val === 'number' && !isNaN(val)) ? Math.abs(val) % 1 : 0;
        const idx = Math.floor(safeVal * array.length);
        // Clamp index to valid range
        const safeIdx = Math.min(idx, array.length - 1);
        return array[safeIdx];
    }

    /**
     * Generate realistic screen resolution
     * STRICTLY 2560x1440 (Proven Success)
     */
    /**
     * Generate realistic screen resolution
     * STRICTLY 2560x1440 (Proven Success)
     */
    static generateResolution(random) {
        // LOCK to 2560x1440 as per user confirmation
        return '2560x1440';
    }

    /**
     * Generate realistic User Agent
     */
    static generateUserAgent(random) {
        const chromeVersions = ['132.0.0.0', '131.0.0.0', '130.0.0.0'];
        const version = this.pickRandom(random, chromeVersions);
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
    }

    /**
     * Generate Synchronized WebGL Vendor & Renderer
     * STRICTLY RTX 3060 (Proven Success)
     */
    static generateWebGL(random) {
        // LOCK to RTX 3060
        return {
            webglVendor: 'Google Inc. (NVIDIA)',
            webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'
        };
    }

    /**
     * Generate Canvas Noise parameters (Compatible with PuppeteerEvasion)
     * @param {string} seed 
     */
    static generateCanvasNoise(seed) {
        // Use seed to determine shift (-5 to 5) and channel (0-3)
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash += seed.charCodeAt(i);

        const shift = (hash % 11) - 5; // -5 to 5
        const channel = hash % 4; // 0=R, 1=G, 2=B, 3=A

        return { shift, channel };
    }

    /**
     * Generate plugin list (Clean Chrome only)
     */
    static generatePlugins(random) {
        const plugins = [
            'PDF Viewer',
            'Chrome PDF Viewer',
            'WebKit built-in PDF'
        ];
        // Always return these 3 for consistency with Chrome
        return plugins;
    }

    /**
     * Generate font list
     */
    static generateFontList(random) {
        const baseFonts = [
            'Arial', 'Verdana', 'Helvetica', 'Times New Roman',
            'Courier New', 'Georgia', 'Palatino', 'Garamond',
            'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Impact'
        ];

        const additionalFonts = [
            'Calibri', 'Cambria', 'Consolas', 'Segoe UI',
            'Tahoma', 'Lucida Console', 'MS Sans Serif'
        ];

        const fonts = [...baseFonts];
        additionalFonts.forEach(font => {
            if (random() > 0.3) fonts.push(font);
        });

        return fonts;
    }

    /**
     * Generate media devices
     */
    static generateMediaDevices(random) {
        const audioInputs = Math.floor(random() * 2) + 1;
        const audioOutputs = Math.floor(random() * 3) + 1;
        const videoInputs = Math.floor(random() * 2);

        return {
            audioInput: audioInputs,
            audioOutput: audioOutputs,
            videoInput: videoInputs
        };
    }

    /**
     * Update existing fingerprint (for minor variations)
     */
    static updateFingerprint(existingFingerprint) {
        return {
            ...existingFingerprint,
            battery: {
                ...existingFingerprint.battery,
                level: 0.90 + Math.random() * 0.10
            },
            generated: new Date().toISOString()
        };
    }
}

module.exports = FingerprintGenerator;
