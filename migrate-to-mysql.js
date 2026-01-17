const fs = require('fs-extra');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function migrate() {
    const dbPath = path.join(process.cwd(), 'db.json');
    if (!fs.existsSync(dbPath)) {
        console.error('db.json not found!');
        return;
    }

    const data = await fs.readJson(dbPath);
    const conn = await mysql.createConnection(dbConfig);
    console.log('Connected to MySQL for migration...');

    // 1. Migrate Users
    if (data.users) {
        console.log(`Migrating ${data.users.length} users...`);
        for (const user of data.users) {
            await conn.query(
                'INSERT IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
                [user.id, user.username, user.password, user.role]
            );
        }
    }

    // 2. Migrate Proxies
    if (data.proxies) {
        console.log(`Migrating ${data.proxies.length} proxies...`);
        for (const proxy of data.proxies) {
            await conn.query(
                'INSERT IGNORE INTO proxies (id, type, host, port, user, pass) VALUES (?, ?, ?, ?, ?, ?)',
                [proxy.id, proxy.type || 'http', proxy.host, proxy.port, proxy.user, proxy.pass]
            );
        }
    }

    // 3. Migrate Platforms
    if (data.platforms) {
        console.log(`Migrating ${data.platforms.length} platforms...`);
        for (const plat of data.platforms) {
            await conn.query(
                'INSERT IGNORE INTO platforms (id, name, url) VALUES (?, ?, ?)',
                [plat.id, plat.name, plat.url]
            );
        }
    }

    // 4. Migrate Extensions
    if (data.extensions) {
        console.log(`Migrating ${data.extensions.length} extensions...`);
        for (const ext of data.extensions) {
            await conn.query(
                'INSERT IGNORE INTO extensions (id, name, path) VALUES (?, ?, ?)',
                [ext.id, ext.name, ext.path]
            );
        }
    }

    // 5. Migrate Accounts
    if (data.accounts) {
        console.log(`Migrating ${data.accounts.length} accounts...`);
        for (const acc of data.accounts) {
            await conn.query(
                'INSERT IGNORE INTO accounts (id, name, loginUrl, proxy_config, auth_config, fingerprint_config, extensions_path, lastActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    acc.id,
                    acc.name,
                    acc.loginUrl,
                    JSON.stringify(acc.proxy || {}),
                    JSON.stringify(acc.auth || {}),
                    JSON.stringify(acc.fingerprint || {}),
                    acc.extensionsPath || '',
                    acc.lastActive ? new Date(acc.lastActive) : null
                ]
            );
        }
    }

    console.log('Migration completed successfully!');
    await conn.end();
}

migrate().catch(console.error);
