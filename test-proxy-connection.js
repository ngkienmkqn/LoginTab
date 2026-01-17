const net = require('net');
const dns = require('dns').promises;

async function testProxyConnection(host, port, username, password) {
    console.log(`\n=== Testing SOCKS5 Proxy Connection ===`);
    console.log(`Host: ${host}`);
    console.log(`Port: ${port}`);
    console.log(`Auth: ${username ? 'YES' : 'NO'}\n`);

    // Test 1: DNS Resolution
    try {
        console.log('[1/4] DNS Resolution...');
        const addresses = await dns.resolve4(host).catch(() => []);
        if (addresses.length > 0) {
            console.log(`✓ Resolved to: ${addresses.join(', ')}`);
        } else {
            console.log(`i Using host as-is (might be IP)`);
        }
    } catch (err) {
        console.log(`⚠ DNS lookup failed: ${err.message}`);
    }

    // Test 2: TCP Connection
    return new Promise((resolve) => {
        console.log('\n[2/4] TCP Connection...');
        const socket = new net.Socket();
        let connected = false;

        socket.setTimeout(10000);

        socket.on('connect', () => {
            connected = true;
            console.log('✓ TCP connection established');

            // Test 3: SOCKS5 Handshake
            console.log('\n[3/4] SOCKS5 Handshake...');

            // Send SOCKS5 greeting (with auth)
            const greeting = Buffer.from([0x05, 0x02, 0x00, 0x02]); // Version 5, 2 methods: no-auth & user/pass
            socket.write(greeting);
        });

        socket.on('data', (data) => {
            console.log(`✓ Received ${data.length} bytes from proxy`);
            console.log(`  Data: ${data.toString('hex')}`);

            if (data[0] === 0x05) {
                if (data[1] === 0x00) {
                    console.log('✓ Proxy accepted: No authentication required');
                } else if (data[1] === 0x02) {
                    console.log('✓ Proxy accepted: Username/password authentication');
                } else if (data[1] === 0xFF) {
                    console.log('✗ Proxy rejected: No acceptable methods');
                }
            }

            console.log('\n[4/4] Result: Proxy is REACHABLE and RESPONDING');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            console.log('✗ Connection timeout (10s exceeded)');
            console.log('\n[4/4] Result: Proxy is UNREACHABLE or TOO SLOW');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            socket.destroy();
            resolve(false);
        });

        socket.on('error', (err) => {
            if (!connected) {
                console.log(`✗ TCP connection failed: ${err.message}`);
                console.log(`  Code: ${err.code}`);
                console.log('\n[4/4] Result: CANNOT CONNECT TO PROXY');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('\nPossible causes:');
                console.log('  • Proxy server is offline');
                console.log('  • Firewall blocking the connection');
                console.log('  • Incorrect host/port');
                console.log('  • Network connectivity issues');
            } else {
                console.log(`⚠ Error during handshake: ${err.message}`);
            }
            resolve(false);
        });

        socket.connect(port, host);
    });
}

// Example usage
const proxyHost = '74.81.37.141';
const proxyPort = 28929;
const proxyUser = 'your-username';
const proxyPass = 'your-password';

testProxyConnection(proxyHost, proxyPort, proxyUser, proxyPass)
    .then(() => process.exit(0));
