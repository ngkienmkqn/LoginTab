// Check current automation_mode values
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function check() {
    const c = await mysql.createConnection(dbConfig);
    const [rows] = await c.query('SELECT id, name, automation_mode, loginUrl FROM accounts');
    console.log('\n=== Current Automation Modes ===\n');
    rows.forEach(r => {
        console.log(`${r.name}:`);
        console.log(`  Mode: ${r.automation_mode || 'NULL'}`);
        console.log(`  URL: ${r.loginUrl}`);
        console.log('');
    });
    await c.end();
}

check().catch(console.error);
