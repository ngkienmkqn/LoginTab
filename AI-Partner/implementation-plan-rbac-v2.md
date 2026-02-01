# Implementation Plan: RBAC v2 + Input Bug Fix (REVISION 2)

**Status**: 🟡 Awaiting Approval  
**Created**: 2026-01-18  
**Revised**: 2026-01-18 (Critical feedback addressed)  
**Complexity**: High (Database Schema Changes + UI Overhaul + Security Hardening)

---

## ⚠️ Critical Architectural Decisions (MUST APPROVE)

Before proceeding, the following ambiguities have been resolved with explicit decisions:

### Decision 1: User-to-Admin Scope Mapping
**Question**: Can 1 user belong to multiple admins?  
**Decision**: **NO - Strict 1:1 Mapping**
- Each Staff/Admin can only have ONE primary managing Admin.
- `users` table gets new column: `managed_by_admin_id` (FK to users.id).
- `admin_user_scopes` table is **removed** (replaced by simpler column).
- **Rationale**: Prevents ownership conflicts, simpler UI, clearer responsibility chain.

### Decision 2: "Admin tự thêm user"
**Question**: Does "Admin adds user to system" mean create-only or claim-existing?  
**Decision**: **Create-Only + Auto-Assignment**
- When Admin creates a new user → `managed_by_admin_id` = Admin's ID automatically.
- Admin **CANNOT** claim/transfer existing users.
- Only Super Admin can reassign `managed_by_admin_id` (transfer ownership).
- **Rationale**: Prevents scope hijacking, maintains audit trail.

### Decision 3: IPC Security Model
**Question**: Can renderer be trusted to send `adminId`/`userId`?  
**Decision**: **NO - Session-Based Auth**
- Main process maintains `currentAuthUser` after login.
- All IPC handlers use `currentAuthUser` to determine caller identity.
- Renderer **NEVER** sends user IDs for auth context.
- **Rationale**: Prevents privilege escalation via DevTools manipulation.

### Decision 4: Permission Precedence
**Question**: What happens when scope allows but permission denies?  
**Decision**: **Scope Gate First, Then Permission**
```
IF user NOT in caller's scope:
  DENY (regardless of permissions)
ELSE IF permission check fails:
  DENY
ELSE:
  ALLOW
```

### Decision 5: Legacy Mode
**Question**: Support v1 behavior during migration?  
**Decision**: **NO Legacy Toggle**
- Clean migration with rollback script only.
- No dual logic paths.
- **Rationale**: Avoids maintenance nightmare and data inconsistency.

---

## 📋 Table of Contents
1. [Bug Fix: Input Focus Issue](#1-bug-fix-input-focus-issue)
2. [Authorization Model Redesign](#2-authorization-model-redesign)
3. [User Settings: Granular Permissions](#3-user-settings-granular-permissions)
4. [Security Hardening](#4-security-hardening)
5. [Implementation Roadmap](#5-implementation-roadmap)
6. [QA Test Cases](#6-qa-test-cases)

---

## 1. Bug Fix: Input Focus Issue

### 1.1 Problem Statement
**Symptom**: Input fields in the Electron app sometimes do not accept keyboard input. User must switch to another app and return to restore functionality.

### 1.2 Root Cause Analysis

| Potential Cause | Platform | Likelihood | Detection Method |
|:---|:---|:---|:---|
| **Focus Trap (Modal/Overlay)** | All | High | Check for invisible modal with high z-index |
| **Pointer-Events: None** | Web | Medium | Inspect computed styles on input |
| **Electron Window Blur State Stuck** | Electron | High | Check `window.focused` status |
| **Input `disabled` State** | All | Low | Console: `document.activeElement.disabled` |
| **Keyboard Listener Conflict** | All | Medium | Check if global `keydown` preventDefault() |
| **IME Compositor Bug** | Windows | Low | Test with English vs Asian IME |

### 1.3 Improved Debug Checklist

#### A. Lightweight Element Detection (Replaces Heavy Z-Index Scan)
```javascript
// When bug occurs, run in DevTools Console
const centerX = window.innerWidth / 2;
const centerY = window.innerHeight / 2;
const topEl = document.elementFromPoint(centerX, centerY);

console.log('Top element at center:', topEl);
console.log('Is input?', topEl.tagName === 'INPUT');
console.log('Pointer events:', getComputedStyle(topEl).pointerEvents);

// Check known modal containers
const modals = document.querySelectorAll('.modal, [role="dialog"]');
console.log('Open modals:', Array.from(modals).filter(m => m.style.display !== 'none'));
```

#### B. Focus State Inspection
```javascript
console.log('Active Element:', document.activeElement);
console.log('Is body?', document.activeElement === document.body);
console.log('Input exists?', document.querySelector('input.account-name')); // Adjust selector
// Check focus via IPC (remote is disabled)
ipcRenderer.invoke('is-window-focused').then(focused => console.log('Window focused:', focused));
```

#### C. Specific Reproduction Scenarios (CRITICAL)
- [ ] **Scenario 1**: Open "Add Account" modal → Type in name field → Works?
- [ ] **Scenario 2**: Open modal → Alt+Tab to browser → Return → Type → Works?
- [ ] **Scenario 3**: Open 2 modals → Close top one → Type in bottom modal → Works?
- [ ] **Scenario 4**: Open DevTools (F12) → Type in app input → Works?
- [ ] **Scenario 5**: Drag window to second monitor (125% scaling) → Type → Works?
- [ ] **Scenario 6**: Rapid click between 3 inputs → Type → All inputs responsive?

### 1.4 Revised & Safer Fixes

#### ❌ REMOVED: Fix A (Focus Guard) - TOO RISKY
**Reason**: Can cause focus hijacking, break tab navigation, and create loops.

#### ✅ Fix B: Modal Focus Management (Recommended if modals are cause)
```javascript
class ModalManager {
  static stack = []; // Track modal hierarchy
  
  static open(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) throw new Error(`Modal not found: ${modalId}`);
    modal.style.display = 'block';
    
    // Save previous focus & modal state
    this.stack.push({
      modal: modal,
      previousFocus: document.activeElement,
      previousScrollY: window.scrollY
    });
    
    // Focus first input
    const firstInput = modal.querySelector('input, textarea, button');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50); // Delay for render
    }
    
    // Trap focus within modal (save handler for proper removal)
    modal._focusTrapHandler = this._trapFocus.bind(this);
    modal.addEventListener('keydown', modal._focusTrapHandler);
  }
  
  static close(modalId) {
    const modal = document.getElementById(modalId);
    const state = this.stack.pop();
    
    // Graceful error recovery: if stack mismatch, still close modal
    if (!state || state.modal !== modal) {
      console.error('[Modal] Stack mismatch! Forcing close.');
      
      // Force cleanup even on error
      if (modal) {
        modal.style.display = 'none';
        if (modal._focusTrapHandler) {
          modal.removeEventListener('keydown', modal._focusTrapHandler);
          delete modal._focusTrapHandler;
        }
      }
      return; // Exit early, don't try to restore focus
    }
    
    modal.style.display = 'none';
    if (modal._focusTrapHandler) {
      modal.removeEventListener('keydown', modal._focusTrapHandler);
      delete modal._focusTrapHandler;
    }
    
    // Restore focus ONLY if target still exists and is visible
    if (state.previousFocus && 
        document.contains(state.previousFocus) && 
        !state.previousFocus.disabled &&
        getComputedStyle(state.previousFocus).display !== 'none') {
      setTimeout(() => state.previousFocus.focus(), 50);
    }
  }
  
  static _trapFocus(e) {
    // Handle Escape key to close top-most modal
    if (e.key === 'Escape') {
      e.preventDefault();
      const modal = e.currentTarget;
      ModalManager.close(modal.id);
      return;
    }
    
    if (e.key !== 'Tab') return;
    
    const modal = e.currentTarget;
    const focusable = Array.from(modal.querySelectorAll(
      'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    
    if (focusable.length === 0) return;
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
}

// Usage: Replace existing modal open/close
// OLD: showModal('add-account-modal');
// NEW: ModalManager.open('add-account-modal');
```

#### ✅ Fix C: Electron Window Focus Recovery (Critical for Alt+Tab bug)
```javascript
// main.js
const { ipcMain, BrowserWindow } = require('electron');

let windowFocusState = true;

mainWindow.on('blur', () => {
  windowFocusState = false;
  mainWindow.webContents.send('window-focus-change', false);
});

mainWindow.on('focus', () => {
  windowFocusState = true;
  mainWindow.webContents.send('window-focus-change', true);
});

// renderer.js
const { ipcRenderer } = require('electron');
let lastActiveInput = null;

// Track last focused input
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input, textarea')) {
    lastActiveInput = e.target;
  }
});

// Restore focus ONLY when window regains focus AND input was stuck
ipcRenderer.on('window-focus-change', (event, isFocused) => {
  if (isFocused && lastActiveInput) {
    // Check if input is "stuck" (exists, visible, not disabled, but not focused)
    const isInputStuck = 
      document.contains(lastActiveInput) &&
      getComputedStyle(lastActiveInput).display !== 'none' &&
      !lastActiveInput.disabled &&
      document.activeElement === document.body;
    
    if (isInputStuck) {
      console.log('[Focus Recovery] Restoring focus to:', lastActiveInput.id || lastActiveInput.name);
      setTimeout(() => lastActiveInput.focus(), 100);
    }
  }
});
```

#### ✅ Fix D: Diagnostic Mode (Dev-Only, for investigation)
```javascript
// Enable in dev builds to log focus changes
if (process.env.NODE_ENV === 'development') {
  let focusLog = [];
  
  document.addEventListener('focus', (e) => {
    focusLog.push({ time: Date.now(), event: 'focus', target: e.target.tagName + '#' + e.target.id });
    if (focusLog.length > 50) focusLog.shift();
  }, true);
  
  document.addEventListener('blur', (e) => {
    focusLog.push({ time: Date.now(), event: 'blur', target: e.target.tagName + '#' + e.target.id });
    if (focusLog.length > 50) focusLog.shift();
  }, true);
  
  // Expose to console
  window.dumpFocusLog = () => console.table(focusLog);
}
```

### 1.5 Testing Plan
1. **Reproduce Systematically**: Use all 6 scenarios from 1.3.C.
2. **Apply Fix B + C**: Priority on modal manager + window focus recovery.
3. **Regression Test**: Ensure Esc key, Tab navigation, and accessibility still work.
4. **Monitor Logs**: Use diagnostic mode to catch edge cases.

---

## 2. Authorization Model Redesign

### 2.1 Current vs Proposed Model

#### Current (v1)
```
Super Admin → All Users/Accounts
Admin → All Users/Accounts (same as Super Admin)
Staff → Assigned Accounts Only
```

#### Proposed (v2)
```
Super Admin → All Users/Accounts + Can assign Admin scopes
Admin → Only users in their "scope" (assigned by Super Admin OR self-created)
Staff → Assigned Accounts Only (no change)
```

### 2.2 Database Schema Changes

#### Modified Table: `users` (Add Ownership Column)
```sql
ALTER TABLE users 
ADD COLUMN managed_by_admin_id VARCHAR(36) DEFAULT NULL,
ADD FOREIGN KEY (managed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_managed_by ON users(managed_by_admin_id);
```

**Purpose**: Establishes 1:1 ownership. Each user has at most ONE managing admin.

#### New Table: `user_permissions`
```sql
CREATE TABLE user_permissions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_permission (user_id, permission_key)
);
```

**Purpose**: Granular permission overrides per user.

#### Permission Keys Registry
```javascript
const PERMISSIONS = {
  // Account Management
  'accounts.view': 'View Accounts',
  'accounts.create': 'Create Accounts',
  'accounts.edit': 'Edit Accounts',
  'accounts.delete': 'Delete Accounts',
  
  // User Management
  'users.view': 'View Users',
  'users.create': 'Create Users',
  'users.edit': 'Edit Users',
  'users.delete': 'Delete Users',
  
  // Workflow Management
  'workflows.view': 'View Workflows',
  'workflows.create': 'Create Workflows',
  'workflows.edit': 'Edit Workflows',
  'workflows.execute': 'Execute Workflows',
  
  // System
  'system.proxy_check': 'Check Proxy Health',
  'system.database_reset': 'Reset Database',
  'system.devtools_access': 'Access Developer Tools'
};
```

### 2.3 Authorization Logic Flow

#### A. User Creation by Admin (Revised - With Role Constraint)
```javascript
async function createUser(event, newUserData) {
  // Get caller from session (NOT from params)
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  const caller = await getUser(callerId);
  
  if (caller.role !== 'super_admin' && caller.role !== 'admin') {
    throw new Error('Unauthorized: Only Super Admin/Admin can create users');
  }
  
  // Sanitize: Remove managed_by_admin_id from input (prevent tampering)
  delete newUserData.managed_by_admin_id;
  
  // Enforce: Admin can only create Staff (prevents managed admin/super_admin)
  if (caller.role === 'admin') {
    if (newUserData.role !== 'staff') {
      throw new Error('Admin can only create Staff users');
    }
    newUserData.managed_by_admin_id = callerId;
  }
  // Super Admin creates "unmanaged" users (managed_by = NULL)
  
  const newUser = await db.insert('users', newUserData);
  return newUser;
}
```

#### B. Get Users for Admin (Revised - With Policy)
```javascript
async function getUsers(event) {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  const caller = await getUser(callerId);
  
  if (caller.role === 'super_admin') {
    // Super Admin sees ALL users
    return db.query('SELECT * FROM users');
  }
  
  if (caller.role === 'admin') {
    // Admin sees: managed staff + self
    // Note: This query includes the Admin themselves, but NOT other Admins
    return db.query(
      'SELECT * FROM users WHERE managed_by_admin_id = ? OR id = ?',
      [callerId, callerId]
    );
  }
  
  throw new Error('Staff cannot view users');
}
```

> **UI Note**: Admin user list should only show managed staff + self. Other Admins/Super Admins are excluded from results and should not appear in search/filter.
```

#### C. Super Admin Transfers User (With Restrictions)
```javascript
async function transferUserToAdmin(event, { userId, newAdminId }) {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  const caller = await getUser(callerId);
  if (caller.role !== 'super_admin') {
    throw new Error('Only Super Admin can transfer ownership');
  }
  
  const targetUser = await getUser(userId);
  if (targetUser.role !== 'staff') {
    throw new Error('Only Staff users can be transferred');
  }
  
  // Can transfer to Admin or set to unmanaged (NULL)
  if (newAdminId) {
    const targetAdmin = await getUser(newAdminId);
    if (targetAdmin.role !== 'admin') {
      throw new Error('Target must be an Admin');
    }
  }
  
  // Transfer ownership (NULL = unmanaged)
  await db.query(
    'UPDATE users SET managed_by_admin_id = ? WHERE id = ?',
    [newAdminId || null, userId]
  );
  
  // Audit log: differentiate transfer vs unassign
  if (newAdminId) {
    await auditLog('transfer_ownership', callerId, {
      targetUserId: userId,
      from_admin: targetUser.managed_by_admin_id,
      to_admin: newAdminId
    });
  } else {
    await auditLog('unassign_staff', callerId, {
      targetUserId: userId,
      from_admin: targetUser.managed_by_admin_id
    });
  }
}
```

### 2.4 Permission & Scope Precedence Rules

#### Rule 1: Scope Gate (FIRST)
```
IF action involves target user/account:
  IF target is caller (self-operation):
    RETURN true  // Self always in scope
  IF target NOT in caller's scope (based on role + managed_by):
    RETURN false  // Deny immediately, permissions irrelevant
```

#### Rule 2: Permission Check (SECOND)
```
IF scope allows:
  IF user has permission override for this key:
    RETURN override value
  ELSE:
    RETURN role default value
```

**Note**: `action` parameter == `permission_key` (e.g., `users.edit`, `accounts.delete`).

#### Combined Authorization Check
```javascript
async function authorize(callerId, action, targetId) {
  const caller = await getUser(callerId);
  
  // Step 1: Scope Gate
  if (targetId) {
    const target = await getUser(targetId);
    const hasScope = await checkScope(caller, target);
    if (!hasScope) {
      console.log('[Auth] Denied: Target out of scope');
      return false;
    }
  }
  
  // Step 2: Permission Check
  const hasPermission = await checkPermission(caller.id, action);
  if (!hasPermission) {
    console.log('[Auth] Denied: Missing permission');
    return false;
  }
  
  return true;
}

async function checkScope(caller, target) {
  if (caller.role === 'super_admin') return true;
  if (caller.role === 'admin') {
    // Admin can access: managed staff + self
    if (target.id === caller.id) return true;
    return target.managed_by_admin_id === caller.id;
  }
  return false; // Staff cannot manage users
}
```

#### Scope Policy Summary
| User Type | Who Can See Them? | Who Can Manage? |
|:---|:---|:---|
| **Super Admin** | Everyone | Self only |
| **Admin** | Super Admin + Self | Super Admin + Self |
| **Staff (managed)** | Super Admin + Managing Admin | Super Admin + Managing Admin |
| **Staff (unmanaged, NULL)** | Super Admin only | Super Admin only |

**Transfer Restrictions**:
- Only `role = staff` can have `managed_by_admin_id` changed.
- Admins/Super Admins are always "unmanaged" (NULL).
- Setting `managed_by_admin_id = NULL` creates "unmanaged staff" (orphaned).

**UI Guidelines**:
- In Super Admin's user list, display unmanaged staff with a badge/label: `"Unassigned"` or `"No Admin"`.
- Provide filter: "Show Unmanaged Only" to quickly identify orphaned users.

### 2.5 Permission Override System

#### Default Permissions by Role
```javascript
const ROLE_DEFAULTS = {
  super_admin: {
    'accounts.*': true,
    'users.*': true,
    'workflows.*': true,
    'system.*': true
  },
  admin: {
    'accounts.view': true,
    'accounts.create': true,
    'accounts.edit': true,
    'users.view': true,
    'users.create': true,
    'users.edit': true,
    'workflows.*': true,
    'system.proxy_check': false,
    'system.database_reset': false,
    'system.devtools_access': false
  },
  staff: {
    'accounts.view': true,
    'workflows.execute': true,
    // All others: false
  }
};
```

#### Permission Check (with Override)
```javascript
async function checkPermission(userId, permissionKey) {
  const user = await getUser(userId);
  
  // 1. Check user-specific override
  const override = await db.queryOne(`
    SELECT enabled FROM user_permissions
    WHERE user_id = ? AND permission_key = ?
  `, [userId, permissionKey]);
  
  if (override !== null) {
    return override.enabled; // Override takes precedence
  }
  
  // 2. Fall back to role default
  const roleDefaults = ROLE_DEFAULTS[user.role];
  
  // Support wildcard (e.g., 'accounts.*' matches 'accounts.view')
  for (const [pattern, value] of Object.entries(roleDefaults)) {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (permissionKey.startsWith(prefix)) return value;
    }
    if (pattern === permissionKey) return value;
  }
  
  return false; // Default deny
}
```

---

## 3. User Settings: Granular Permissions

### 3.1 UI Design

#### Location
Add a new tab "Permissions" in the User Details modal (when editing a user).

#### Layout
```
╔════════════════════════════════════════╗
║  Edit User: john_admin                 ║
╠════════════════════════════════════════╣
║  [General] [Permissions] [Assignments] ║
╠════════════════════════════════════════╣
║                                        ║
║  Account Management                    ║
║  ☑ View Accounts                       ║
║  ☑ Create Accounts                     ║
║  ☑ Edit Accounts                       ║
║  ☐ Delete Accounts                     ║
║                                        ║
║  User Management                       ║
║  ☑ View Users                          ║
║  ☑ Create Users                        ║
║  ☐ Edit Users                          ║
║  ☐ Delete Users                        ║
║                                        ║
║  [Reset to Role Defaults] [Save]       ║
╚════════════════════════════════════════╝
```

### 3.2 Implementation

#### HTML Template
```html
<div id="permissions-tab" class="tab-content" style="display: none;">
  <h3>Custom Permissions</h3>
  <p class="hint">Check to grant, uncheck to deny. Grayed = Role Default.</p>
  
  <div class="permission-group">
    <h4>Account Management</h4>
    <label>
      <input type="checkbox" name="perm" value="accounts.view" />
      View Accounts
    </label>
    <label>
      <input type="checkbox" name="perm" value="accounts.create" />
      Create Accounts
    </label>
    <!-- ... -->
  </div>
  
  <button onclick="resetPermissions()">Reset to Role Defaults</button>
  <button onclick="savePermissions()">Save Changes</button>
</div>
```

#### JavaScript Logic (FIXED - Override on Change)
```javascript
let initialPermissionState = {}; // Track original state

async function loadUserPermissions(userId) {
  const user = await ipcRenderer.invoke('get-user', userId);
  const permissions = await ipcRenderer.invoke('get-user-permissions', userId);
  
  initialPermissionState = {}; // Reset tracking
  
  // Populate checkboxes
  document.querySelectorAll('input[name="perm"]').forEach(checkbox => {
    const key = checkbox.value;
    const override = permissions.find(p => p.permission_key === key);
    
    if (override) {
      checkbox.checked = override.enabled;
      checkbox.dataset.isOverride = 'true';
      checkbox.classList.add('override'); // Visual indicator (italic/bold)
      initialPermissionState[key] = override.enabled;
    } else {
      // Show role default (grayed out style)
      const defaultValue = hasDefaultPermission(user.role, key);
      checkbox.checked = defaultValue;
      checkbox.dataset.isOverride = 'false';
      checkbox.classList.remove('override');
      initialPermissionState[key] = defaultValue;
    }
    
    // Listen for changes
    checkbox.addEventListener('change', () => {
      // Mark as override when user changes it
      if (checkbox.checked !== initialPermissionState[key]) {
        checkbox.dataset.isOverride = 'true';
        checkbox.classList.add('override');
      } else {
        // If user reverts to initial state, remove override
        checkbox.dataset.isOverride = 'false';
        checkbox.classList.remove('override');
      }
    });
  });
}

async function savePermissions() {
  const userId = currentEditingUserId;
  const permissions = [];
  
  document.querySelectorAll('input[name="perm"]').forEach(checkbox => {
    // Save ALL permissions marked as override
    if (checkbox.dataset.isOverride === 'true') {
      permissions.push({
        permission_key: checkbox.value,
        enabled: checkbox.checked
      });
    }
  });
  
  await ipcRenderer.invoke('update-user-permissions', userId, permissions);
  showNotification('Permissions updated successfully!');
}

async function resetPermissions() {
  const userId = currentEditingUserId;
  
  // Clear ALL permission overrides from DB
  await ipcRenderer.invoke('clear-user-permissions', userId);
  
  // Reload UI to show role defaults
  await loadUserPermissions(userId);
  showNotification('Permissions reset to role defaults');
}
```

---

## 4. Security Hardening

### 4.1 Session-Based Authentication (CRITICAL)

#### Problem
In Electron apps with `nodeIntegration: true`, the renderer process can be inspected and manipulated via DevTools. If IPC handlers trust user IDs sent from renderer, an attacker can:
1. Open DevTools (F12).
2. Execute: `require('electron').ipcRenderer.invoke('delete-user', 'admin-id')`.
3. Impersonate super_admin by sending fake `callerId`.

#### Solution: Auth Session in Main Process
```javascript
// main.js (Global State)
global.currentAuthUser = null; // Set on login, cleared on logout

// Login Handler
ipcMain.handle('auth-login', async (event, { username, password }) => {
  const user = await authenticateUser(username, password);
  if (user) {
    global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
    return { success: true, user };
  }
  return { success: false };
});

// Logout Handler
ipcMain.handle('auth-logout', async (event) => {
  global.currentAuthUser = null;
  return { success: true };
});

// Protected Handler Example
ipcMain.handle('delete-user', async (event, targetUserId) => {
  // Get caller from session, NOT from params
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  const caller = await getUser(callerId);
  if (caller.role !== 'super_admin') {
    throw new Error('Unauthorized: Only Super Admin can delete users');
  }
  
  // Perform action
  await db.delete('users', targetUserId);
  return { success: true };
});
```

###4.2 IPC Audit Checklist

Before implementation, ALL IPC handlers must be revised to:
- [ ] **NEVER** accept `userId`/`adminId` as caller identity from renderer params.
- [ ] **ALWAYS** read `global.currentAuthUser` to determine caller.
- [ ] **VERIFY** authorization (role + permissions + scope) before executing.
- [ ] **LOG** critical actions (delete user, transfer ownership) to audit trail.

### 4.3 Vulnerable Handlers to Fix

| Handler | Current Vulnerability | Fix |
|:---|:---|:---|
| `create-user` | Accepts `adminId` | Use `global.currentAuthUser.id` |
| `get-user` | No scope check | Add `authorize(callerId, 'users.view', userId)` |
| `edit-user` | Accepts `adminId` | Use session + `authorize(callerId, 'users.edit', userId)` |
| `delete-account` | No auth check | Add scope gate + permission |
| `database:reset` | Weak role check | Strict super_admin only |

### 4.4 Additional Security Measures

#### A. Disable Remote Module (if not needed)
```javascript
// main.js
webPreferences: {
  nodeIntegration: true,
  contextIsolation: false,
  enableRemoteModule: false  // Prevent renderer from accessing main process objects
}
```

#### B. Content Security Policy (CSP)
```html
<!-- In index.html -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline';">
```

> **Note**: `'unsafe-inline'` is temporary during initial implementation. For production hardening, migrate to `nonce` or `hash`-based CSP to eliminate inline script risks.

#### C. Audit Logging
```javascript
// Log critical actions with full context
async function auditLog(action, userId, details) {
  await db.insert('audit_log', {
    action,
    userId,  // Who performed the action
    target_user_id: details.targetUserId || null,  // Who was affected
    details: JSON.stringify(details),
    timestamp: new Date()
  });
  console.log(`[AUDIT] ${action} by ${userId}:`, details);
}

// Usage examples:
await auditLog('transfer_ownership', callerId, {
  targetUserId: staffId,
  from_admin: oldAdminId,
  to_admin: newAdminId
});

await auditLog('update_permissions', callerId, {
  targetUserId: userId,
  permissions_changed: ['users.edit', 'accounts.delete']
});

await auditLog('delete_user', callerId, {
  targetUserId: deletedUserId,
  username: deletedUser.username
});
```

---

## 5. Implementation Roadmap

### Phase 1: Security Hardening (3 hours) **[NEW - PRIORITY]**
- [ ] Implement `global.currentAuthUser` session
- [ ] Audit ALL IPC handlers for trust issues
- [ ] Rewrite vulnerable handlers (create-user, delete-user, etc.)
- [ ] Add audit logging for critical actions

### Phase 2: Database Migration (3 hours)
- [ ] Add `managed_by_admin_id` column to `users`
- [ ] Create `user_permissions` table
- [ ] Write migration script with transaction rollback
- [ ] Test on staging DB

### Phase 3: Backend API (5 hours)
**IPC Handlers to Add/Modify (main.js)**:
- [ ] `get-users` (revised - session-based, scope filtered)
- [ ] `transfer-user-to-admin` (Super Admin only)
- [ ] `get-user-permissions`
- [ ] `update-user-permissions`
- [ ] `check-permission` (returns boolean)
- [ ] Modify `create-user` to set `managed_by_admin_id`

### Phase 4: Frontend UI (4 hours)
- [ ] Modify User List to filter by scope
- [ ] Add "Transfer Ownership" UI (Super Admin only)
- [ ] Add "Permissions" tab in User edit modal
- [ ] Update `applyPermissions()` to use granular perms
- [ ] Replace modal logic with `ModalManager` class (input bug fix)
- [ ] Add "Unassigned" badge for unmanaged staff (NULL) in Super Admin user list

### Phase 5: Input Focus Bug Fix (2 hours)
- [ ] Implement `ModalManager` class
- [ ] Add Electron window focus recovery
- [ ] Add diagnostic mode for dev builds
- [ ] Test all 6 reproduction scenarios

### Phase 6: Testing (3 hours)
- [ ] Unit tests for `checkPermission()` and `checkScope()`
- [ ] Integration tests for session auth
- [ ] Manual QA (all test cases in Section 6)

### Phase 7: Documentation (1 hour)
- [ ] Update AI-Partner docs with new RBAC model
- [ ] Document migration steps for production

**Total Estimate**: 21 hours (dev-hours, best-case)  
**Note**: Timeline is guidance only. Production deployment +50% buffer recommended.

---

## 6. QA Test Cases

### 6.1 Input Bug Test Cases

| ID | Scenario | Expected | Status |
|:---|:---|:---|:---|
| INPUT-01 | Type in Account Name input | Text appears | ⏳ |
| INPUT-02 | Open modal, type in modal input | Text appears | ⏳ |
| INPUT-03 | Switch to browser, return, type | Text appears | ⏳ |
| INPUT-04 | Open 2 modals, close 1, type | Text appears in correct modal | ⏳ |
| INPUT-05 | Press Tab to navigate inputs | Focus moves correctly | ⏳ |

### 6.2 RBAC v2 Test Cases

#### Super Admin
| ID | Action | Expected | Status |
|:---|:---|:---|:---|
| RBAC-01 | View Users list | Sees ALL users | ⏳ |
| RBAC-02 | Create Staff user (unmanaged) | Success, managed_by = NULL | ⏳ |
| RBAC-03 | Transfer Staff to Admin1 | Success, managed_by = Admin1.id | ⏳ |
| RBAC-04 | Unassign Staff (set to unmanaged) | Success, managed_by = NULL | ⏳ |
| RBAC-05 | Try to transfer Admin user | Error (only Staff can be transferred) | ⏳ |

#### Admin (with 2 managed staff)
| ID | Action | Expected | Status |
|:---|:---|:---|:---|
| RBAC-06 | View Users list | Sees 2 staff + self | ⏳ |
| RBAC-07 | Create new Staff | Success, managed_by = Admin.id | ⏳ |
| RBAC-08 | Edit own managed staff | Success | ⏳ |
| RBAC-09 | Try to view unmanaged user | Not visible in list | ⏳ |
| RBAC-10 | Try to transfer ownership | Error (no permission) | ⏳ |

#### Staff
| ID | Action | Expected | Status |
|:---|:---|:---|:---|
| RBAC-11 | Access Users tab | Tab hidden or empty | ⏳ |
| RBAC-12 | View assigned accounts | Success | ⏳ |

### 6.3 Permission Override Test Cases

| ID | Scenario | Expected | Status |
|:---|:---|:---|:---|
| PERM-01 | Admin has default 'accounts.delete' = false | Cannot delete button hidden | ⏳ |
| PERM-02 | Super Admin grants 'accounts.delete' to Admin | Delete button appears | ⏳ |
| PERM-03 | Reset permissions to defaults | Override removed, back to role default | ⏳ |
| PERM-04 | Staff given 'users.view' | Can see Users tab | ⏳ |

---

## 7. API Reference (Session-Based, Revised)

### 7.1 IPC Handlers (main.js)

#### `get-users` (Session-Based)
```javascript
ipcMain.handle('get-users', async (event) => {
  const callerId = global.currentAuthUser?.id;
  // Returns users based on caller's role + scope (see 2.3.B)
});
```

#### `transfer-user-to-admin` (Super Admin Only)
```javascript
ipcMain.handle('transfer-user-to-admin', async (event, { userId, newAdminId }) => {
  const callerId = global.currentAuthUser?.id;
  // Validates caller = super_admin, target = staff, updates managed_by_admin_id
  // newAdminId can be NULL to set as unmanaged
});
```

#### `get-user-permissions`
```javascript
ipcMain.handle('get-user-permissions', async (event, userId) => {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  // Scope gate: prevent accessing permissions of out-of-scope users
  const authorized = await authorize(callerId, 'users.view', userId);
  if (!authorized) throw new Error('Access denied: Cannot view this user');
  
  // Returns array of {permission_key, enabled} overrides for userId
  return db.query(
    'SELECT permission_key, enabled FROM user_permissions WHERE user_id = ?',
    [userId]
  );
});
```

#### `update-user-permissions` (Replaces All Overrides)
```javascript
ipcMain.handle('update-user-permissions', async (event, userId, permissions) => {
  const callerId = global.currentAuthUser?.id;
  // Auth: requires authorize(callerId, 'users.edit', userId)
  // Scope gate: caller must have access to userId
  // Permission check: caller must have 'users.edit'
  
  // Use transaction for atomicity (all-or-nothing)
  await db.transaction(async (trx) => {
    // DELETE all overrides for userId
    await trx.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    
    // INSERT new ones from permissions array
    for (const perm of permissions) {
      await trx.insert('user_permissions', {
        id: uuid(),
        user_id: userId,
        permission_key: perm.permission_key,
        enabled: perm.enabled
      });
    }
  });
  
  // Audit log
  await auditLog('update_permissions', callerId, {
    targetUserId: userId,
    permissions_changed: permissions.map(p => p.permission_key)
  });
});
```

#### `clear-user-permissions` (Reset)
```javascript
ipcMain.handle('clear-user-permissions', async (event, userId) => {
  const callerId = global.currentAuthUser?.id;
  // Auth: same as update-user-permissions (requires 'users.edit' on userId)
  
  // DELETE all overrides for userId (returns to role defaults)
  
  // Audit log
  await auditLog('clear_permissions', callerId, {
    targetUserId: userId
  });
});
```

#### `get-user` (Scope Protected)
```javascript
ipcMain.handle('get-user', async (event, userId) => {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  // Scope gate: prevent Admin from accessing users outside their scope
  const authorized = await authorize(callerId, 'users.view', userId);
  if (!authorized) throw new Error('Access denied: User not in scope');
  
  return db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
});
```

#### `edit-user` (Scope Protected)
```javascript
ipcMain.handle('edit-user', async (event, userId, updates) => {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  // Scope gate + permission check
  const authorized = await authorize(callerId, 'users.edit', userId);
  if (!authorized) throw new Error('Access denied: Cannot edit this user');
  
  const caller = await getUser(callerId);
  
  // Enforce: Only Super Admin can change role
  if ('role' in updates && caller.role !== 'super_admin') {
    throw new Error('Only Super Admin can change user roles');
  }
  
  // Enforce: managed_by_admin_id can only be set for Staff
  if ('managed_by_admin_id' in updates) {
    const targetUser = await getUser(userId);
    if (targetUser.role !== 'staff') {
      throw new Error('Cannot set managed_by_admin_id for Admin/Super Admin');
    }
    // Optional: Only Super Admin can edit managed_by
    if (caller.role !== 'super_admin') {
      throw new Error('Only Super Admin can transfer ownership');
    }
  }
  
  await db.update('users', userId, updates);
  
  // Audit log
  await auditLog('edit_user', callerId, {
    targetUserId: userId,
    fields_updated: Object.keys(updates)
  });
});
```

#### `check-permission` (Runtime Check)
```javascript
ipcMain.handle('check-permission', async (event, permissionKey) => {
  const callerId = global.currentAuthUser?.id;
  if (!callerId) throw new Error('Not authenticated');
  
  // Returns boolean for caller (override > role default)
  // WARNING: This is for UI rendering only (show/hide buttons)
  // For actual action authorization, MUST use authorize(callerId, permissionKey, targetId)
});
```

> **IMPORTANT**: `check-permission` only checks if the caller has the permission abstractly. It does NOT check scope gates. Always use `authorize(callerId, action, targetId)` for real action authorization, which includes both permission AND scope checks.

#### `is-window-focused` (Helper for Debug)
```javascript
ipcMain.handle('is-window-focused', async (event) => {
  return mainWindow.isFocused();
});
```

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|:---|:---|:---|
| **IPC Security Breach** | CRITICAL | Implement session-based auth FIRST (Phase 1) |
| **Database migration fails** | High | Test on backup DB, prepare rollback SQL, use transactions |
| **Performance (filtered queries)** | Medium | Index `managed_by_admin_id` column |
| **Admin resistance to scope limits** | Medium | Clear communication, show benefits (audit trail, clarity) |
| **UI complexity for permissions** | Low | Tooltips, visual indicators (italic = override) |

---

## 9. Approval Checklist

Before proceeding, confirm:
- [ ] **Architectural decisions** (1:1 mapping, create-only, session auth, scope-first, no legacy) are approved
- [ ] Database schema changes are acceptable
- [ ] Security hardening approach (session-based) is approved
- [ ] Permission keys cover all needed actions
- [ ] UI mockups are approved
- [ ] Timeline (21 dev-hours) is acceptable
- [ ] QA test cases are comprehensive

**Next Steps After Approval**:
1. Create feature branch `feature/rbac-v2-secure`
2. **Execute Phase 1 (Security Hardening) FIRST** - Critical
3. Execute Phase 2 (Database Migration)
4. Commit & push for intermediate review
5. Continue phases 3-7
6. Submit for final QA

---

*Document Version: 2.0 (REVISED)*  
*Critical Feedback Addressed*  
*Ready for Approval*
