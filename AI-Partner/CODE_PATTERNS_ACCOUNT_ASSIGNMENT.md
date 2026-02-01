# Code Patterns - Assigned Accounts Modal

## Pattern: RBAC-Protected IPC Handler

### Template
```javascript
ipcMain.handle('handler-name', async (event, requestData) => {
    // 1. Get authenticated user
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        
        // 2. Get caller's role
        const [caller] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (caller.length === 0) throw new Error('User not found');
        
        const callerRole = caller[0].role;

        // 3. RBAC Authorization Check
        if (callerRole === 'staff') {
            // Staff-specific logic or deny
            throw new Error('Access denied: Insufficient permissions');
        }
        
        if (callerRole === 'admin') {
            // Admin scope validation
            // Verify target is within admin's scope
            const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [requestData.userId]);
            if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                throw new Error('Access denied: Out of scope');
            }
        }
        
        // Super Admin has no restrictions
        
        // 4. Execute business logic
        const result = await performOperation(requestData);
        
        // 5. Audit log
        await auditLog('action_name', callerId, { target: requestData.userId });
        
        return result;
    } catch (error) {
        console.error('[handler-name] Error:', error);
        throw error;
    }
});
```

### Example: get-user-assigned-accounts
```javascript
ipcMain.handle('get-user-assigned-accounts', async (event, userId) => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');

    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];

        // RBAC CHECK
        if (caller.role !== 'super_admin') {
            if (caller.role === 'admin') {
                const [target] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
                if (!target[0] || (target[0].managed_by_admin_id !== callerId && target[0].id !== callerId)) {
                    throw new Error('Access denied');
                }
            } else if (userId !== callerId) {
                throw new Error('Access denied');
            }
        }

        // EXECUTE QUERY
        const [accounts] = await pool.query(`
            SELECT a.id, a.name AS profile_name, p.name AS platform_name
            FROM accounts a
            JOIN account_assignments aa ON a.id = aa.account_id
            LEFT JOIN platforms p ON a.platform_id = p.id
            WHERE aa.user_id = ?
            ORDER BY a.name
        `, [userId]);

        return accounts;
    } catch (error) {
        console.error('[get-user-assigned-accounts] Error:', error);
        throw error;
    }
});
```

## Pattern: Modal Display with Aggressive Visibility

### Problem
Modal has correct CSS but parent element has `display: none`, hiding the modal.

### Solution
```javascript
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    
    // Aggressive visibility forcing
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.zIndex = '99999';
}
```

### Critical HTML Structure
```html
<body>
    <!-- Other modals/content -->
    
    <!-- Modal MUST be direct child of body, NOT nested inside other modals! -->
    <div id="modalAssignedAccounts" 
         style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; 
                background:rgba(0,0,0,0.5); justify-content:center; align-items:center; 
                z-index:1000;">
        <div class="modal-content">
            <!-- Modal content -->
        </div>
    </div>
</body>
```

**❌ WRONG - Modal nested inside hidden parent:**
```html
<div id="modalUser" class="modal">  <!-- has display:none in CSS -->
    <div id="modalAssignedAccounts">  <!-- HIDDEN! -->
```

**✅ CORRECT - Modal as sibling:**
```html
<div id="modalUser" class="modal">...</div>
<div id="modalAssignedAccounts">...</div>  <!-- Independent! -->
```

## Pattern: Dynamic HTML Generation with Data Mapping

### Template
```javascript
async function renderList(selector, items, renderCallback, emptyMessage = 'No items') {
    const container = document.getElementById(selector);
    
    if (items.length === 0) {
        container.innerHTML = `<li style="color:var(--text-muted); padding:8px;">${emptyMessage}</li>`;
    } else {
        container.innerHTML = items.map(renderCallback).join('');
    }
}
```

### Example: Render Account List
```javascript
const accounts = await ipcRenderer.invoke('get-user-assigned-accounts', userId);
const list = document.getElementById('assignedAccountsList');

if (accounts.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted);">No accounts assigned</li>';
} else {
    list.innerHTML = accounts.map(acc => `
        <li style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
            <div>
                <i class="fa-solid fa-user"></i> 
                <strong>${acc.profile_name}</strong>
                <span style="color:var(--text-muted); margin-left:8px;">${acc.platform_name}</span>
            </div>
            <button class="btn btn-danger" onclick="unassignAccount('${acc.id}', '${userId}', '${username}')">
                <i class="fa-solid fa-times"></i> Unassign
            </button>
        </li>
    `).join('');
}
```

## Pattern: Async Action with Refresh

### Template
```javascript
async function performActionAndRefresh(actionHandler, refreshHandler, confirmMessage = null) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    
    try {
        const result = await actionHandler();
        
        if (result.success) {
            await refreshHandler();
        } else {
            alert('Action failed: ' + result.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
```

### Example: Unassign Account
```javascript
async function unassignAccount(accountId, userId, username) {
    if (!confirm('Are you sure you want to unassign this account?')) return;

    try {
        const result = await ipcRenderer.invoke('unassign-account', { accountId, userId });
        
        if (result.success) {
            // Refresh the modal to show updated list
            await showAssignedAccounts(userId, username);
        } else {
            alert('Failed to unassign: ' + result.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
```

## Pattern: Conditional UI Rendering Based on Role

### Template
```javascript
function renderConditionalButton(condition, buttonHtml) {
    return condition ? buttonHtml : '';
}
```

### Example: Show Assign Button Only for Admin/Super Admin
```javascript
const canAssign = currentUser.role === 'super_admin' || currentUser.role === 'admin';

const assignButton = canAssign ? `
    <button class="btn btn-primary" onclick="showAssignAccountsDropdown()">
        <i class="fa-solid fa-plus"></i> Assign More Accounts
    </button>
` : '';

document.getElementById('assignAccountsButtonContainer').innerHTML = assignButton;
```

## Pattern: Dropdown Population from Backend

### Template
```javascript
async function populateDropdown(selectId, fetchHandler, renderOption, emptyMessage = 'No options available') {
    try {
        const items = await fetchHandler();
        const select = document.getElementById(selectId);
        
        if (items.length === 0) {
            select.innerHTML = `<option disabled>${emptyMessage}</option>`;
        } else {
            select.innerHTML = items.map(renderOption).join('');
        }
    } catch (err) {
        alert('Error loading options: ' + err.message);
    }
}
```

### Example: Populate Available Accounts
```javascript
async function showAssignAccountsDropdown() {
    try {
        const accounts = await ipcRenderer.invoke('get-available-accounts', currentAssigningUserId);
        const select = document.getElementById('assignAccountsSelect');
        
        if (accounts.length === 0) {
            select.innerHTML = '<option disabled>No accounts available</option>';
        } else {
            select.innerHTML = accounts.map(acc => 
                `<option value="${acc.id}">${acc.profile_name} (${acc.platform_name})</option>`
            ).join('');
        }
        
        document.getElementById('assignAccountsDropdown').style.display = 'block';
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
```

## Pattern: Scoped SQL Queries

### Super Admin - No Restrictions
```sql
-- Get all unassigned accounts
SELECT a.id, a.name AS profile_name, p.name AS platform_name
FROM accounts a
LEFT JOIN platforms p ON a.platform_id = p.id
WHERE a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
ORDER BY a.name;
```

### Admin - Scope Limited to Managed Users
```sql
-- Get accounts assigned to self OR managed staff (not yet assigned to target user)
SELECT DISTINCT a.id, a.name AS profile_name, p.name AS platform_name
FROM accounts a
LEFT JOIN platforms p ON a.platform_id = p.id
JOIN account_assignments aa ON a.id = aa.account_id
LEFT JOIN users u ON aa.user_id = u.id
WHERE (aa.user_id = ? OR u.managed_by_admin_id = ?)
  AND a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
ORDER BY a.name;
```

### Pattern
```javascript
if (callerRole === 'super_admin') {
    query = `<unrestricted query>`;
    params = [targetUserId];
} else if (callerRole === 'admin') {
    query = `<scope-restricted query>`;
    params = [callerId, callerId, targetUserId];
}
```

## Debugging Pattern: Computed Style Diagnosis

### When Modal Doesn't Display
```javascript
function debugModalVisibility(modalId) {
    const modal = document.getElementById(modalId);
    const computed = window.getComputedStyle(modal);
    
    console.log('Modal Debug Info:');
    console.log('  display:', computed.display);
    console.log('  visibility:', computed.visibility);
    console.log('  opacity:', computed.opacity);
    console.log('  position:', computed.position);
    console.log('  zIndex:', computed.zIndex);
    console.log('  width:', computed.width);
    console.log('  height:', computed.height);
    console.log('  parent:', modal.parentElement.tagName);
    console.log('  parent display:', window.getComputedStyle(modal.parentElement).display);
}
```

**Key Check:** If parent display is "none", modal will be hidden regardless of its own styles!
