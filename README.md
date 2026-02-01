# Login Tab - Advanced Account Manager 🚀

> **Version:** 3.2.7  
> **Author:** Nguyễn Trung Kiên  
> **Status:** STABLE (Multi-Machine Team Support)

<p align="center">
  <img src="src/ui/assets/icon.png" width="120" alt="Login Tab Icon">
</p>

## ✨ Features

### 🔐 Role-Based Access Control (RBAC v2)
- **Super Admin / Admin / Staff** roles with granular permissions
- Profile lock - only 1 user can use a profile at a time
- **Multi-machine kick** - Admin can kick staff and auto-close their browser

### 🌐 Browser Profile Management
- Create and manage multiple browser profiles
- Session sync across cloud (cookies, localStorage)
- Anti-fingerprint with **Native Hardware Passthrough**
- Proxy support (SOCKS5, HTTP)

### 🤖 Automation Engine v2
- Visual workflow builder with 16+ automation nodes
- Capability-based security (Low/Medium/High/Critical)
- Auto-run workflows on profile launch

### 📊 Team Collaboration
- Real-time profile status (see who's using what)
- Usage history and audit logs
- Profile restriction after kick

---

## 🔥 What's New in v3.2.7

### Multi-Machine Kick Browser Close
When Admin kicks a staff member from a profile, the browser **automatically closes** on the staff's machine - even if they're on a different computer!

```
Admin Kick → Database Updated → Staff Polls DB → Kick Detected → Browser Closes!
```

**Technical Implementation:**
- Database polling every 5 seconds for kick detection
- IPC handler `force-close-local-browser` in main process
- `BrowserManager.closeBrowserByAccountId()` for force close
- Toast notification on kicked user's machine

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- MySQL 8.0+
- Windows 10/11

### Installation

```bash
# Clone repository
git clone https://github.com/ngkienmkqn/LoginTab.git
cd LoginTab

# Install dependencies
npm install

# Run the application
npm start
```

### Build Executable

```bash
# Build installer (.exe)
npm run build:win
```

---

## 🏆 Anti-Detection Strategy

### Native Hardware Passthrough (Level 5)
Instead of mocking GPU/RAM (which leads to mismatches), Login Tab allows **Real Hardware** to pass through:
- ✅ Google/IPHey sees valid, consistent hardware signatures
- ✅ Automatic adaptation when moving to new machine
- ✅ "Trustworthy" status maintained

### Manual Stealth Scripts
Custom evasion replacing `puppeteer-extra-plugin-stealth`:
- **Webdriver:** Hidden (`undefined`)
- **Permissions:** Polyfilled `Notification` to prevent crashes
- **Runtime:** Mocked `chrome.runtime`
- **Plugins:** Standardized mocks for PDF/NaCl

---

## ⚠️ Important Notes

- **Do not open DevTools (F12)** when verifying on IPHey - triggers "Software" detection
- **Windows N Users:** Install Media Feature Pack if `mf.dll` errors occur

---

## 📝 Changelog

### v3.2.7 (2026-02-01)
- ✨ Multi-machine kick - browser auto-closes when kicked
- 🔧 Added `force-close-local-browser` IPC handler
- 🔧 Database polling for kick detection
- 🔧 `closeBrowserByAccountId()` method in BrowserManager

### v3.1.5
- ✨ Real-time profile status polling
- ✨ Usage history with audit logs
- ✨ Profile restriction after kick

### v2.0.1
- ✨ Native Hardware Passthrough strategy
- ✨ Level 5 Manual Stealth evasion
- ✨ Session consistency with cloud sync

---

## 📄 License

MIT License © 2026 Nguyễn Trung Kiên
