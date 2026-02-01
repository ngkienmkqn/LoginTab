const path = require('path');
const fs = require('fs-extra');

let db;

async function initDatabase() {
    // Dynamic import because lowdb is ESM-only in v7+
    const { JSONFilePreset } = await import('lowdb/node');

    const dbPath = path.join(process.cwd(), 'db.json');
    // await fs.ensureDir(path.dirname(dbPath)); // Not strictly needed if at root, but harmless

    // Default data structure
    const defaultData = { accounts: [], proxies: [], extensions: [], platforms: [] };

    db = await JSONFilePreset(dbPath, defaultData);
    console.log('Using Database File:', dbPath);
    console.log('Database initialized (LowDB)');
    return db;
}

// Helper to get DB instance (must be called after init)
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

module.exports = { initDatabase, getDb };
