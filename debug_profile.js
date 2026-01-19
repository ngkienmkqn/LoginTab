const { initDB, getPool } = require('./src/database/mysql');

async function checkProfile(usernameOrId) {
    try {
        await initDB();
        const pool = await getPool();

        // Try to find by ID then username (using 'accounts' table)
        const [rows] = await pool.query(
            'SELECT id, name, auth_config FROM accounts WHERE id = ? OR name LIKE ?',
            [usernameOrId, `%${usernameOrId}%`]
        );

        console.log(`\n--- Profile Check: ${usernameOrId} ---`);
        if (rows.length === 0) {
            console.log('❌ No profile found.');
        } else {
            rows.forEach(row => {
                console.log(`\nFound Profile: [${row.name}] (${row.id})`);
                console.log('Raw auth_config (DB):', row.auth_config);

                let auth = row.auth_config || {};
                if (typeof auth === 'string') {
                    console.log('⚠ auth_config is a STRING. Parsing...');
                    try {
                        auth = JSON.parse(auth);
                        console.log('✅ Parsed successfully.');
                    } catch (e) {
                        console.error('❌ Failed to parse JSON:', e.message);
                    }
                } else {
                    console.log('ℹ auth_config is ALREADY an Object.');
                }

                console.log('--- Resolved Credentials ---');
                console.log('Username:', auth.username ? `'${auth.username}'` : '❌ MISSING/UNDEFINED');
                console.log('Password:', auth.password ? '****** (Exists)' : '❌ MISSING/UNDEFINED');
                console.log('2FA Secret:', auth.twofaSecret || auth.twofa_secret ? '(Exists)' : '(Empty)');
            });
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

// Check the specific email user mentioned
checkProfile('info.gearhumanhk@gmail.com');
