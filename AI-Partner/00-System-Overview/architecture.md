# System Architecture: Login Tab

## 1. High-Level Overview
**Login Tab** is an Electron-based application designed for advanced account management and browser automation. It leverages a hybrid architecture combining a local Node.js environment (Main Process) with a web-based UI (Renderer Process) and a remote/local MySQL database for state persistence.

## 2. Process Model
The application follows the standard Electron multiprocess model:

### 2.1 Main Process (`main.js`)
- **Role**: Entry point, System Orchestrator.
- **Responsibilities**:
  - App Lifecycle Management (Startup, Shutdown, Tray, Updates).
  - Native GUI Management (`BrowserWindow`, `Tray`, `Menu`).
  - **IPC Hub**: Handles all asynchronous requests from the Renderer (Database queries, Browser launch).
  - **Puppeteer Orchestration**: Manages `puppeteer-core` instances via `BrowserManager`.
  - **File System Access**: Local session storage, config reading.

### 2.2 Renderer Process (`src/ui/renderer.js` + `index.html`)
- **Role**: User Interface, Presentation Layer.
- **Responsibilities**:
  - Visualizing Data (Account lists, Workflow editor).
  - User Interaction (Buttons, Forms, Drag-and-drop).
  - **IPC Client**: Sends `ipcRenderer.invoke()` calls to Main.
  - **State Management**: Holds ephemeral UI state (current view, selected rows).
  - **Security**: `nodeIntegration: true`, `contextIsolation: false` (Legacy Electron pattern, allows direct Node access but primarily relies on IPC).

## 3. Data Flow Architecture

```mermaid
graph TD
    UI[Renderer Process (UI)] <-->|IPC (invoke/handle)| Main[Main Process]
    Main <-->|mysql2| DB[(MySQL Database)]
    Main <-->|fs-extra| LocalFS[File System (Sessions/Logs)]
    Main -->|Puppeteer| Chrome[Chrome Browser Instances]
    
    subgraph "Core Data Entities"
    DB
    end
    
    subgraph "External Control"
    Chrome
    end
```

## 4. Key Subsystems

### 4.1 Browser Automation (The "Engine")
- **Core Library**: `puppeteer-core` + `puppeteer-extra`.
- **Stealth**: `puppeteer-extra-plugin-stealth` + Custom `PuppeteerEvasion.js`.
- **Profile Isolation**: Each "Account" has a unique `userDataDir`.
- **Evasion**: WebGL, Canvas, Audio, ClientHints override.

### 4.2 Workflow Engine
- **Editor**: `drawflow` (Visual node editor).
- **Format**: JSON graph stored in MySQL.
- **Execution**: `AutomationManager.js` parses JSON -> Executes Puppeteer actions.

### 4.3 Sync System
- **Sessions**: Chrome User Data is zipped and stored in MySQL (`session_backups` table) for cross-device portability.
- **Logic**: `SyncManager.js` handles Upload/Download logic based on file hash/timestamp.

## 5. Directory Structure Map
- `root`
  - `main.js`: Main Entry.
  - `src/`
    - `ui/`: HTML, CSS, Renderer JS.
    - `managers/`: Business logic (`BrowserManager`, `AutomationManager`, `SyncManager`).
    - `database/`: DB connection code (`mysql.js`).
    - `utils/`: Helpers (`FingerprintGenerator`, `PuppeteerEvasion`).
  - `sessions/`: (GitIgnored) Local browser profile storage.
  - `.github/`: CI/CD Workflows.
