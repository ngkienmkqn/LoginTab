// Check what's actually in database
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function checkFingerprints() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.query('SELECT id, name, fingerprint_config FROM accounts');

        console.log('\n=== Current Fingerprints in Database ===\n');
        rows.forEach(row => {
            console.log(`Account: ${row.name}`);
            if (row.fingerprint_config) {
                const fp = typeof row.fingerprint_config === 'string'
                    ? JSON.parse(row.fingerprint_config)
                    : row.fingerprint_config;
                console.log(`  Generated: ${fp.generated || 'MISSING'}`);
                console.log(`  Chrome: ${fp.chromeVersion || 'MISSING'}`);
                console.log(`  UserAgent: ${fp.userAgent?.substring(0, 80)}...`);
            } else {
                console.log('  Fingerprint: NULL');
            }
            console.log('');
        });

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkFingerprints();
