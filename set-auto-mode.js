// Set specific account back to auto mode
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

async function setAutoMode() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database');

        // Set Tazapay accounts to manual (protected sites)
        const [result1] = await connection.query(
            "UPDATE accounts SET automation_mode = 'manual' WHERE loginUrl LIKE '%tazapay%' OR loginUrl LIKE '%google%' OR loginUrl LIKE '%gmail%'"
        );
        console.log(`✓ Set ${result1.affectedRows} protected accounts to MANUAL mode (Tazapay, Google, Gmail)`);

        // Set all other accounts to auto
        const [result2] = await connection.query(
            "UPDATE accounts SET automation_mode = 'auto' WHERE loginUrl NOT LIKE '%tazapay%' AND loginUrl NOT LIKE '%google%' AND loginUrl NOT LIKE '%gmail%'"
        );
        console.log(`✓ Set ${result2.affectedRows} accounts to AUTO mode (workflows will run)`);

        await connection.end();
        console.log('\n✓ Done! Restart app to apply changes.');
        console.log('\nMode summary:');
        console.log('- Tazapay/Google/Gmail → MANUAL (login yourself)');
        console.log('- Other sites → AUTO (workflows run automatically)');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

setAutoMode();
