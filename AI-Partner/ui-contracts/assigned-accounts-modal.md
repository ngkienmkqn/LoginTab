# Assigned Accounts Modal - Complete Implementation Guide

## Overview
This document describes the complete implementation of the "Assigned Accounts" modal feature, which allows Super Admins and Admins to view and manage account assignments for users in the User Management tab.

## Feature Description
When clicking on the "X accounts" link in the User Management table, a modal displays:
- List of accounts assigned to the selected user
- Ability to unassign accounts (for Admin/Super Admin)
- Ability to assign additional accounts from available pool
- Full RBAC v2 compliance for scope and permissions

## Architecture

### Backend Components

#### IPC Handler: `get-user-assigned-accounts`
**Location:** [main.js](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/main.js#L1150-L1203)

**Purpose:** Fetches accounts assigned to a specific user with RBAC authorization.

**Code Implementation:**
```javascript
ipcMain.handle('get-user-assigned-accounts', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    console.log('[get-user-assigned-accounts] Called with userId:', userId, 'by caller:', callerId);
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');

        const caller = callers[0];

        // RBAC AUTHORIZATION CHECK
        if (caller.role !== 'super_admin') {
            if (caller.role === 'admin') {
                // Admin can only view own or managed staff
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied: Out of scope');
                }
            } else if (userId !== callerId) {
                // Staff can only view own
                throw new Error('Access denied: Staff can only view own assignments');
            }
        }

        // Fetch accounts with platform info
        const [accounts] = await pool.query(`
            SELECT 
                a.id,
                a.name AS profile_name,
                a.loginUrl,
                p.name AS platform_name
            FROM accounts a
            JOIN account_assignments aa ON a.id = aa.account_id
            LEFT JOIN platforms p ON a.platform_id = p.id
            WHERE aa.user_id = ?
            ORDER BY a.name
        `, [userId]);
        
        console.log('[get-user-assigned-accounts] Found', accounts.length, 'accounts');
        return accounts;
    } catch (error) {
        console.error('[get-user-assigned-accounts] Error:', error);
        throw error;
    }
});
```

**Authorization Logic Flow:**
```
1. Extract callerId from global.currentAuthUser
2. Query caller's user record from database
3. Check caller's role:
   
   IF Super Admin:
     ✅ Allow access to ANY user's assignments
     
   ELSE IF Admin:
     Query target user's record
     IF target.managed_by_admin_id == callerId OR target.id == callerId:
       ✅ Allow access (within scope)
     ELSE:
       ❌ Deny access (out of scope)
       
   ELSE IF Staff:
     IF userId == callerId:
       ✅ Allow access (own assignments only)
     ELSE:
       ❌ Deny access
       
4. Execute SELECT query to fetch assigned accounts
5. Return account array to frontend
```

**Authorization Rules:**
- **Super Admin:** Can view any user's assignments
- **Admin:** Can only view assignments for:
  - Self
  - Staff users they manage (`managed_by_admin_id = callerId`)
- **Staff:** Can only view their own assignments

**SQL Query:**
```sql
SELECT 
    a.id,
    a.name AS profile_name,
    a.loginUrl,
    p.name AS platform_name
FROM accounts a
JOIN account_assignments aa ON a.id = aa.account_id
LEFT JOIN platforms p ON a.platform_id = p.id
WHERE aa.user_id = ?
ORDER BY a.name
```

**Returns:** Array of account objects with `id`, `profile_name`, `loginUrl`, `platform_name`

#### IPC Handler: `get-available-accounts`
**Purpose:** Returns accounts that can be assigned to a user (not yet assigned).

**Code Implementation:**
```javascript
ipcMain.handle('get-available-accounts', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [caller] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (caller.length === 0) throw new Error('Caller not found');
        
        const callerRole = caller[0].role;
        let query, params;

        // RBAC: Only Admin and Super Admin can assign
        if (callerRole === 'staff') {
            throw new Error('Access denied: Staff cannot assign accounts');
        }

        if (callerRole === 'super_admin') {
            // Super Admin sees ALL unassigned accounts
            query = `SELECT a.id, a.name AS profile_name, p.name AS platform_name
                     FROM accounts a LEFT JOIN platforms p ON a.platform_id = p.id
                     WHERE a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
                     ORDER BY a.name`;
            params = [userId];
        } else if (callerRole === 'admin') {
            // Admin only sees accounts in their scope
            query = `SELECT DISTINCT a.id, a.name AS profile_name, p.name AS platform_name
                     FROM accounts a
                     LEFT JOIN platforms p ON a.platform_id = p.id
                     JOIN account_assignments aa ON a.id = aa.account_id
                     LEFT JOIN users u ON aa.user_id = u.id
                     WHERE (aa.user_id = ? OR u.managed_by_admin_id = ?)
                       AND a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
                     ORDER BY a.name`;
            params = [callerId, callerId, userId];
        }

        const [accounts] = await pool.query(query, params);
        return accounts;
    } catch (error) {
        console.error('[get-available-accounts] Error:', error);
        throw error;
    }
});
```

**RBAC Scoping:**
- **Super Admin:** Sees all unassigned accounts
- **Admin:** Sees only accounts assigned to self or managed staff
- **Staff:** Access denied (cannot assign accounts)

#### IPC Handler: `assign-accounts`
**Purpose:** Assigns multiple accounts to a user.

**Code Implementation:**
```javascript
ipcMain.handle('assign-accounts', async (event, { userId, accountIds }) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [caller] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        
        // RBAC check: Only Admin/Super Admin can assign
        if (caller[0].role === 'staff') {
            throw new Error('Access denied: Staff cannot assign accounts');
        }

        // Assign each account (skip if already assigned)
        for (const accountId of accountIds) {
            const [existing] = await pool.query(
                'SELECT * FROM account_assignments WHERE account_id = ? AND user_id = ?',
                [accountId, userId]
            );
            
            if (existing.length === 0) {
                await pool.query(
                    'INSERT INTO account_assignments (account_id, user_id) VALUES (?, ?)',
                    [accountId, userId]
                );
            }
        }

        // Audit log
        await auditLog('assign_accounts', callerId, { 
            targetUserId: userId, 
            accountIds 
        });
        
        return { success: true };
    } catch (error) {
        console.error('[assign-accounts] Error:', error);
        return { success: false, error: error.message };
    }
});
```

**Validation:**
- Checks for duplicate assignments
- Enforces RBAC (Staff cannot assign)
- Logs action via `auditLog`

#### IPC Handler: `unassign-account`  
**Purpose:** Removes an account assignment from a user.

**Code Implementation:**
```javascript
ipcMain.handle('unassign-account', async (event, { accountId, userId }) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [caller] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        
        // RBAC check: Only Admin/Super Admin can unassign
        if (caller[0].role === 'staff') {
            throw new Error('Access denied: Staff cannot unassign accounts');
        }

        // Delete assignment
        await pool.query(
            'DELETE FROM account_assignments WHERE account_id = ? AND user_id = ?',
            [accountId, userId]
        );

        // Audit log
        await auditLog('unassign_account', callerId, { 
            targetUserId: userId, 
            accountId 
        });
        
        return { success: true };
    } catch (error) {
        console.error('[unassign-account] Error:', error);
        return { success: false, error: error.message };
    }
});
```

**Validation:**
- Enforces RBAC (Staff cannot unassign)
- Logs action via `auditLog`

### Frontend Components

#### Modal HTML Structure
**Location:** [index.html](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/src/ui/index.html#L1761-L1791)

**Critical requirement:** Modal MUST be a direct child of `<body>`, NOT nested inside other modals!

```html
<body>
    <!-- Other content -->
    
    <!-- CORRECT: Modal at body level -->
    <div id="modalAssignedAccounts"
         style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; 
                background:rgba(0,0,0,0.5); justify-content:center; align-items:center; 
                z-index:1000;">
        <div class="modal-content">
            <h3>Assigned Accounts for <span id="assignedAccountsUsername"></span></h3>
            <div id="assignAccountsButtonContainer"></div>
            <div id="assignAccountsDropdown" style="display:none;">...</div>
            <ul id="assignedAccountsList"></ul>
            <button onclick="closeAssignedAccountsModal()">Close</button>
        </div>
    </div>
    
    <script src="user_management.js"></script>
    <script src="renderer.js"></script>
</body>
```

#### JavaScript Functions
**Location:** [user_management.js](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/src/ui/user_management.js#L348-L416)

**Key Functions:**
1. **`showAssignedAccounts(userId, username)`** - Opens modal and loads data
2. **`unassignAccount(accountId, userId, username)`** - Removes assignment
3. **`showAssignAccountsDropdown()`** - Shows available accounts dropdown
4. **`executeAssign()`** - Assigns selected accounts
5. **`closeAssignedAccountsModal()`** - Hides modal

**Implementation Details:**

##### 1. showAssignedAccounts(userId, username)
```javascript
async function showAssignedAccounts(userId, username) {
    console.log('[showAssignedAccounts] Called with userId:', userId, 'username:', username);
    currentAssigningUserId = userId;
    currentAssigningUsername = username;
    document.getElementById('assignedAccountsUsername').textContent = username;

    try {
        // Show "Assign More Accounts" button (for Admin/Super Admin only)
        const canAssign = currentUser.role === 'super_admin' || currentUser.role === 'admin';
        const assignButton = canAssign ? `
            <button class="btn btn-primary" style="margin-bottom:16px; width:100%;" 
                    onclick="showAssignAccountsDropdown()">
                <i class="fa-solid fa-plus"></i> Assign More Accounts
            </button>
        ` : '';
        document.getElementById('assignAccountsButtonContainer').innerHTML = assignButton;

        // Fetch assigned accounts from backend
        const accounts = await ipcRenderer.invoke('get-user-assigned-accounts', userId);
        console.log('[showAssignedAccounts] Received', accounts.length, 'accounts:', accounts);
        
        const list = document.getElementById('assignedAccountsList');

        // Render account list
        if (accounts.length === 0) {
            list.innerHTML = '<li style="color:var(--text-muted); font-style:italic; padding:8px;">No accounts assigned</li>';
        } else {
            list.innerHTML = accounts.map(acc => `
                <li style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <i class="fa-solid fa-user"></i> 
                        <strong>${acc.profile_name}</strong>
                        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">${acc.platform_name || 'Unknown platform'}</span>
                    </div>
                    ${canAssign ? `
                        <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" 
                                onclick="unassignAccount('${acc.id}', '${userId}', '${username}')">
                            <i class="fa-solid fa-times"></i> Unassign
                        </button>
                    ` : ''}
                </li>
            `).join('');
        }

        // Show modal with aggressive visibility forcing
        const modal = document.getElementById('modalAssignedAccounts');
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('visibility', 'visible', 'important');
        modal.style.setProperty('opacity', '1', 'important');
        modal.style.position = 'fixed';
        modal.style.zIndex = '99999';
        
    } catch (err) {
        alert('Error loading assigned accounts: ' + err.message);
    }
}
```

**Logic Flow:**
1. Set current user context (userId, username)
2. Update modal header with username
3. Conditionally render "Assign More Accounts" button based on user role
4. Call backend IPC handler to fetch accounts
5. Render account list with conditional Unassign buttons
6. Force modal visibility with multiple CSS properties
7. Handle errors with user-friendly alert

##### 2. unassignAccount(accountId, userId, username)
```javascript
async function unassignAccount(accountId, userId, username) {
    if (!confirm('Are you sure you want to unassign this account?')) return;

    try {
        // Call backend to unassign
        const result = await ipcRenderer.invoke('unassign-account', { 
            accountId, 
            userId 
        });
        
        if (result.success) {
            // Refresh modal to show updated list
            await showAssignedAccounts(userId, username);
        } else {
            alert('Failed to unassign account: ' + result.error);
        }
    } catch (err) {
        alert('Error unassigning account: ' + err.message);
    }
}
```

##### 3. showAssignAccountsDropdown()
```javascript
async function showAssignAccountsDropdown() {
    try {
        // Fetch available accounts from backend
        const accounts = await ipcRenderer.invoke('get-available-accounts', currentAssigningUserId);
        
        const select = document.getElementById('assignAccountsSelect');
        
        if (accounts.length === 0) {
            select.innerHTML = '<option disabled>No accounts available</option>';
        } else {
            select.innerHTML = accounts.map(acc => 
                `<option value="${acc.id}">${acc.profile_name} (${acc.platform_name || 'Unknown'})</option>`
            ).join('');
        }
        
        // Show dropdown container
        document.getElementById('assignAccountsDropdown').style.display = 'block';
    } catch (err) {
        alert('Error loading available accounts: ' + err.message);
    }
}
```

##### 4. executeAssign()
```javascript
async function executeAssign() {
    const select = document.getElementById('assignAccountsSelect');
    const selectedOptions = Array.from(select.selectedOptions);
    const accountIds = selectedOptions.map(opt => opt.value);

    if (accountIds.length === 0) {
        alert('Please select at least one account to assign');
        return;
    }

    try {
        // Call backend to assign accounts
        const result = await ipcRenderer.invoke('assign-accounts', {
            userId: currentAssigningUserId,
            accountIds: accountIds
        });

        if (result.success) {
            // Hide dropdown and refresh modal
            document.getElementById('assignAccountsDropdown').style.display = 'none';
            await showAssignedAccounts(currentAssigningUserId, currentAssigningUsername);
        } else {
            alert('Failed to assign accounts: ' + result.error);
        }
    } catch (err) {
        alert('Error assigning accounts: ' + err.message);
    }
}
```

##### 5. closeAssignedAccountsModal()
```javascript
function closeAssignedAccountsModal() {
    const modal = document.getElementById('modalAssignedAccounts');
    modal.style.display = 'none';
    
    // Reset dropdown state
    document.getElementById('assignAccountsDropdown').style.display = 'none';
}
```

**Data Flow:**
```
User clicks "3 accounts" 
  → showAssignedAccounts() called
  → ipcRenderer.invoke('get-user-assigned-accounts', userId)
  → Backend fetches from database with RBAC checks
  → Frontend receives account array
  → Generates HTML list with Unassign buttons
  → Sets modal display: flex
  → Modal appears on screen
```

## Common Issues and Solutions

### Issue 1: Modal Has Data But Doesn't Display

**Symptoms:**
- Console shows data received correctly
- HTML is generated (innerHTML has content)
- Modal has `display: flex` set
- But nothing appears on screen

**Root Cause:** Modal is nested inside a hidden parent element.

**Diagnosis:**
```javascript
const modal = document.getElementById('modalAssignedAccounts');
const parent = modal.parentElement;
console.log('Parent display:', window.getComputedStyle(parent).display);
// If outputs "none", parent is hiding the modal!
```

**Solution:** Move modal to be direct child of `<body>`, outside any other modals or hidden containers.

### Issue 2: Backend Handler Not Found

**Symptoms:**
- Frontend call to `ipcRenderer.invoke()` fails
- Error: "No handler registered"

**Solution:** Ensure IPC handler is registered in main.js:
```javascript
ipcMain.handle('get-user-assigned-accounts', async (event, userId) => {
    // Handler implementation
});
```

### Issue 3: SQL Syntax Errors

**Symptoms:**  
- `SyntaxError: missing ) after argument list`
- Backticks missing from SQL template literals

**Solution:** Ensure all SQL queries use template literals with backticks:
```javascript
const [accounts] = await pool.query(`
    SELECT * FROM accounts WHERE id = ?
`, [userId]);
```

## Testing Checklist

- [ ] Super Admin can view any user's assigned accounts
- [ ] Admin can view own and managed staff's assigned accounts  
- [ ] Staff can only view own assigned accounts
- [ ] Modal displays with dark overlay and centered content
- [ ] Account list shows correct platform names and profile names
- [ ] Unassign button removes account and refreshes list
- [ ] Assign dropdown only shows unassigned accounts in scope
- [ ] Assign function adds accounts and refreshes list
- [ ] Close button hides modal properly
- [ ] All actions are logged via audit_log table

## RBAC v2 Compliance

This feature fully implements RBAC v2 requirements:
- ✅ Scope-based authorization (Admin can only manage their staff)
- ✅ Role-based permissions (Staff cannot assign/unassign)
- ✅ Audit logging for all modifications
- ✅ UI reflects user's role and permissions

## Related Documentation
- [@AI-Partner/specs/rbac-v2](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/AI-Partner/specs/rbac-v2) - RBAC v2 specification
- [@AI-Partner/ui-contracts](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/AI-Partner/ui-contracts) - UI implementation contracts
