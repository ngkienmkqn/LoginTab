# RBAC v2 UI Contract (FROZEN)

**Version:** 2.0.0  
**Status:** APPROVED & FROZEN  
**Date:** 2026-01-18  
**Imports:** `ui-contracts/ui-rbac-gating-rules.md`

---

## 1. NAVIGATION RULES

### Sidebar Visibility (id: nav-users)
```javascript
// renderer.js:applyPermissions()
if (role === 'super_admin' || role === 'admin') {
    userTab.style.display = 'flex';  // VISIBLE
} else {
    userTab.style.display = 'none';  // HIDDEN
}
```

**Rule:** Admin + Super Admin see "User Management" tab. Staff NEVER sees it.

### Active View State
```javascript
// renderer.js:navigate('users')
document.getElementById('view-users').style.display = 'block';
```

**Rule:** Clicking nav-users navigates to view-users section.

---

## 2. USER TABLE RULES (view-users)

### Table Structure
```html
<table>
    <thead>
        <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Managed By</th>
            <th style="text-align:right">Actions</th>
        </tr>
    </thead>
    <tbody id="userTableBody"></tbody>
</table>
```

### Data Population
```javascript
// renderer.js:renderUserTable()
users = await ipcRenderer.invoke('get-users');  // Backend scoped
users.forEach(user => {
    // Render row
});
```

**Rule:** Backend returns scoped list. Frontend renders ALL returned users.

### Managed By Column
```javascript
if (user.managed_by_admin_id) {
    const manager = users.find(u => u.id === user.managed_by_admin_id);
    if (manager) {
        tdManaged.textContent = manager.username;  // Show username
    } else {
        tdManaged.innerHTML = '<span style="color:#f59e0b">Unknown Admin</span>';
    }
} else {
    tdManaged.innerHTML = '<span style="color:var(--text-muted); font-style:italic">Unassigned</span>';
}
```

**Rule:** MUST render username or "Unassigned". NEVER show raw ID.

---

## 3. USER MODAL RULES (modalUser)

### Modal Structure
```html
<div id="modalUser" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="userModalTitle">Add New User</h3>
        </div>
        <div>
            <input type="text" id="userUsername">
            <input type="password" id="userPassword">
            <select id="userRole">
                <option value="staff">Staff</option>
                <!-- JS populates for Super Admin -->
            </select>
        </div>
        <div class="modal-footer">
            <button onclick="saveUser()">Save</button>
        </div>
    </div>
</div>
```

**Rule:** HTML MUST only contain `staff` option. JavaScript populates admin/super_admin for Super Admin.

### Role Selection Logic
```javascript
// renderer.js:openAddUserModal()
const roleSelect = document.getElementById('userRole');
if (currentUser.role === 'admin') {
    roleSelect.innerHTML = '<option value="staff">Staff</option>';
    roleSelect.disabled = true;  // Admin CANNOT change
} else {
    // Super Admin can select any role
    roleSelect.innerHTML = `
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
    `;
    roleSelect.disabled = false;
}
```

**Rule:** Admin role dropdown MUST be disabled with only Staff option.

---

## 4. ACTION BUTTON RULES

### Add User Button
```html
<button id="btn-add-user" class="btn" onclick="openAddUserModal()">
    <i class="fa-solid fa-user-plus"></i> Add User
</button>
```

**Visibility:** Shown to Admin + Super Admin (controlled by nav-users parent visibility).

### Edit Button (Per Row)
```javascript
const btnEdit = document.createElement('button');
btnEdit.innerHTML = '<i class="fa-solid fa-edit"></i> Edit';
btnEdit.onclick = () => openEditUserModal(user);
```

**Rule:** Shown for ALL users in scoped list. Backend enforces scope on save.

### Delete Button (Per Row)
```javascript
if (user.id !== currentUser.id && user.role !== 'super_admin') {
    const btnDel = document.createElement('button');
    btnDel.onclick = () => deleteUser(user.id);
}
```

**Rule:** Hidden if target is self OR Super Admin.

---

## 5. ACCOUNTS VIEW RULES (view-profiles)

### Scope Filtering
```javascript
// Backend: get-accounts
if (caller.role === 'admin') {
    const [rows] = await pool.query(`
        SELECT a.* FROM accounts a
        LEFT JOIN account_assignments aa ON a.id = aa.account_id
        WHERE aa.user_id IN (
            SELECT id FROM users WHERE managed_by_admin_id = ? OR id = ?
        )
    `, [callerId, callerId]);
}
```

**Rule:** Admin sees accounts assigned to managed staff + self. Frontend renders all returned.

### Bulk Actions
```html
<div id="bulk-actions">
    <button onclick="openBulkAssignModal('assign')">Assign</button>
    <button onclick="openBulkAssignModal('revoke')">Revoke</button>
</div>
```

**Visibility:** Shown when ≥1 profile selected. No role restriction (backend enforces).

---

## 6. WORKFLOWS VIEW RULES (view-automations)

### Clear All Button
```javascript
// renderer.js:navigate('automations')
if (currentUser.role === 'super_admin') {
    document.getElementById('btnClearWorkflows').style.display = 'block';
} else {
    document.getElementById('btnClearWorkflows').style.display = 'none';
}
```

**Rule:** Only Super Admin sees "Clear All Workflows" button.

### Execute Permission
**Rule:** Staff must have `workflow.execute` permission (currently missing - blocker).

---

## 7. DATABASE VIEW RULES (view-database)

### Tab Visibility
```javascript
// renderer.js:applyPermissions()
if (role === 'super_admin') {
    dbTab.style.display = 'flex';  // VISIBLE
} else {
    dbTab.style.display = 'none';  // HIDDEN
}
```

**Rule:** Only Super Admin sees Database tab.

### Reset Database Button
**Rule:** Shown to Super Admin only. MUST require double confirmation.

---

## 8. PERMISSION GATING RULES

### UI-Only Hints (check-permission)
```javascript
// Future: Permission checkboxes in Edit User modal
const hasPermission = await ipcRenderer.invoke('check-permission', permissionKey);
if (hasPermission) {
    checkbox.checked = true;
}
```

**Rule:** `check-permission` is for UI hints ONLY. No scope check. Actions use `authorize()`.

### Action Enforcement (authorize)
```javascript
// Backend: save-user, delete-user, etc.
const authorized = await authorize(callerId, 'users.delete', targetId);
if (!authorized) throw new Error('Unauthorized');
```

**Rule:** All mutation actions MUST call `authorize()` with scope + permission check.

---

## 9. MODAL MANAGER RULES

### Focus Management
```javascript
// renderer.js:ModalManager
ModalManager.open('modalUser');   // Saves focus
ModalManager.close('modalUser');  // Restores focus
```

**Rule:** All modals MUST use ModalManager for focus trap and restoration.

### Escape Key
**Rule:** Escape key MUST close active modal and restore focus.

---

## 10. SCOPE PROOF REQUIREMENTS

### Visual Indicators
**Rule:** UI MUST NOT show out-of-scope entities. Backend filters, frontend renders all.

### Error Handling
```javascript
try {
    users = await ipcRenderer.invoke('get-users');
} catch (err) {
    if (err.message.includes('Access denied')) {
        alert('You do not have permission to view users');
    }
}
```

**Rule:** Staff attempting to access user management MUST see error from backend.

---

## 11. AMENDMENT PROCESS

### To Change UI Contract
1. Create `UI_CHANGE_PROPOSAL.md`
2. Document affected components
3. Update `ui-contracts/ui-rbac-gating-rules.md` if global impact
4. Get user approval
5. Bump version

### What Requires Amendment
- Changing nav visibility rules
- Modifying role dropdown behavior
- Altering scope filtering logic
- Adding new permission-gated UI

### What Does NOT Require Amendment
- Styling changes (CSS)
- UX improvements (animations, transitions)
- Bug fixes (rendering errors)
- Performance optimizations

---

## 12. TESTING REQUIREMENTS

### Manual Test Checklist
- [ ] Admin sees Users tab
- [ ] Staff does NOT see Users tab (denied at backend)
- [ ] Admin can only create Staff (role dropdown disabled)
- [ ] Managed By shows username or "Unassigned"
- [ ] Modal HTML has only staff option
- [ ] Super Admin sees all roles in dropdown (JS populated)

---

**THIS UI CONTRACT IS FROZEN. IMPORT THIS IN FUTURE SPECS.**
