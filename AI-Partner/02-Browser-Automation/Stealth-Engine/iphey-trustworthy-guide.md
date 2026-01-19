# IPHey "Trustworthy" Master Guide (v5.0 - Native Hardware)

> **Status:** ✅ VERIFIED STABLE
> **Date:** 2026-01-19
> **Technique:** Pure Puppeteer + Manual Evasion Level 5 (Native Hardware)

## 🏆 The "Clean Green" Strategy

Contrary to traditional advice of "mocking everything," our successful strategy for High-End GPU environments (like RTX 3060) relies on **Native Hardware Passthrough**.

**Why it works:**
1.  **Stop Masking:** sophisticated fingerprinting (like IPHey) detects inconsistencies between mocked WebGL params and real performance/timing.
2.  **Less is More:** We only patch the "obvious" automation signals (`webdriver`, `permissions`, `plugins`) and let the real hardware speak for itself.
3.  **Polyfills:** We prevent crashes (`Notification is not defined`) that cause the scanner to hang/fail.

---

## 🛠️ Configuration Snapshot

### 1. Launch Arguments (BrowserManager.js)
**CRITICAL:** Do NOT use `--disable-blink-features=AutomationControlled`. It flags "Red Banner" errors in recent Chrome versions.
Instead, use `ignoreDefaultArgs` and minimal manual flags.

```javascript
const launchArgs = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-save-password-bubble',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-popup-blocking',
    '--disable-notifications',
    // '--window-size=...' // Handled dymanically
    // '--lang=...'       // Handled dymanically
];

const browser = await puppeteer.launch({
    executablePath: chromePath,
    userDataDir: userDataDir,
    ignoreDefaultArgs: ['--enable-automation'], // CRITICAL
    defaultViewport: null,
    headless: false,
    args: launchArgs
});
```

### 2. Manual Stealth Injection (Level 5)
This script successfully passes all 5 IPHey checks (Browser, Location, IP, Hardware, Software).

**Key Features:**
*   **Webdriver:** Hidden (`false`).
*   **Chrome Runtime:** Mocked (Empty object).
*   **Notification:** Polyfilled (Prevents `ReferenceError` crash).
*   **WebGL/Hardware:** **NATIVE** (No mocks). We comment out the mocks to avoid "Masking Detected".

```javascript
await evasionPage.evaluateOnNewDocument((runInfo) => {
    // 1. Hide navigator.webdriver (Standard)
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // 2. Mock Chrome Runtime (Critical for IPHey)
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};

    // 3. Mock Plugins & MimeTypes (Linked)
    const mockPlugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
    ];
    
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const p = [...mockPlugins];
            p.item = (i) => p[i];
            p.namedItem = (name) => p.find(x => x.name === name);
            p.refresh = () => {};
            return p;
        }
    });

    Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
            const m = [
                { type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: mockPlugins[0] },
                { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[1] }
            ];
            m.item = (i) => m[i];
            m.namedItem = (type) => m.find(x => x.type === type);
            return m;
        }
    });

    // 4. Mock Languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'], // Or dynamic based on account
    });

    // 5. Polyfill Notification (Fixes ReferenceError Crash)
    if (!window.Notification) {
        window.Notification = {
            permission: 'default',
            requestPermission: () => Promise.resolve('default')
        };
    }

    // 6. Pass Permissions Check (Safe Fallback)
    if (window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => {
            if (parameters.name === 'notifications') {
                 // Use polyfilled permission
                 return Promise.resolve({ state: window.Notification.permission });
            }
            return originalQuery(parameters);
        };
    }

    // 7. WebGL & Hardware: NATIVE STRATEGY
    // We explicitly DO NOT mock WebGL or HardwareConcurrency.
    // Real hardware (e.g., RTX 3060) is "Trustworthy".
    // Mocking it usually leads to "Masking Detected" or "INVALID_ENUM" errors.

}, { /* Optional args */ });
```

---

## 🚨 Common Pitfalls (Troubleshooting)

### 1. "Software: It was detected that DevTools are open"
*   **Cause:** You have the F12 Inspector open.
*   **Fix:** **Close DevTools** and refresh. IPHey actively detects the debugger.

### 2. "Hardware: Masking detected"
*   **Cause:** You are trying to spoof `hardwareConcurrency` or `WebGL` parameters, but the browser leaks timing data that contradicts your mocks.
*   **Fix:** **Remove the mocks**. Let the real CPU/GPU pass through.

### 3. Page Hangs / Loading Spinner Forever
*   **Cause:** A script error is crashing the execution flow before IPHey finishes checks.
*   **Common Culprit:** `ReferenceError: Notification is not defined` (Electron disables this API by default).
*   **Fix:** Use the Polyfill in Point #5 above.

### 4. "Red Banner: Unsupported Command-line Flag"
*   **Cause:** Using `--disable-blink-features=AutomationControlled` in `args`.
*   **Fix:** Remove it. Use `stealth` scripts (Level 5) instead.

---

## 📝 Verification Checklist

1.  **Launch:** Clean session, no DevTools.
2.  **Browser:** ✅ Real (Chrome)
3.  **Location:** ✅ Ordinary (Matches IP)
4.  **IP Address:** ✅ Clean
5.  **Hardware:** ✅ Match (Native)
6.  **Software:** ✅ Suspicious (None) - **Trustworthy**
