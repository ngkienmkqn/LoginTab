const fs = require('fs');
const path = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
console.log(`Checking path: ${path}`);
try {
    const exists = fs.existsSync(path);
    console.log(`Exists: ${exists}`);
} catch (error) {
    console.error(`Error checking path: ${error.message}`);
}
