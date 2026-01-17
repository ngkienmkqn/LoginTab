// Force regenerate all fingerprints with proper chromeVersion
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function forceRegenerate() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database\n');

        // Clear ALL fingerprints
        const [result] = await connection.query(
            "UPDATE accounts SET fingerprint_config = NULL"
        );
        console.log(`✓ Cleared ${result.affectedRows} fingerprints`);
        console.log('\n✅ Will regenerate with:');
        console.log('  - Chrome 128-131 (NO undefined!)');
        console.log('  - userAgent with proper version');
        console.log('  - chromeVersion field');
        console.log('  - Realistic hardware');
        console.log('\n✓ Restart app to generate FINAL fingerprints');

        await connection.end();
        console.log('\n🎯 Done!');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

forceRegenerate();
