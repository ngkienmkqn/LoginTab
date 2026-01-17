const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function checkCount() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        const [rows] = await connection.query('SELECT COUNT(*) as count FROM session_backups');
        console.log(`Real Row Count (session_backups): ${rows[0].count}`);

        const [rows2] = await connection.query('SELECT id, LENGTH(zip_data) as size FROM session_backups');
        if (rows2.length > 0) {
            console.log('WARNING: Rows found in session_backups!');
            console.table(rows2);
        } else {
            console.log('Confirmed: session_backups is empty.');
        }

        connection.end();
    } catch (e) {
        console.error('Error:', e);
    }
}

checkCount();
