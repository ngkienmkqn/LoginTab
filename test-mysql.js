const mysql = require('mysql2/promise');

console.log('mysql2/promise loaded successfully');
console.log('mysql object:', typeof mysql);
console.log('mysql.createPool:', typeof mysql.createPool);

const pool = mysql.createPool({
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: {
        rejectUnauthorized: false
    }
});

console.log('Pool created successfully');

pool.getConnection()
    .then(conn => {
        console.log('Connection successful!');
        conn.release();
        process.exit(0);
    })
    .catch(err => {
        console.error('Connection failed:', err);
        process.exit(1);
    });
