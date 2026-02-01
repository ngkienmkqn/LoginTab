# UI RBAC Gating Rules (GLOBAL CONTRACT)

**Version:** 1.0.0  
**Status:** GLOBAL CONTRACT  
**Applies To:** All future UI specs  
**Date:** 2026-01-18

---

## PURPOSE

This document defines IMMUTABLE rules for UI role-based access control gating. All future specs MUST import and comply with these rules.

**To modify these rules:** Create `GLOBAL_UI_CONTRACT_AMENDMENT.md` with justification and get user approval.

---

## RULE 1: Role-Based Navigation Visibility

### Principle
**Navigation items MUST be hidden for unauthorized roles, not just disabled.**

### Implementation Pattern
```javascript
function applyPermissions() {
    const role = currentUser.role;
    
    // For each nav item requiring permission:
    const navItem = document.getElementById('nav-item-id');
    if (authorizedRoles.includes(role)) {
        navItem.style.display = 'flex';  // or 'block'
    } else {
        navItem.style.display = 'none';
    }
}
```

### Enforcement
- ✅ Use `display: none` to hide
- ❌ Do NOT use `disabled` attribute (still visible)
- ❌ Do NOT use CSS `visibility: hidden` (occupies space)

### Example (RBAC v2)
```javascript
// Users tab: Admin + Super Admin only
if (role === 'super_admin' || role === 'admin') {
    userTab.style.display = 'flex';
} else {
    userTab.style.display = 'none';
}
```

---

## RULE 2: Backend Enforcement Required

### Principle
**UI gating is for UX only. Backend MUST enforce authorization.**

### Implementation Pattern
```javascript
// Backend IPC handler
ipcMain.handle('sensitive-action', async () => {
    const callerId = global.currentAuthUser?.id;
    if (!callerId) throw new Error('Not authenticated');
    
    const caller = await getUser(callerId);
    
    // REQUIRED: Backend authorization check
    if (caller.role === 'staff') {
        throw new Error('Access denied: Insufficient permissions');
    }
    
    // ... perform action
});
```

### Enforcement
- ✅ Backend throws error for unauthorized roles
- ❌ Do NOT rely on UI hiding alone
- ❌ Do NOT skip backend checks "because UI hides it"

### Example (RBAC v2)
```javascript
// get-users handler
if (caller.role === 'staff') {
    throw new Error('Access denied: Staff users cannot view user list');
}
```

---

## RULE 3: Scope-First Pattern for Data Access

### Principle
**Data filtering MUST happen at backend via scope checks, not frontend.**

### Implementation Pattern
```javascript
// Backend: Return only scoped data
ipcMain.handle('get-entities', async () => {
    const callerId = global.currentAuthUser?.id;
    const caller = await getUser(callerId);
    
    let query;
    if (caller.role === 'super_admin') {
        query = 'SELECT * FROM entities';  // All
    } else if (caller.role === 'admin') {
        query = 'SELECT * FROM entities WHERE owner_id = ? OR assigned_to = ?';
        params = [callerId, callerId];
    } else {
        query = 'SELECT * FROM entities WHERE assigned_to = ?';
        params = [callerId];
    }
    
    const [rows] = await pool.query(query, params);
    return rows;
});

// Frontend: Render ALL returned entities
entities = await ipcRenderer.invoke('get-entities');
entities.forEach(renderEntity);  // No frontend filtering
```

### Enforcement
- ✅ Backend scopes via SQL WHERE clauses
- ✅ Frontend renders ALL returned data
- ❌ Do NOT filter in frontend (`.filter()`)
- ❌ Do NOT send scope params from renderer

---

## RULE 4: Action Button Visibility

### Principle
**Action buttons MUST be conditionally rendered based on role and target.**

### Implementation Pattern
```javascript
function renderActionButtons(entity) {
    const tdActions = document.createElement('td');
    
    // Edit: Always show for entities in scoped list
    const btnEdit = document.createElement('button');
    btnEdit.onclick = () => editEntity(entity.id);
    tdActions.appendChild(btnEdit);
    
    // Delete: Hide if cannot delete (self, protected, etc.)
    if (canDelete(entity)) {
        const btnDelete = document.createElement('button');
        btnDelete.onclick = () => deleteEntity(entity.id);
        tdActions.appendChild(btnDelete);
    }
    
    return tdActions;
}

function canDelete(entity) {
    // Cannot delete self
    if (entity.id === currentUser.id) return false;
    
    // Cannot delete protected roles
    if (entity.role === 'super_admin') return false;
    
    return true;
}
```

### Enforcement
- ✅ Hide buttons for protected actions
- ✅ Backend still enforces on click
- ❌ Do NOT show disabled buttons (confuses users)

---

## RULE 5: Modal Role Restrictions

### Principle
**Modal form controls MUST be restricted based on caller role.**

### Implementation Pattern
```javascript
function openModal(mode, entity) {
    const roleSelect = document.getElementById('roleSelect');
    
    if (currentUser.role === 'admin') {
        // Admin restricted: Can only select Staff
        roleSelect.innerHTML = '<option value="staff">Staff</option>';
        roleSelect.disabled = true;
    } else if (currentUser.role === 'super_admin') {
        // Super Admin: Can select any role
        roleSelect.innerHTML = `
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
        `;
        roleSelect.disabled = false;
    }
}
```

### Enforcement
- ✅ Disable restricted controls
- ✅ Populate options dynamically via JavaScript
- ❌ Do NOT hardcode all options in HTML
- ❌ Backend MUST validate role constraints

---

## RULE 6: Caller Identity from Session Only

### Principle
**Renderer MUST NEVER send caller identity params. Backend reads from session.**

### Implementation Pattern
```javascript
// ❌ WRONG: Renderer sends callerId
const result = await ipcRenderer.invoke('action', { 
    callerId: currentUser.id,  // FORBIDDEN
    data: {...}
});

// ✅ CORRECT: Backend reads from session
const result = await ipcRenderer.invoke('action', { 
    data: {...}  // Only action data
});

// Backend
ipcMain.handle('action', async (event, payload) => {
    const callerId = global.currentAuthUser?.id;  // ONLY source
    if (!callerId) throw new Error('Not authenticated');
    // ...
});
```

### Enforcement
- ✅ Backend uses `global.currentAuthUser?.id`
- ❌ Renderer NEVER sends `callerId`, `userId`, `adminId`
- ❌ Backend NEVER trusts renderer-provided identity

---

## RULE 7: Permission Check vs Authorization

### Principle
**`check-permission` for UI hints only. `authorize()` for actions.**

### Implementation Pattern
```javascript
// UI-only permission check (no scope)
const canView = await ipcRenderer.invoke('check-permission', 'entities.view');
if (canView) {
    // Show "View" button
}

// Backend UI-only handler
ipcMain.handle('check-permission', async (event, permissionKey) => {
    const callerId = global.currentAuthUser?.id;
    return await checkPermission(callerId, permissionKey);  // No scope
});

// Action authorization (scope + permission)
ipcMain.handle('delete-entity', async (event, entityId) => {
    const callerId = global.currentAuthUser?.id;
    const authorized = await authorize(callerId, 'entities.delete', entityId);
    if (!authorized) throw new Error('Unauthorized');
    // ...
});
```

### Enforcement
- ✅ `check-permission`: UI hints, no scope check
- ✅ `authorize()`: Actions, scope + permission
- ❌ Do NOT use `check-permission` for action enforcement

---

## RULE 8: Error Handling for Unauthorized Access

### Principle
**Backend errors MUST propagate to frontend with user-friendly messages.**

### Implementation Pattern
```javascript
// Frontend
try {
    const result = await ipcRenderer.invoke('sensitive-action');
} catch (err) {
    if (err.message.includes('Access denied')) {
        alert('You do not have permission to perform this action');
    } else if (err.message.includes('Not authenticated')) {
        alert('Please log in to continue');
        // Redirect to login
    } else {
        alert('Error: ' + err.message);
    }
}
```

### Enforcement
- ✅ Catch errors and show user-friendly messages
- ✅ Backend throws descriptive errors
- ❌ Do NOT silently fail
- ❌ Do NOT show technical stack traces to users

---

## RULE 9: Audit Logging for Gated Actions

### Principle
**All permission-gated mutation actions MUST be audit logged.**

### Implementation Pattern
```javascript
ipcMain.handle('delete-entity', async (event, entityId) => {
    const callerId = global.currentAuthUser?.id;
    const authorized = await authorize(callerId, 'entities.delete', entityId);
    if (!authorized) throw new Error('Unauthorized');
    
    // Perform action
    await pool.query('DELETE FROM entities WHERE id = ?', [entityId]);
    
    // REQUIRED: Audit log
    await auditLog('delete_entity', callerId, { 
        targetEntityId: entityId 
    });
    
    return { success: true };
});
```

### Enforcement
- ✅ Log all mutations (create, update, delete)
- ✅ Include caller, target, action, timestamp
- ❌ Do NOT skip audit logging "for performance"

---

## RULE 10: Immutability of Global Contracts

### Principle
**Global UI contracts CANNOT be modified without amendment process.**

### Amendment Process
1. Create `GLOBAL_UI_CONTRACT_AMENDMENT.md`
2. Document:
   - Which rule(s) need to change
   - Rationale for change
   - Impact on existing specs
   - Migration path
3. Get user approval
4. Update contract version
5. Notify all dependent specs

### What Requires Amendment
- Changing any of Rules 1-9
- Adding new global rules
- Relaxing enforcement rules

### What Does NOT Require Amendment
- Documentation clarifications
- Adding examples
- Fixing typos

---

## COMPLIANCE CHECKLIST

**All specs importing this contract MUST:**
- [ ] Hide unauthorized nav items via `display: none`
- [ ] Enforce authorization at backend (throw errors)
- [ ] Use backend scope filtering (SQL WHERE)
- [ ] Conditionally render action buttons
- [ ] Restrict modal controls based on caller role
- [ ] Use `global.currentAuthUser` for caller identity
- [ ] Use `check-permission` for UI hints only
- [ ] Catch and display backend authorization errors
- [ ] Audit log all permission-gated mutations
- [ ] Follow amendment process for changes

---

## IMPORT STATEMENT

**In your spec, add:**

```markdown
**Imports:** `ui-contracts/ui-rbac-gating-rules.md` v1.0.0
```

**Example:**
```markdown
# Feature X Specification

**Version:** 1.0.0  
**Imports:** `ui-contracts/ui-rbac-gating-rules.md` v1.0.0

## UI Rules

This feature complies with global UI RBAC gating rules:
- Navigation visibility: Rule 1 ✅
- Backend enforcement: Rule 2 ✅
- Scope filtering: Rule 3 ✅
...
```

---

**THIS CONTRACT GOVERNS ALL FUTURE UI SPECS. DO NOT BYPASS WITHOUT AMENDMENT.**
