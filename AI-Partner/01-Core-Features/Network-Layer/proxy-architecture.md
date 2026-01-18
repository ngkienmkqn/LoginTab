# Proxy Architecture & Network Layer

## 1. The Challenge
Using proxies with Puppeteer/Chrome accounts for two main problems:
1.  **Authentication Popups**: Chrome does not support providing proxy username/password via launch arguments for SOCKS5/HTTP in a seamless way. It often throws a native login popup which breaks automation.
2.  **WebRTC Leaks**: Real IPs can leak through standard UDP WebRTC channels even if a proxy is set.

## 2. The Solution: `proxy-chain`
We use `proxy-chain` (Node.js library) as an intermediate local proxy server.

### Application Flow
1.  **Input**: User enters `http://user:pass@1.2.3.4:8080` in the UI.
2.  **Anonymization Server**:
    - `BrowserManager.js` spins up a **local** proxy server using `proxy-chain`.
    - Local interface: `http://127.0.0.1:<random_port>`.
    - This local server handles the upstream authentication (`user:pass`) transparently.
3.  **Browser Launch**:
    - We pass `--proxy-server=127.0.0.1:<random_port>` to Chrome.
    - Chrome sees an open proxy (no auth required locally), so **no popups**.
4.  **Tear Down**: When the browser closes, the local proxy server is closed to free up ports.

## 3. Proxy Validation (`ProxyChecker.js`)
Before launching a profile, we must ensure the proxy is alive to avoid exposing the machine's real IP or crashing the browser.

### Verification Steps
1.  **Connectivity Check**: Attempts to fetch `http://google.com` via the proxy.
2.  **Timeout**: Enforces a strict 5s timeout. If it's slow, it's marked "Dead".
3.  **Database Cache**: Updates the `proxies` table with `status='Live'` or `'Dead'` and `last_checked` timestamp.

## 4. WebRTC Leak Prevention
In addition to the proxy tunnel, we inject specific Javascript hooks.
- **Reference**: `PuppeteerEvasion.fixWebRTC()`
- **Logic**:
  - Overrides `RTCPeerConnection`.
  - Blocks UDP traffic or forces it through the proxy interface (depending on config).
  - **Result**: Sites like `browserleaks.com/webrtc` see the Proxy IP, not the implementation's robust local IP.

## 5. Critical AI Note
If a user reports "Browser opens but pages don't load", the first suspect is the **Local Proxy Chain**.
- Check if the upstream proxy credits expired.
- Check if `proxy-chain` failed to bind a local port (EADDRINUSE).
