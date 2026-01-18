const { getPool } = require('./src/database/mysql');

async function analyzeTazapayIssue() {
    try {
        const pool = await getPool();

        console.log('=== ANALYZING TAZAPAY LOGIN ISSUE ===\n');

        // 1. Get all accounts with their platform info
        const [accounts] = await pool.query(`
            SELECT a.id, a.platform_id, a.loginUrl, a.proxy_config, a.auth_config, a.fingerprint_config,
                   p.name as platform_name, p.url as platform_url
            FROM accounts a
            LEFT JOIN platforms p ON a.platform_id = p.id
            LIMIT 5
        `);

        console.log('ACCOUNTS FOUND:', accounts.length);
        accounts.forEach(acc => {
            console.log(`\n--- Account: ${acc.id.substring(0, 8)} ---`);
            console.log(`Platform: ${acc.platform_name}`);
            console.log(`Login URL: ${acc.loginUrl}`);

            // Check proxy config
            let proxy = null;
            try {
                proxy = typeof acc.proxy_config === 'string' ? JSON.parse(acc.proxy_config) : acc.proxy_config;
            } catch (e) { proxy = null; }

            if (proxy && proxy.host) {
                console.log(`Proxy: ${proxy.type || 'http'}://${proxy.host}:${proxy.port}${proxy.user ? ' (authenticated)' : ''}`);
            } else {
                console.log(`Proxy: NONE (Direct connection)`);
            }

            // Check auth config
            let auth = null;
            try {
                auth = typeof acc.auth_config === 'string' ? JSON.parse(acc.auth_config) : acc.auth_config;
            } catch (e) { auth = null; }

            if (auth) {
                console.log(`Auth - Email: ${auth.email || auth.username || 'N/A'}`);
                console.log(`Auth - Has Password: ${!!auth.password}`);
                console.log(`Auth - Has 2FA: ${!!auth.twoFactorSecret || !!auth.secret2FA}`);
            }

            // Check fingerprint
            let fp = null;
            try {
                fp = typeof acc.fingerprint_config === 'string' ? JSON.parse(acc.fingerprint_config) : acc.fingerprint_config;
            } catch (e) { fp = null; }

            if (fp) {
                console.log(`Fingerprint - OS: ${fp.os || fp.platformName || 'N/A'}`);
                console.log(`Fingerprint - UA: ${fp.userAgent ? fp.userAgent.substring(0, 50) + '...' : 'N/A'}`);
                console.log(`Fingerprint - WebGL: ${fp.webglRenderer || 'N/A'}`);
            }
        });

        console.log('\n=== ANALYSIS COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err.message);
        process.exit(1);
    }
}

analyzeTazapayIssue();
