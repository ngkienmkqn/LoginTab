const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function checkData() {
    const connection = await mysql.createConnection(dbConfig);

    console.log('=== Checking if data is truly deleted ===\n');

    const tables = ['accounts', 'proxies', 'platforms', 'extensions', 'session_backups', 'users'];

    for (const table of tables) {
        try {
            const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
            const count = rows[0].count;
            console.log(`${table}: ${count} rows ${count === 0 ? '✅' : '❌ NOT EMPTY!'}`);
        } catch (e) {
            console.log(`${table}: ERROR - ${e.message}`);
        }
    }

    console.log('\n=== Result ===');
    console.log('If all tables show 0 rows, then data is DELETED.');
    console.log('The 30 MB size is just "reserved space" (empty boxes).');

    connection.end();
    process.exit(0);
}

checkData();
