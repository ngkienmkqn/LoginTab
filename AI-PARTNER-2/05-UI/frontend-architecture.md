# 05-UI: Modular Frontend Architecture

## Overview
As of v2.5.2 (Jan 2026), the UI has been refactored from a monolithic `renderer.js` to a modular architecture. This directory documents the new structure.

### Source Location
- **Root**: `src/ui/`
- **Entry Point**: `src/ui/index.html` (Skeleton)
- **Bootstrapper**: `src/ui/js/app.js`

## 1. Directory Structure

```
src/ui/
├── css/
│   ├── main.css              # Variables, Reset, Layout
│   ├── components.css        # Interactive elements (Buttons, Inputs)
│   └── modules/              # Feature-specific styles
│       ├── profiles.css
│       ├── automations.css   # Drawflow editor styling
│       └── ...
├── js/
│   ├── app.js               # Application Entry & Loader
│   ├── user_management.js   # Admin Panel Logic (RBAC)
│   ├── modules/             # Business Logic Modules
│   │   ├── auth.js          # Login/Logout & Permissions
│   │   ├── profiles.js      # Account CRUD & Table Rendering
│   │   ├── proxies.js       # Proxy Pool Management
│   │   ├── extensions.js    # Extension Library
│   │   ├── platforms.js     # Platform Presets
│   │   └── automations.js   # Workflow Editor (Drawflow)
│   └── utils/
│       └── ui.js            # Shared Helpers (Modals, Tabs, Notifications)
└── index.html               # Semantic HTML Skeleton
```

## 2. Module Implementations

### Core: `app.js`
**Path**: `src/ui/js/app.js`
- **Responsibility**: Boots the application.
- **Key Function**: `loadAllData()` - Orchestrates asynchronous data loading from all modules.
- **Global Aliasing**: Maps specific module functions (e.g., `profilesModule.saveProfile`) to `window` so that HTML `onclick` handlers continue to function.

### Authentication: `auth.js`
**Path**: `src/ui/js/modules/auth.js`
- **State**: `currentUser`
- **Logic**: Handles login via `ipcRenderer.invoke('auth-login')`.
- **RBAC**: `applyPermissions()` hides/shows UI elements based on User Role (Super Admin vs Staff).

### Profiles: `profiles.js`
**Path**: `src/ui/js/modules/profiles.js`
- **Responsibility**: The heart of the app. Displays the main "Browser Profiles" table.
- **Features**:
    - **Rendering**: Generates table rows with Status, Proxy Health, and 2FA codes.
    - **CRUD**: Create/Edit/Delete accounts via IPC.
    - **Launch**: Triggers `ipcRenderer.invoke('launch-browser')`.
    - **Bulk Actions**: Select all/Assign/Revoke.

### Automations: `automations.js`
**Path**: `src/ui/js/modules/automations.js`
- **Library**: `Drawflow` (Visual Node Editor).
- **Logic**:
    - `initDynamicNodes()`: Fetches available nodes from Backend.
    - `saveWorkflow()`: Serializes graph to JSON for storage.
- **Integration**: Linked to Profiles via `workflow_id`.

## 3. Code Style & Rules
1.  **No Inline CSS**: All styles must be in `src/ui/css/`.
2.  **No Inline JS Logic**: HTML should only call global window functions (e.g., `onclick="saveProfile()"`).
3.  **Module Pattern**: Use `window.moduleName = { ... }` to export APIs.
4.  **IPC Only**: Never import node modules directly in UI components if possible; use `ipcRenderer`.

## 4. Developing New UI Features
1.  **Create Module**: `src/ui/js/modules/newfeature.js`.
2.  **Register in App**: `require` it in `src/ui/js/app.js`.
3.  **Add Styles**: `src/ui/css/modules/newfeature.css`.
4.  **Update HTML**: Add specific container in `src/ui/index.html`.
