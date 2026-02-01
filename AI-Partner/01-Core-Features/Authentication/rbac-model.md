# Authentication & RBAC Model

## 1. User Entity
The system revolves around the `users` table in MySQL.

### Schema
```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Stored as plain text (Current Limtation)
    role ENUM('super_admin', 'admin', 'staff') NOT NULL DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Roles & Responsibilities

| Role | Access Level | Key Permissions |
| :--- | :--- | :--- |
| **Super Admin** (`super_admin`) | GOD MODE | • Check Proxy Health<br>• Reset Database<br>• Access **DevTools**<br>• Manage All Users/Accounts<br>• Cannot be deleted |
| **Admin** (`admin`) | Manager | • Create/Edit Staff<br>• Assign Accounts to Staff<br>• Manage Accounts & Workflows |
| **Staff** (`staff`) | Worker | • **READ-ONLY** view of assigned accounts<br>• Execute Workflows<br>• Cannot see Proxy Details (Credentials hidden)<br>• Cannot Edit/Delete data |

## 2. Authentication Flow
1. **Login Request**: Renderer asks Main (`ipcRenderer.invoke('auth-login')`) with creds.
2. **Main Verification**: `main.js` queries `users` table.
   - Special Bootstrap: Hardcoded check for `admin` / `Kien123!!` -> Auto-creates Super Admin if missing.
3. **Session State**: On success, `currentUser` object is stored in Renderer's global scope (`window.currentUser`).
4. **UI Adaptation**: `applyPermissions()` in `renderer.js` checks `currentUser.role` and hides/shows DOM elements (buttons, sidebars).

## 3. Account Assignment (Rbac Logic)
- **Table**: `account_assignments` (Junction Table: `user_id`, `account_id`).
- **Logic**:
  - `super_admin` / `admin`: Can see all accounts (query logic).
  - `staff`: Scope is restricted via SQL `JOIN` to `account_assignments`.

## 4. Security Implementation Details
- **DevTools**: Explicitly toggled via IPC `toggle-devtools`. Only `'super_admin'` sends `visible: true`.
- **Database Access**: Renderer never queries DB directly; strict API surface via IPC.
