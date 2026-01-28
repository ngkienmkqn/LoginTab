# Google Login Bypass Strategy ("Real Chrome")

## 1. Core Principle
**"Real Chrome, Zero Noise"**
Do not use `navigator.webdriver` spoofing on Chromium. Use the **actual** Google Chrome binary installed on the user's machine.

## 2. Implementation
### 2.1 Launch Args
We strip default automation flags.
```javascript
// src/managers/BrowserManager.js
args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled', // <--- CRITICAL
    '--disable-infobars'
]
```

### 2.2 Client Hints (UA-CH)
Puppeteer's `setUserAgent` does NOT fix `navigator.userAgentData`. We inject a script to mock it:
- **Platform**: Must match host OS (Windows -> "Windows").
- **Brands**: Must match Chrome version (e.g., "Google Chrome"; v="131").

### 2.3 "cdc_" Variable
Google checks for `window.cdc_adoQpoasnfa76pfcZLmcfl_Array`.
**Solution**: `Page.evaluateOnNewDocument` deletes all properties starting with `cdc_`.

## 3. Anti-Patterns (Do NOT Do This)
- **Canvas Noise**: Randomizing pixels triggers "Suspicious Fingerprint".
- **Bundled Chromium**: Lacks Widevine/Codecs, triggers "Insecure Browser".
