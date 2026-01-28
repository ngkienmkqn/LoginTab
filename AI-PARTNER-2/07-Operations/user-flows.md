# User Flows & Operational Logic

This document outlines the standard user flows for different roles within the application, reflecting the **v2.5.2** modular architecture and **RBAC v2** implementation.

## 1. User Roles & Permissions

The application distinguishes between two primary roles: **Super Admin** and **Staff**.

### Super Admin
*   **Access Level**: Full System Access.
*   **Capabilities**:
    *   **Profile Management**: Create, Read, Update, Delete (CRUD) all browser profiles.
    *   **User Management**: Create and manage Staff accounts.
    *   **Assignment**: Assign specific browser profiles to Staff users.
    *   **Infrastructure**: Configure database, view stats, manage proxies/extensions globally.
    *   **Automation**: Create and edit automation workflows.
    *   **Security**: Scan QR codes for 2FA, view/copy 2FA secrets.

### Staff
*   **Access Level**: Restricted / Operational Only.
*   **Capabilities**:
    *   **View**: Can ONLY see profiles explicitly assigned to them by an Admin.
    *   **Launch**: Can launch browser profiles to perform tasks.
    *   **Automation**: Can execute assigned workflows (if enabled).
    *   **Restrictions**:
        *   CANNOT create, edit, or delete profiles.
        *   CANNOT see 2FA secrets (tokens are auto-filled or hidden).
        *   CANNOT export cookies or data.
        *   CANNOT access User Management or Database settings.

---

## 2. Core Workflows

### A. Profile Creation (Admin Only)
1.  **Initiation**:
    *   Admin clicks **"New Profile"** on the dashboard.
    *   **System Action**: Opens the `profileModal` and initializes default values.
2.  **Configuration**:
    *   **Platform**: Selects a target platform (e.g., Facebook, Google). Triggers auto-fill of Login URL.
    *   **Fingerprint**:
        *   Admin selects OS (Windows/Mac/Linux).
        *   System automates Fingerprint generation via `Iron Portable` simulation.
        *   **Auto-Gen**: Clicking "Randomize" (or on load) calls `preview-fingerprint` to generate a rigorous, consistent fingerprint (Canvas, WebGL, Audio noise).
    *   **Network**: Selects a Proxy from the pool or enters one manually.
    *   **Auth**: Enters Username/Password.
    *   **2FA**: Can manually enter Secret Key or use **"Scan QR"** to extract secret from an image.
3.  **Persistence**:
    *   Admin clicks **"Save Profile"**.
    *   **Backend**: Encrypts sensitive data (passwords, cookies) and stores the record in the `accounts` table.
    *   **Sync**: Creates a local session folder structure.

### B. Account Assignment (Admin Action)
1.  **Selection**: Admin selects one or more profiles from the list.
2.  **Assignment**:
    *   Clicks **"Add User"** (or Bulk Assign).
    *   Selects a Staff user.
3.  **Outcome**:
    *   Database updates `assignments` table.
    *   Staff user sees these profiles immediately upon their next refresh/login.

### C. Browser Launch (Daily Operation)
1.  **Trigger**: User (Admin or Staff) clicks **"Open"** on a profile.
2.  **Validation**:
    *   System checks if **Iron Portable** (`resources/iron`) is available.
    *   Verifies User Agent matches the stored fingerprint.
3.  **Execution (`BrowserManager`)**:
    *   **Session Restore**: Downloads latest session data/cookies from MySQL (if `SyncManager` enabled) or loads local cache.
    *   **Launch**: Spawns `iron.exe` with:
        *   Specific `--user-data-dir` (sandboxed session).
        *   `--proxy-server` (if configured).
        *   `--load-extension` (if required).
        *   Mocked hardware arguments (if Chameleon Mode active).
4.  **Automation (Optional)**:
    *   If a Workflow is assigned, `AutomationManager` injects the script after page load.
5.  **Termination**:
    *   On close, cookies and `localStorage` are synced back to the Database.
    *   `lastActive` timestamp is updated.

---

## 3. Fingerprint Handling (Iron Strategy)
Unlike legacy Chrome, the system now enforces **Iron Portable** for maximum stealth.

*   **Generation**: Fingerprints are generated *once* at creation and locked. valid fingerprints include consistent `hardwareConcurrency`, `deviceMemory`, and OS-specific `navigator` properties.
*   **Rotation**: To "rotate" a fingerprint, the Admin implies creating a *new* profile. We do not support dynamic fingerprint rotation on existing accounts to prevent security flags (e.g., Tazapay anti-fraud).
