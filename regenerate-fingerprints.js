// Regenerate all fingerprints with fixed realistic values
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function regenerateFingerprints() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database\n');

        // Clear ALL fingerprints
        const [result] = await connection.query(
            "UPDATE accounts SET fingerprint_config = NULL"
        );
        console.log(`✓ Cleared ${result.affectedRows} old fingerprints`);
        console.log('\n✅ Fixed issues:');
        console.log('  - Chrome/undefined → Chrome/128-131');
        console.log('  - Realistic hardware specs (4-16 cores, 4-32GB RAM)');
        console.log('  - Realistic screen resolutions');
        console.log('  - Proper WebGL renderers');
        console.log('  - Windows-realistic plugins');
        console.log('\n✓ Fresh fingerprints will be generated on next launch');
        console.log('✓ Each account = unique "device" stored FOREVER');

        await connection.end();
        console.log('\n🎯 Done! Restart app to generate realistic fingerprints.');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

regenerateFingerprints();
