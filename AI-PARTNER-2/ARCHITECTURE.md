# AI-PARTNER-2: System Architecture

## 1. High-Level Overview
**Login Tab** is a modular Electron application for advanced account management and browser automation.
**Architecture Version**: 2.0 (Refactored)

## 2. Process Model

### 2.1 Main Process (`main.js`)
- **Role**: System Orchestrator.
- **Responsibilities**:
  - IPC Hub (The "Server" for the UI).
  - Puppeteer/Browser Management.
  - Database Access (MySQL).
  - File System Operations.
  - **Auth Session**: Managed globally in `main.js` (`global.currentAuthUser`).

### 2.2 Renderer Process (Refactored UI)
- **Role**: Modular Presentation Layer.
- **Structure**:
  - **Single Page App (SPA)** feel, but strictly modular code.
  - **Entry Point**: `src/ui/js/app.js` (Boots the app, loads modules).
  - **Feature Modules**:
    - `auth.js`: Handles Login UI / IPC calls.
    - `profiles.js`: Browser Profile CRUD.
    - `proxies.js`: Proxy Pool management.
    - `automations.js`: Visual Flow Editor logic.
    - `users.js`: Admin User Management (RBAC).

## 3. Data Flow
1. **User Action**: Click "Save Profile".
2. **UI Interception**: `profiles.js` event listener catches click.
3. **Validation**: `profiles.js` validates input (no empty names).
4. **IPC Call**: `ipcRenderer.invoke('save-profile', data)`.
5. **Main Process**: Receives call -> `ProfileManager.js` -> DB Insert.
6. **Response**: Success/Fail returned to UI.
7. **UI Update**: `profiles.js` updates DOM / table row.

## 4. Key Subsystems

### 4.1 Browser Automation ("Stealth Engine")
- **Core**: `puppeteer-core` + `puppeteer-extra`.
- **Evasion**: `PuppeteerEvasion.js`, `FingerprintGenerator.js`.
- **Isolation**: Unique `userDataDir` per profile.

### 4.2 Automation Workflows
- **Editor**: Drawflow (Visual).
- **Execution**: `AutomationManager.js` (Backend).
- **Storage**: JSON graphs in MySQL.

### 4.3 RBAC v2 (Security)
- **Strict Scope**: Admin manages *only* their assigned Staff.
- **Session Auth**: No trusting renderer `userId`.

## 5. Directory Map (New Standard)
```
root
├── main.js                 # Entry
├── src/
│   ├── managers/           # Backend Logic (Main Process)
│   ├── database/           # DB Connection
│   ├── utils/              # Helpers
│   └── ui/                 # Frontend
│       ├── css/            # Modular CSS
│       ├── js/             # Modular JS
│       │   ├── modules/    # Features
│       │   └── app.js      # Bootstrapper
│       └── index.html      # Shell
└── AI-PARTNER-2/           # Documentation
```
