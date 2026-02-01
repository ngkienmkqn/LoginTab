# Stealth & Evasion Engine (Zero Noise Strategy)

## 1. Philosophy: "Hiding in Plain Sight"
Instead of aggressively mocking every fingerprint (which create anomalies), Login Tab adopts a **Consistency-First** approach ("Zero Noise").
- **Goal**: Match the natural behavior of a standard Chrome browser.
- **Rule**: If an evasion technique causes a "Proxy/Browser Mismatch" or "Canvas Noise" flag, it is removed.

## 2. Implementation Layers

### Layer 1: Puppeteer Launch Flags (Main.js)
We strip automation signals at the process level:
```javascript
const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled', // CRITICAL: Hides navigator.webdriver
    '--disable-infobars',
    '--disable-notifications'
];
```

### Layer 2: `puppeteer-extra-plugin-stealth`
- **Role**: Base baseline.
- **Scope**: Handles generic implementation details (Permissions, Plugin arrays, Window dimensions).
- **Modification**: We disable its `user-agent-override` feature to handle it manually for better consistency with Client Hints.

### Layer 3: Custom Ejections (`PuppeteerEvasion.js`)
Scripts injected into every page implementation (`Page.evaluateOnNewDocument`).

#### A. WebGL Spoofing
- **Mechanism**: Proxies `getParameter` to return specific Vendor/Renderer strings (e.g., "Google Inc. (NVIDIA)", "ANGLE (NVIDIA RTX 3060)").
- **Why**: Bot detection checks if your GPU matches your claimed OS/Hardware class.

#### B. Client Hints (UA-CH)
- **Mechanism**: Overrides `navigator.userAgentData`.
- **Why**: Modern sites (Gmail) trust UA-CH more than the User-Agent string. We ensure the `platform` (Windows/macOS) and `brands` (Chrome v132) match the UA string perfectly.

#### C. CDC_ Signature Removal
- **Detection**: Selenium/Puppeteer leaves a `cdc_...` global variable.
- **Fix**: We delete this property immediately on document creation.

## 3. Fingerprint Generation (`FingerprintGenerator.js`)
We do not use random strings. We use **Realistic Profiles**:
- **Templates**: Pre-defined logic for Windows (Win10/11) vs Mac (Intel/M1).
- **Consistency**:
  - If OS = Windows -> GPU = NVIDIA/AMD.
  - If OS = Mac -> GPU = Apple M1 / Intel Iris.
- **Storage**: Fingerprint config is JSON stored in `accounts` table.

## 4. Gmail Specific Bypasses
- **Issue**: "This browser or app may not be secure".
- **Solution**:
  1. Use **Real Chrome** (`executablePath` set to user's installation), NOT Chromium.
  2. Maintain **Cookie Persistence** (UserDataDir).
  3. Ensure **Identity Consistency** (UA-CH matches UA).
