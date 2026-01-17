const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
};

async function checkFingerprint() {
    const connection = await mysql.createConnection(dbConfig);

    console.log('=== Checking Fingerprint Configuration ===\n');

    const [accounts] = await connection.query('SELECT id, name, fingerprint_config FROM accounts LIMIT 1');

    if (accounts.length === 0) {
        console.log('No accounts found.');
        connection.end();
        process.exit(0);
    }

    const account = accounts[0];

    if (!account.fingerprint_config) {
        console.log(`Account: ${account.name} (${account.id})`);
        console.log('❌ NO FINGERPRINT! (NULL in database)');
        console.log('\nThis is normal if you just reset the database.');
        console.log('Launch the profile once to generate a new fingerprint.');
        connection.end();
        process.exit(0);
    }

    const fp = JSON.parse(account.fingerprint_config);

    console.log(`Account: ${account.name} (${account.id})`);
    console.log(`Generated: ${fp.generated}\n`);

    console.log('=== Checking OS-Specific Fields ===');
    console.log(`✓ platform: ${fp.platform || 'MISSING'}`);
    console.log(`${fp.platformName ? '✓' : '❌'} platformName: ${fp.platformName || 'MISSING - NEEDS REGENERATION'}`);
    console.log(`${fp.oscpu !== undefined ? '✓' : '❌'} oscpu: ${fp.oscpu || 'undefined (OK for Mac)'}`);
    console.log(`${fp.fonts ? '✓' : '❌'} fonts: ${fp.fonts ? fp.fonts.length + ' fonts' : 'MISSING'}`);
    console.log(`${fp.plugins ? '✓' : '❌'} plugins: ${fp.plugins ? fp.plugins.length + ' plugins' : 'MISSING'}`);

    console.log('\n=== WebGL Info ===');
    console.log(`WebGL Vendor: ${fp.webglVendor}`);
    console.log(`WebGL Renderer: ${fp.webglRenderer}`);

    console.log('\n=== User Agent ===');
    console.log(fp.userAgent);

    const needsRegeneration = !fp.platformName || !fp.fonts || !fp.plugins;

    console.log('\n=== VERDICT ===');
    if (needsRegeneration) {
        console.log('❌ OLD FINGERPRINT DETECTED!');
        console.log('Missing: platformName, fonts arrays, plugins arrays');
        console.log('\nSOLUTION: Delete fingerprint to force regeneration');
        console.log('Run: UPDATE accounts SET fingerprint_config = NULL WHERE id = \'' + account.id + '\';');
    } else {
        console.log('✅ Fingerprint has all OS-specific fields!');
        console.log('Platform consistency should be working.');
    }

    connection.end();
    process.exit(0);
}

checkFingerprint();
