// Quick script to set all accounts to manual mode
const mysql = require('mysql2/promise');

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

async function setManualMode() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database');

        // Set all accounts to manual mode
        const [result] = await connection.query(
            "UPDATE accounts SET automation_mode = 'manual'"
        );
        console.log(`✓ Updated ${result.affectedRows} accounts to manual mode`);

        // Clear broken fingerprints (Chrome undefined)
        const [result2] = await connection.query(
            "UPDATE accounts SET fingerprint_config = NULL"
        );
        console.log(`✓ Cleared ${result2.affectedRows} fingerprints (will regenerate with latest Chrome)`);

        await connection.end();
        console.log('\n✓ Done! Restart app to test manual mode.');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

setManualMode();
