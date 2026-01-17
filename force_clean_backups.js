const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function clean() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        console.log('Deleting from session_backups...');
        const [res] = await connection.query('DELETE FROM session_backups');
        console.log(`Deleted rows: ${res.affectedRows}`);

        console.log('Verifying...');
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM session_backups');
        console.log(`Count now: ${rows[0].count}`);

        connection.end();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

clean();
