# Login Tab - Gmail Bypass Edition 🚀

> **STATUS: STABLE**
> **Tested:** Successfully logs into Gmail (Windows N / Standard Windows) as of 2026.

## 🏆 The "Golden" Configuration (Version: Gmail-Success)

This version solves the persistent "This browser or app may not be secure" block by abandoning standard evasion libraries in favor of a **fully manual, consistency-focused approach**.

### 🔑 Key Strategies

#### 1. "Manual Mode" Only (No Stealth Plugin)
We completely removed `puppeteer-extra-plugin-stealth`.
*   **Why?** Public libraries have known "signatures" (specific JS code patterns) that Google's active defenses can recognize.
*   **Solution:** We manually injected our own evasion scripts in `PuppeteerEvasion.js`, making the bot look unique and "cleaner".

#### 2. Identity Consistency (The Anti-Liar Mechanism)
The most common detection vector is data mismatch. This version ensures strict alignment:
*   **User Agent:** Reports Chrome Firmware (e.g., `Chrome/130...`).
*   **Client Hints (`navigator.userAgentData`):** Reports exact same Brand & Version.
*   **Platform:** Reports `Win32` (matching the `Windows` OS in UA).
*   **Hardware:** Mocks valid NVIDIA GPU and realistic Memory/Concurrency ranges.

#### 3. "Zero Noise" Policy
*   **Canvas/Audio Noise:** **DISABLED**.
*   **Why?** Adding random noise (to make fingerprints unique) paradoxically makes the browser look *suspicious* because standard browsers always render identically on the same hardware. We chose "Looking Human" over "Looking Unique".

### 🛠 Technical Implementation Details

*   **Browser:** Standard `chrome.exe` (System installed).
*   **Webdriver Evasion:** Manually deleted via `delete Object.getPrototypeOf(navigator).webdriver` and overwritten with `undefined`.
*   **Runtime Mocks:** `chrome.runtime` is mocked manually to emulate a standard extension environment without triggering bot flags.
*   **Plugin Fix:** Fixed a critical bug where plugins were named `[object Object]`. Now correctly reports "Chrome PDF Viewer", etc.

### 🚀 Usage

```bash
# Install dependencies
npm install

# Run the application
npm start
``` 

### ⚠️ Important Notes
*   **Do not enable** `stealth` plugin in `BrowserManager.js`.
*   **Do not enable** `fixCanvas` or `fixAudio` in `PuppeteerEvasion.js`.
*   **Windows N Users:** If `mf.dll` errors persist in logs, they are ignored by this configuration (as login succeeds anyway), but installing the Media Feature Pack is still recommended for video playback.
