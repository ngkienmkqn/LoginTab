const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function resetDB() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL');

        // Disable Foreign Key Checks to allow truncation
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('Disabled Foreign Key Checks');

        const tables = [
            'account_assignments', 'accounts', 'users', 'proxies', 'platforms', 'extensions', 'session_backups',
            'customers', 'transactions', 'crm_customers', 'crm_activities', 'question_bank_questions',
            'crm_notifications', 'crm_groups', 'crm_submissions', 'customer_lead', 'level_configs',
            'employees', 'workflows', 'crm_email_contacts', 'assignment_settings'
        ];

        for (const table of tables) {
            try {
                // Try Truncate first (faster, keeps structure)
                await connection.execute(`TRUNCATE TABLE ${table}`);
                console.log(`Truncated ${table}`);
            } catch (e) {
                // Fallback to Drop (if truncate fails)
                await connection.execute(`DROP TABLE IF EXISTS ${table}`);
                console.log(`Dropped ${table} (Truncate failed)`);
            }
        }

        // Re-enable Foreign Key Checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('Re-enabled Foreign Key Checks');

        console.log('Database Reset Complete');
        process.exit(0);
    } catch (e) {
        console.error('Reset Failed:', e);
        process.exit(1);
    }
}

resetDB();
