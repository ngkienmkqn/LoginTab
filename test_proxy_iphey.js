/**
 * Quick Test: IPHey with SOCKS5 Proxy + WebRTC Protection
 */

const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ProxyChain = require('proxy-chain');
const fs = require('fs-extra');

// Apply Stealth Plugin
const stealth = StealthPlugin();
puppeteer.use(stealth);

async function testWithProxy() {
    console.log('🧪 Testing IPHey with SOCKS5 Proxy + WebRTC Protection\n');

    // Proxy config
    const proxyConfig = {
        host: '74.81.37.141',
        port: 28929,
        user: 'thehuman',
        pass: 'Vanhanh123456',
        type: 'socks5'
    };

    console.log(`📡 Proxy: ${proxyConfig.type}://${proxyConfig.host}:${proxyConfig.port}`);
    console.log(`🌏 Expected Location: Singapore\n`);

    let browser, anonymizedProxyUrl;

    try {
        // Setup proxy via ProxyChain
        const upstreamUrl = `${proxyConfig.type}://${proxyConfig.user}:${proxyConfig.pass}@${proxyConfig.host}:${proxyConfig.port}`;
        anonymizedProxyUrl = await ProxyChain.anonymizeProxy(upstreamUrl);
        console.log(`✓ Proxy bridge created: ${anonymizedProxyUrl}\n`);

        // Find Chrome
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ];

        let executablePath = null;
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }

        if (!executablePath) throw new Error('Chrome not found!');

        // Launch args
        const args = [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080',
            `--proxy-server=${anonymizedProxyUrl}`,
            '--proxy-bypass-list=<-loopback>',
            '--exclude-switches=enable-automation'
        ];

        console.log('🚀 Launching browser with proxy...');
        browser = await puppeteer.launch({
            executablePath,
            headless: false,
            args,
            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();

        // Inject WebRTC leak protection
        console.log('🛡️  Injecting WebRTC leak protection...');
        await page.evaluateOnNewDocument(() => {
            // Block getUserMedia
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = function () {
                return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
            };

            // Override RTCPeerConnection
            const originalRTCPeerConnection = window.RTCPeerConnection;
            window.RTCPeerConnection = function (config = {}) {
                if (!config.iceServers) config.iceServers = [];
                config.iceTransportPolicy = 'relay';
                return new originalRTCPeerConnection(config);
            };
            window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
        });

        // Navigate to IPHey
        console.log('🌐 Navigating to iphey.com...');
        await page.goto('https://iphey.com', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('⏳ Waiting 15 seconds for IPHey to load...\n');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Extract results
        const results = await page.evaluate(() => {
            const text = document.body.innerText;

            // Find IP
            const ipMatch = text.match(/IP[:\s]+(\d+\.\d+\.\d+\.\d+)/i);
            const ip = ipMatch ? ipMatch[1] : 'Not found';

            // Find Location
            const locationMatch = text.match(/location[:\s]+([A-Z]{2})[,\s]+([^,\n]+)/i);
            const location = locationMatch ? `${locationMatch[1]}, ${locationMatch[2]}` : 'Not found';

            // Find Trustworthy
            const trustMatch = text.match(/trustworthy|suspicious|low/i);
            const trust = trustMatch ? trustMatch[0] : 'Unknown';

            // Check for spinner
            const hasSpinner = Array.from(document.querySelectorAll('*')).some(el => {
                const styles = window.getComputedStyle(el);
                return styles.animation && styles.animation.includes('spin');
            });

            // Check if loaded
            const hasData = text.includes('WebGL') || text.includes('Canvas');

            return { ip, location, trust, hasSpinner, hasData };
        });

        // Display results
        console.log('═'.repeat(70));
        console.log('RESULTS');
        console.log('═'.repeat(70));
        console.log(`IP Address:    ${results.ip}`);
        console.log(`Location:      ${results.location}`);
        console.log(`Trust Status:  ${results.trust}`);
        console.log(`Has Spinner:   ${results.hasSpinner ? '⚠️  Yes (still loading)' : '✅ No'}`);
        console.log(`Data Loaded:   ${results.hasData ? '✅ Yes' : '❌ No'}`);
        console.log('═'.repeat(70));

        // Take screenshot
        const screenshotPath = `iphey_proxy_test_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`\n📸 Screenshot saved: ${screenshotPath}`);

        // Verify proxy is working
        if (results.ip.includes('74.81.37')) {
            console.log('❌ WARNING: Showing proxy IP directly (proxy may be transparent)');
        } else if (results.location.toLowerCase().includes('singapore') || results.location.includes('SG')) {
            console.log('✅ SUCCESS: Location matches proxy (Singapore)');
        } else {
            console.log(`⚠️  Location mismatch: Expected Singapore, got ${results.location}`);
        }

        // Check WebRTC leak
        console.log('\n🔍 Checking for WebRTC IP leak...');
        const leakedIPs = await page.evaluate(() => {
            return new Promise((resolve) => {
                const ips = [];
                const pc = new RTCPeerConnection({ iceServers: [] });

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const ipMatch = event.candidate.candidate.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
                        if (ipMatch && !ipMatch[0].startsWith('127.')) {
                            ips.push(ipMatch[0]);
                        }
                    }
                };

                pc.createDataChannel('test');
                pc.createOffer().then(offer => pc.setLocalDescription(offer));

                setTimeout(() => {
                    pc.close();
                    resolve(ips);
                }, 3000);
            });
        });

        if (leakedIPs.length === 0) {
            console.log('✅ WebRTC Protection Working: No IP leak detected');
        } else {
            console.log(`⚠️  WebRTC Leaked IPs: ${leakedIPs.join(', ')}`);
        }

        console.log('\n⏸️  Browser will stay open for 10 seconds. Check the page yourself!');
        await new Promise(resolve => setTimeout(resolve, 10000));

        await browser.close();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (browser) await browser.close();
    } finally {
        if (anonymizedProxyUrl) {
            await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
            console.log('\n✓ Proxy bridge closed');
        }
    }
}

testWithProxy().catch(console.error);
