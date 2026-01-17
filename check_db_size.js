const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function checkSize() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL. Fetching Table Stats...\n');

        const [tables] = await connection.query(`
            SELECT 
                table_name AS "Table", 
                ROUND(((data_length + index_length) / 1024 / 1024), 2) AS "Size (MB)", 
                table_rows AS "Rows"
            FROM information_schema.tables 
            WHERE table_schema = ? 
            ORDER BY (data_length + index_length) DESC;
        `, [dbConfig.database]);

        console.table(tables);

        // Calculate total
        const totalSize = tables.reduce((acc, row) => acc + parseFloat(row['Size (MB)']), 0);
        console.log(`\nTOTAL DATABASE SIZE: ${totalSize.toFixed(2)} MB`);

        connection.end();
    } catch (e) {
        console.error('Error:', e);
    }
}

checkSize();
