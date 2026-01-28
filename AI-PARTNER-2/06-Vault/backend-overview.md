# 06-Vault: Backend Logic & Business Core

## Overview
The "Vault" represents the secure, privileged Node.js environment running in the Electron **Main Process**. This is where sensitive logic (Database connection, Browser Control, File System) resides, completely isolated from direct web access.

### Source Location
- **Root**: `src/` (and root `main.js`)
- **Managers**: `src/managers/`
- **Database**: `src/database/`

## 1. Directory Structure

```
root
├── main.js                  # SYSTEM ORCHESTRATOR (Entry Point)
└── src/
    ├── managers/            # Business Logic Controllers
    │   ├── BrowserManager.js    # Chrome Launch/Stealth orchestration
    │   ├── AutomationManager.js # Worfklow Executor (Puppeteer)
    │   ├── SecurityManager.js   # Encryption & Integrity
    │   ├── SyncManager.js       # Session Cloud Sync
    │   └── ProxyChecker.js      # Network Verification
    ├── database/            # Persistence Layer
    │   ├── mysql.js             # Connection Pool & Queries
    │   └── seed.js              # Initial Data Population
    └── utils/               # Helpers
        └── FingerprintGenerator.js
```

## 2. Key Components

### System Orchestrator: `main.js`
**Path**: `main.js` (Root)
- **Role**: The central nervous system.
- **Responsibilities**:
  - Initializes App Lifecycle (`app.whenReady()`).
  - Manages `BrowserWindow` creation.
  - **IPC Hub**: Receives all `ipcMain.handle()` events from Frontend (e.g., `create-account`, `save-profile`).
  - **Audit Logging**: Records privileged actions.

### Database Core: `src/database/mysql.js`
**Path**: `src/database/mysql.js`
- **Role**: Secure connection to MySQL.
- **Logic**: Uses `mysql2/promise` with a connection pool.
- **Security**: Credentials read from local `.env` (or internal secure storage).

### Browser Manager: `src/managers/BrowserManager.js`
**Path**: `src/managers/BrowserManager.js`
- **Role**: Controls Puppeteer instances.
- **Engine**: Prioritizes **Iron Browser Portable** from `C:\Users\admin\Downloads\IronPortable64 (1)\IronPortable64\Iron\iron.exe`. Falls back to bundled `resources/iron` or system Chrome.
- **Stealth**: Applies anti-fingerprinting patches (WebGL override, AudioContext noise).
- **Isolation**: Ensures each "Profile" uses a distinct `userDataDir`.

### Automation Manager: `src/managers/AutomationManager.js`
**Path**: `src/managers/AutomationManager.js`
- **Role**: Executes workflows created in the UI.
- **Engine**: Translates `drawflow` JSON graphs into sequential Puppeteer commands (Click, Type, Wait).

## 3. Communication Pattern (The Bridge)
The Vault connects to the UI **exclusively** via IPC (Inter-Process Communication).

1.  **Frontend Request**: `ui/js/modules/profiles.js` calls `ipcRenderer.invoke('create-account', data)`.
2.  **Bridge**: Electron passes message to Main Process.
3.  **Vault Execution**: `main.js` receives event, validates inputs, queries `mysql.js`, and returns result.
4.  **Response**: Frontend receives Promise resolution.

## 4. Development Rules
- **Secure by Default**: Never trust input from Renderer. Validate everything in `main.js`.
- **No Leaks**: Secrets (DB passwords, API keys) must NEVER be sent to Renderer.
- **Audit**: All critical actions (Delete, Transfer, Create) must be logged via `auditLog()` in `main.js`.
