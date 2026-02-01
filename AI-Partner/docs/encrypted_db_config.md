# Encrypted Database Configuration

## Overview
Mã hóa database credentials để bảo vệ thông tin nhạy cảm trong source code.

## Implementation

### 1. Encryption Method
- **Algorithm**: AES-256-CBC
- **Key**: Obfuscated trong code (multiple string concatenation + base64)
- **Config**: JSON → encrypt → Base64 string embedded trong code

### 2. Files Changed
- `src/database/mysql.js` - Decrypt config at runtime
- `src/utils/ConfigCrypto.js` - NEW: Encryption/decryption utilities

### 3. Encryption Process (One-time)
```javascript
const CryptoJS = require('crypto-js');
const config = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'YOUR_NEW_PASSWORD', // Change this!
    database: 'defaultdb'
};
const encrypted = CryptoJS.AES.encrypt(JSON.stringify(config), SECRET_KEY).toString();
console.log(encrypted); // Paste this into mysql.js
```

### 4. Decryption at Runtime
```javascript
const ENCRYPTED_CONFIG = "U2FsdGVkX1+..."; // Encrypted string
const key = getObfuscatedKey(); // Key assembled from obfuscated parts
const decrypted = CryptoJS.AES.decrypt(ENCRYPTED_CONFIG, key);
const dbConfig = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
```

### 5. Key Obfuscation
```javascript
function getObfuscatedKey() {
    const p1 = atob('TG9n'); // Log
    const p2 = String.fromCharCode(105, 110); // in
    const p3 = ['T','a','b'].join(''); // Tab
    const p4 = (0x32).toString() + '0' + (0x32).toString() + String(6); // 2026
    return p1 + p2 + p3 + p4;
}
// Returns: "LoginTab2026"
```

## Security Notes
- Key vẫn trong code nhưng obfuscated, khó đọc trực tiếp
- Đã đủ để prevent casual exposure
- Nếu cần higher security, implement key from environment variable

## Migration Steps
1. ⚠️ **CHANGE MySQL password on DigitalOcean first**
2. Run encryption script với new password
3. Update `mysql.js` với encrypted config
4. Test connection
5. Commit & push

## Usage After Implementation
Không cần thay đổi gì - app tự decrypt config khi khởi động.
