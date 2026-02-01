/**
 * ConfigCrypto.js - Encrypted Configuration Utility
 * 
 * Provides AES-256 encryption/decryption for sensitive database credentials.
 * Key is obfuscated to prevent casual exposure in source code.
 */

const CryptoJS = require('crypto-js');

/**
 * Get obfuscated encryption key
 * Key is split and obfuscated to prevent direct reading
 */
function getObfuscatedKey() {
    // Key parts assembled from various methods
    const p1 = Buffer.from('TG9n', 'base64').toString(); // "Log"
    const p2 = String.fromCharCode(105, 110);            // "in"
    const p3 = ['T', 'a', 'b'].join('');                 // "Tab"
    const p4 = (0x53).toString(16).toUpperCase();        // "S" 
    const p5 = String.fromCharCode(51 + 50);             // "e"
    const p6 = 'cur' + String.fromCharCode(101);         // "cure"
    const p7 = (2 * 1013).toString();                    // "2026"

    return p1 + p2 + p3 + p4 + p5 + p6 + p7;
    // Returns: "LoginTabSecure2026"
}

/**
 * Encrypt configuration object
 * @param {Object} config - Configuration object to encrypt
 * @returns {string} - Base64 encoded encrypted string
 */
function encryptConfig(config) {
    const key = getObfuscatedKey();
    const jsonStr = JSON.stringify(config);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, key).toString();
    return encrypted;
}

/**
 * Decrypt configuration string
 * @param {string} encryptedStr - Base64 encoded encrypted string
 * @returns {Object} - Decrypted configuration object
 */
function decryptConfig(encryptedStr) {
    try {
        const key = getObfuscatedKey();
        const bytes = CryptoJS.AES.decrypt(encryptedStr, key);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);

        if (!decryptedStr) {
            throw new Error('Decryption failed - invalid key or corrupted data');
        }

        return JSON.parse(decryptedStr);
    } catch (error) {
        console.error('[ConfigCrypto] Decryption error:', error.message);
        throw new Error('Failed to decrypt database configuration');
    }
}

/**
 * CLI tool to encrypt new config
 * Run with: node ConfigCrypto.js --encrypt
 */
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--encrypt')) {
        // Example config - replace with actual values
        const config = {
            host: 'your-mysql-host.com',
            port: 25060,
            user: 'doadmin',
            password: 'YOUR_NEW_PASSWORD',
            database: 'defaultdb',
            ssl: true
        };

        console.log('=== Config Encryption Tool ===');
        console.log('Original config:', JSON.stringify(config, null, 2));
        console.log('\nEncrypted string:');
        console.log(encryptConfig(config));
        console.log('\nPaste the encrypted string into mysql.js ENCRYPTED_DB_CONFIG constant.');
    } else if (args.includes('--test')) {
        // Test with sample encrypted string
        console.log('Key:', getObfuscatedKey());
    } else {
        console.log('Usage:');
        console.log('  node ConfigCrypto.js --encrypt  # Encrypt config');
        console.log('  node ConfigCrypto.js --test     # Test key generation');
    }
}

module.exports = { encryptConfig, decryptConfig, getObfuscatedKey };
