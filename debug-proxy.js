const ProxyChain = require('proxy-chain');

async function test() {
    const type = 'socks5';
    const user = 'user@name'; // special char
    const pass = 'pass:word'; // special char
    const host = '1.2.3.4';
    const port = '1080';

    // Current way:
    const originalUrl = `${type}://${user}:${pass}@${host}:${port}`;
    console.log('Original URL (Unsafe):', originalUrl);

    try {
        const anonymized = await ProxyChain.anonymizeProxy(originalUrl);
        console.log('Anonymized URL:', anonymized);
        await ProxyChain.closeAnonymizedProxy(anonymized, true);
    } catch (err) {
        console.error('Anonymization failed:', err.message);
    }

    // Safer way:
    const safeUrl = new URL(`${type}://${host}:${port}`);
    safeUrl.username = user;
    safeUrl.password = pass;
    console.log('Safe URL:', safeUrl.toString());
}

test();
