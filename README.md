# Login Tab - Advanced Account Manager 🚀

> **Version:** 2.0.1
> **Author:** Nguyễn Trung Kiên
> **Status:** STABLE (IPHey & Gmail Trustworthy)

## 🏆 The "Native Hardware" Configuration (v2.0.1)

This version introduces the **Native Hardware Strategy**, achieving a perfect **5/5 "Trustworthy"** score on IPHey by checking "Masking Detected" errors.

### 🔑 Key Strategies

#### 1. Native Hardware Passthrough
Instead of mocking GPU/RAM (which often leads to mismatches), this version allows the **Real Hardware** (e.g., RTX 3060) to pass through.
*   **Benefit:** Google/IPHey sees valid, consistent hardware signatures.
*   **Portability:** When moving to a new machine, the fingerprint automatically adapts to the new hardware, maintaining "Trustworthy" status because the behavior is consistent with a user upgrading their PC.

#### 2. Manual Stealth (Level 5)
We replaced `puppeteer-extra-plugin-stealth` with a custom **Level 5 Evasion Script**:
*   **Webdriver:** Hidden (`undefined`).
*   **Permissions:** Polyfilled `Notification` to prevent crashes.
*   **Runtime:** Mocked `chrome.runtime` to mimic a standard environment.
*   **Plugins:** Standardized mocks for PDF/NaCl.

#### 3. Session Consistency
*   **Cookies/LocalStorage:** Synced from the cloud database.
*   **Anti-Drift:** Ensures the session remains valid even if the hardware fingerprint changes (Logic: "Same User, New Device").

### 🚀 Usage

```bash
# Install dependencies
npm install

# Run the application
npm start
``` 

### ⚠️ Important Notes
*   **Do not open DevTools (F12)** when verifying on IPHey. It triggers the "Software" detection flag.
*   **Windows N Users:** If `mf.dll` errors persist, install the Media Feature Pack for video playback support (though login works fine without it).
