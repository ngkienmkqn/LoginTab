const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function killLocks() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL. Fetching Process List...');

        // Query to find other processes from same user
        const [rows] = await connection.query(`
            SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO 
            FROM information_schema.processlist 
            WHERE USER = ? AND ID != CONNECTION_ID()
        `, [dbConfig.user]);

        console.table(rows);

        if (rows.length === 0) {
            console.log('No other connections found. Lock might be internal or cleared.');
        } else {
            console.log(`Found ${rows.length} other connections. Killing them...`);
            for (const row of rows) {
                try {
                    await connection.query(`KILL ${row.ID}`);
                    console.log(`Killed Process ID: ${row.ID}`);
                } catch (e) {
                    console.error(`Failed to kill ${row.ID}:`, e.message);
                }
            }
        }

        console.log('Lock Clearing Attempt Finished.');
        process.exit(0);

    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

killLocks();
