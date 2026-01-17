// Clear all fingerprints and regenerate with fresh data
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function resetFingerprints() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database\n');

        // Clear ALL fingerprints
        const [result] = await connection.query(
            "UPDATE accounts SET fingerprint_config = NULL"
        );
        console.log(`✓ Cleared ${result.affectedRows} fingerprints`);
        console.log('✓ Fresh fingerprints will be generated on next launch');
        console.log('\nEach account will get:');
        console.log('  - Unique Chrome version (128-131)');
        console.log('  - Unique screen resolution');
        console.log('  - Unique WebGL renderer');
        console.log('  - Unique canvas noise');
        console.log('  - Unique hardware specs');
        console.log('  - Stored in database FOREVER');

        await connection.end();
        console.log('\n✓ Done! Restart app to generate new fingerprints.');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

resetFingerprints();
