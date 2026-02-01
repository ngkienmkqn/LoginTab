# RBAC v2 Acceptance Tests

**Version:** 2.0.0  
**Type:** Manual Testing  
**Last Updated:** 2026-01-18

---

## TEST 1: Admin User Tab Visibility

**Objective:** Verify Admin can see Users tab

**Prerequisites:**
- User: `thuyduong` (role: admin)

**Steps:**
1. Login as `thuyduong`
2. Check sidebar for "User Management" tab

**Expected Result:**
```
✅ "User Management" tab VISIBLE in sidebar
✅ Tab has icon: user-shield
```

**Actual Result:** ✅ PASS

---

## TEST 2: Staff User Tab Denial

**Objective:** Verify Staff cannot access user management

**Prerequisites:**
- User: `alice` (role: staff, managed_by: thuyduong)

**Steps:**
1. Login as `alice`
2. Check sidebar for "User Management" tab
3. Attempt direct backend call: `ipcRenderer.invoke('get-users')`

**Expected Result:**
```
✅ "User Management" tab NOT VISIBLE in sidebar
✅ Backend call throws: "Access denied: Staff users cannot view user list"
```

**Actual Result:** ✅ PASS

---

## TEST 3: Admin Creates Staff (Auto-Assignment)

**Objective:** Verify Admin can create Staff with auto-assignment

**Prerequisites:**
- User: `thuyduong` (role: admin, id: d3c0b0d6...)

**Steps:**
1. Login as `thuyduong`
2. Click "User Management" → "Add User"
3. Fill form:
   - Username: `bob`
   - Password: `password123`
   - Role: `staff` (only option, dropdown disabled)
4. Click "Save"
5. Query database:
   ```sql
   SELECT id, username, role, managed_by_admin_id FROM users WHERE username = 'bob';
   ```

**Expected Result:**
```sql
| id       | username | role  | managed_by_admin_id |
|----------|----------|-------|---------------------|
| bob-id   | bob      | staff | d3c0b0d6...         |
```
```
✅ Role dropdown shows only "Staff"
✅ Role dropdown is DISABLED
✅ managed_by_admin_id = thuyduong's ID
✅ New user appears in Admin's user list
```

**Actual Result:** ✅ PASS

---

## TEST 4: Admin Scope Filter

**Objective:** Verify Admin only sees managed staff + self

**Prerequisites:**
- Database state:
  - `admin` (super_admin)
  - `thuyduong` (admin)
  - `alice` (staff, managed_by: thuyduong)
  - `bob` (staff, managed_by: admin)

**Steps:**
1. Login as `thuyduong`
2. Navigate to "User Management"
3. Check user table rows

**Expected Result:**
```
✅ Row 1: thuyduong (admin, Managed By: —)
✅ Row 2: alice (staff, Managed By: thuyduong)
❌ NOT SHOWN: admin (out of scope)
❌ NOT SHOWN: bob (managed by different admin)
```

**Actual Result:** ✅ PASS

---

## TEST 5: Managed By Column Rendering

**Objective:** Verify Managed By column shows username or "Unassigned"

**Prerequisites:**
- Users list with various managed_by_admin_id values

**Steps:**
1. Login as Super Admin
2. Navigate to "User Management"
3. Check "Managed By" column for each user

**Expected Result:**
```
User: admin → Managed By: "Unassigned" (italic, muted)
User: thuyduong → Managed By: "Unassigned" (italic, muted)
User: alice (managed_by: thuyduong) → Managed By: "thuyduong"
```

**Actual Result:** ✅ PASS

---

## TEST 6: Modal HTML Role Options

**Objective:** Verify modal HTML only has staff option

**Prerequisites:**
- None

**Steps:**
1. Open `src/ui/index.html`
2. Find `<select id="userRole">`
3. Check `<option>` tags

**Expected Result:**
```html
<select id="userRole" class="form-control">
    <option value="staff">Staff</option>
    <!-- NO admin or super_admin options here -->
</select>
```

**Actual Result:** ✅ PASS (line 1710-1711)

---

## TEST 7: Super Admin Role Dropdown (JS Populated)

**Objective:** Verify Super Admin sees all roles via JavaScript

**Prerequisites:**
- User: `admin` (super_admin)

**Steps:**
1. Login as `admin`
2. Click "Add User"
3. Check role dropdown options
4. Check if dropdown is enabled

**Expected Result:**
```
✅ Role dropdown shows: Staff, Admin, Super Admin
✅ Role dropdown is ENABLED
✅ Options populated by JavaScript (not HTML)
```

**Actual Result:** ✅ PASS (user_management.js:88-93)

---

## TEST 8: SQL INSERT Explicit Columns

**Objective:** Verify save-user uses explicit column list

**Prerequisites:**
- None

**Steps:**
1. Open `main.js`
2. Find `save-user` IPC handler
3. Locate INSERT query for CREATE mode

**Expected Result:**
```javascript
await pool.query(
    'INSERT INTO users (id, username, password, role, managed_by_admin_id) VALUES (?, ?, ?, ?, ?)',
    [newId, username, password, role, managedBy]
);
```

**Actual Result:** ✅ PASS (main.js:1054-1057)

---

## TEST 9: Staff Backend Denial

**Objective:** Verify get-users throws error for Staff

**Prerequisites:**
- None

**Steps:**
1. Open `main.js`
2. Find `get-users` IPC handler
3. Check for Staff role check

**Expected Result:**
```javascript
if (caller.role === 'staff') {
    throw new Error('Access denied: Staff users cannot view user list');
}
```

**Actual Result:** ✅ PASS (main.js:994-997)

---

## TEST 10: Renderer No CallerId

**Objective:** Verify renderer does NOT send callerId/adminId/userId

**Prerequisites:**
- None

**Steps:**
1. Open `src/ui/user_management.js`
2. Find `saveUser()` function
3. Check `ipcRenderer.invoke('save-user', userData)` payload

**Expected Result:**
```javascript
const userData = {
    username,
    role
    // ❌ NO callerId
    // ❌ NO adminId
    // ❌ NO managed_by_admin_id
};

const res = await ipcRenderer.invoke('save-user', userData);
```

**Actual Result:** ✅ PASS (user_management.js:145-161)

---

## TEST 11: Admin Cannot Delete Self

**Objective:** Verify delete button hidden for self

**Prerequisites:**
- User: `thuyduong` (admin)

**Steps:**
1. Login as `thuyduong`
2. Navigate to "User Management"
3. Find row for `thuyduong`
4. Check if "Delete" button exists

**Expected Result:**
```
✅ Edit button EXISTS
❌ Delete button HIDDEN (user.id === currentUser.id)
```

**Actual Result:** ✅ PASS (user_management.js:58)

---

## TEST 12: Cannot Delete Super Admin

**Objective:** Verify delete button hidden for Super Admin

**Prerequisites:**
- User: `thuyduong` (admin)
- Target: `admin` (super_admin, out of scope but hypothetical)

**Steps:**
1. Login as Super Admin
2. Navigate to "User Management"
3. Find row for Super Admin user
4. Check if "Delete" button exists

**Expected Result:**
```
✅ Edit button EXISTS
❌ Delete button HIDDEN (user.role === 'super_admin')
```

**Actual Result:** ✅ PASS (user_management.js:58)

---

## TEST 13: Clear All Workflows (Super Admin Only)

**Objective:** Verify Clear All button visibility

**Prerequisites:**
- Users: admin (super_admin), thuyduong (admin)

**Steps:**
1. Login as `admin` → Navigate to Automations
2. Check for "Clear All" button
3. Logout, login as `thuyduong` → Navigate to Automations
4. Check for "Clear All" button

**Expected Result:**
```
Super Admin: ✅ "Clear All Workflows" button VISIBLE
Admin: ❌ "Clear All Workflows" button HIDDEN
```

**Actual Result:** ✅ PASS (renderer.js:317-323)

---

## TEST 14: Database Tab Visibility

**Objective:** Verify Database tab only for Super Admin

**Prerequisites:**
- Users: admin (super_admin), thuyduong (admin)

**Steps:**
1. Login as `admin`
2. Check sidebar for "Database" tab
3. Logout, login as `thuyduong`
4. Check sidebar for "Database" tab

**Expected Result:**
```
Super Admin: ✅ "Database" tab VISIBLE
Admin: ❌ "Database" tab HIDDEN
```

**Actual Result:** ✅ PASS (renderer.js:215-220)

---

## TEST 15: Restart Migration Idempotency

**Objective:** Verify migrations run without errors on restart

**Prerequisites:**
- Database already has RBAC v2 schema

**Steps:**
1. Run `npm start`
2. Wait for app to initialize
3. Check console logs for migration errors
4. Stop app, restart 2 more times

**Expected Result:**
```
[MySQL] user_permissions table ready
[MySQL] audit_log table ready
❌ NO errors: ER_DUP_FIELDNAME, ER_DUP_KEYNAME, ER_FK_DUP_NAME
```

**Actual Result:** ✅ PASS

---

## SUMMARY

| # | Test | Status |
|:---|:---|:---:|
| 1 | Admin User Tab Visibility | ✅ |
| 2 | Staff User Tab Denial | ✅ |
| 3 | Admin Creates Staff (Auto-Assignment) | ✅ |
| 4 | Admin Scope Filter | ✅ |
| 5 | Managed By Column Rendering | ✅ |
| 6 | Modal HTML Role Options | ✅ |
| 7 | Super Admin Role Dropdown | ✅ |
| 8 | SQL INSERT Explicit Columns | ✅ |
| 9 | Staff Backend Denial | ✅ |
| 10 | Renderer No CallerId | ✅ |
| 11 | Admin Cannot Delete Self | ✅ |
| 12 | Cannot Delete Super Admin | ✅ |
| 13 | Clear All Workflows | ✅ |
| 14 | Database Tab Visibility | ✅ |
| 15 | Restart Migration Idempotency | ✅ |

**Pass Rate:** 15/15 (100%)

---

## AUTOMATED TESTS (NOT IMPLEMENTED)

Future v2.1.0+:
- Unit tests for `checkScope()`, `checkPermission()`, `authorize()`
- Integration tests for IPC handlers
- E2E tests for UI workflows

**Current:** All tests are MANUAL.
