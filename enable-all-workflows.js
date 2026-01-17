// Set ALL accounts back to AUTO mode (workflows run)
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

async function enableAllWorkflows() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database');

        // Set ALL accounts to auto mode
        const [result] = await connection.query(
            "UPDATE accounts SET automation_mode = 'auto'"
        );
        console.log(`✓ Set ${result.affectedRows} accounts to AUTO mode`);
        console.log('✓ Workflows will run automatically for all accounts');

        await connection.end();
        console.log('\n✓ Done! Restart app - workflows will execute!');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

enableAllWorkflows();
