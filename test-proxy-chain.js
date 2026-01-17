const ProxyChain = require('proxy-chain');

async function testProxy() {
    const originalUrl = 'socks5://thehuman:Vanhanh123456@74.81.37.141:28929';
    try {
        console.log('Testing ProxyChain.anonymizeProxy with SOCKS5...');
        const anonymizedProxyUrl = await ProxyChain.anonymizeProxy(originalUrl);
        console.log('Anonymized URL:', anonymizedProxyUrl);

        // Let's try to close it
        await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
        console.log('Closed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testProxy();
