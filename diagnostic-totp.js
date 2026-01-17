const mysql = require('mysql2/promise');
const otplib = require('otplib');
const crypto = require('crypto');
const { TOTP } = otplib;

// Manually configure crypto for otplib v13+ if standard preset fails
const authenticator = new TOTP({
    createDigest: (algorithm, content) => crypto.createHash(algorithm).update(content).digest(),
    createRandomBytes: (size) => crypto.randomBytes(size)
});

// Config from src/database/mysql.js
const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: {
        rejectUnauthorized: false
    }
};

async function run() {
    try {
        console.log('--- DIAGNOSTIC START ---');
        console.log('[DB] Connecting to DigitalOcean...');

        const connection = await mysql.createConnection(dbConfig);
        console.log('[DB] Connected.');

        // Fetch Accounts
        const [rows] = await connection.execute('SELECT * FROM accounts');
        console.log(`[DB] Found ${rows.length} accounts.`);

        for (const row of rows) {
            console.log(`\nChecking Account: ${row.name} (${row.id})`);

            let auth = {};
            try {
                auth = typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config;
            } catch (e) {
                console.error('Failed to parse auth_config');
                continue;
            }

            // Normalize
            const secret = auth.twoFactorSecret || auth.secret2FA;

            if (secret) {
                console.log(`[Auth] Warning: Secret Found! Length: ${secret.length}`);

                // Mask secret for safety but show enough to debug
                const masked = secret.length > 5 ? secret.substring(0, 5) + '***' : '***';
                console.log(`[Auth] Secret Preview: ${masked}`);

                // Clean
                const cleaned = secret.replace(/\s+/g, '').toUpperCase();
                console.log(`[Auth] Cleaned Length: ${cleaned.length}`);

                try {
                    const code = authenticator.generate(cleaned);
                    console.log(`[TOTP] SUCCESS! Generated Code: ${code}`);
                } catch (err) {
                    console.error(`[TOTP] GENERATION FAILED: ${err.message}`);
                    console.error('[TOTP] Hint: Secret might be non-base32 or have invalid chars.');
                }
            } else {
                console.log('[Auth] No 2FA Secret present.');
            }
        }

        await connection.end();
        console.log('\n--- DIAGNOSTIC COMPLETE ---');

    } catch (err) {
        console.error('Fatal Error:', err);
    }
}

run();
