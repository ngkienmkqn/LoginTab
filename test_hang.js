const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false },
    connectTimeout: 10000
};

async function testQuery() {
    console.log('Starting Test...');
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL');

        console.log('Querying session_backups...');
        const [rows] = await connection.query('SELECT zip_data FROM session_backups LIMIT 1');
        console.log(`Query returned ${rows.length} rows`);

        console.log('Test Complete');
        process.exit(0);
    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    }
}

testQuery();
