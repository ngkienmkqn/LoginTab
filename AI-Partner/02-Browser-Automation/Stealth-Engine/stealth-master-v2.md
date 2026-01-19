# Stealth Engine Master Spec v2.0 (The "Golden Formula")

> **Status:** ACTIVE (v2.1.0+)
> **Focus:** Google Login Bypass, IPHey Trust, & Anti-Fingerprinting
> **Strategy:** "Real Chrome, Zero Noise"

## 1. Core Philosophy
Instead of "spoofing" everything (which creates noise), we use the **User's Real Chrome** environment and surgically remove automation flags. We do **not** add random canvas noise or fake audio fingerprints, as these are red flags for modern AI detectors.

## 2. The Implementation (BrowserManager.js)

### A. Executable Strategy
We bind to the **System Chrome/Edge** binary.
- **Windows:** `C:\Program Files\Google\Chrome\Application\chrome.exe`
- **macOS:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux:** `/usr/bin/google-chrome`

### B. Launch Arguments (Critical)
We MUST strip standard Puppeteer flags and inject specific ones.

```javascript
const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled', // <--- THE KEY. Hides navigator.webdriver
    '--disable-infobars',
    '--disable-notifications',
    // NO '--enable-automation'
];
```

### C. Client Hints (UA-CH) Injection
**CRITICAL:** Google checks `navigator.userAgentData`. Puppeteer's `setUserAgent` does NOT populate this. We must inject it via `Page.evaluateOnNewDocument`.

**The Formula:**
1.  **Brands:** Match the major version (e.g., "131").
2.  **Platform:** Match the OS (Windows/macOS).
3.  **Structure:** Must match standard Chrome structure exactly.

### D. Zero Noise Policy
- ❌ **Canvas Noise:** DISABLED.
- ❌ **Audio Noise:** DISABLED.
- ❌ **Font Masking:** DISABLED (Allow system fonts).
- ❌ **WebGL Spoofing:** MINIMAL (Only if "Winning Config" differs from real GPU).

## 3. Configuration Checklist

If Google Login fails:
1.  **Check `AutomationControlled` Flag:** Is it present? (Stealth plugins might strip it if misconfigured).
2.  **Check `cdc_` variables:** Are they deleted?
3.  **Check `userAgentData`:** Does `navigator.userAgentData.platform` match the host OS?

## 4. Mac Compatibility
*Added in v2.1.1*
- Standard paths for macOS added to `BrowserManager.js`.
- Logic respects `process.platform` to verify executable existence.
