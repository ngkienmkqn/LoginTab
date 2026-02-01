# RBAC v2 Test Plan

**Version:** 2.0.0  
**Last Updated:** 2026-01-18  
**Type:** Manual Testing (Automated tests NOT IMPLEMENTED)

---

## Test Scenarios (6 Required)

### Test 1: Login/Logout Session Management

**Objective:** Verify `global.currentAuthUser` is set on login and cleared on logout

**Steps:**
1. Open app, click Login
2. Enter credentials: `admin` / `Kien123!!`
3. Click Submit
4. Open DevTools Console, check `global.currentAuthUser`
5. Click Logout
6. Check `global.currentAuthUser` again

**Expected Result:**
```javascript
// After login
global.currentAuthUser = {
    id: 'd3c0b0d6-975c-493a-b21c-a1de8506162a',
    username: 'admin',
    role: 'super_admin'
}

// After logout
global.currentAuthUser = null
```

**Code Evidence:** `main.js:945` (sets), `main.js:971` (clears)

**Status:** ✅ PASS (verified 2026-01-18)

---

### Test 2: Renderer Spoof Fails

**Objective:** Verify renderer cannot fake caller identity

**Steps:**
1. Login as Admin (username: `thuyduong`)
2. Open DevTools Console (renderer process)
3. Attempt to invoke handler with fake userId:
   ```javascript
   ipcRenderer.invoke('delete-user', 'admin-id')
   ```
4. Check error message

**Expected Result:**
```
Error: Access denied
// Because:
// 1. Backend reads callerId = global.currentAuthUser?.id (Admin's ID)
// 2. Scope check: Admin cannot delete Super Admin
// 3. Renderer param 'admin-id' is IGNORED (not used as callerId)
```

**Code Evidence:** 
```javascript
// main.js:668 - Backend IGNORES renderer param for callerId
const callerId = global.currentAuthUser?.id;  // Always from session
if (!callerId) throw new Error('Not authenticated');

const authorized = await authorize(callerId, 'users.delete', userId);
```

**Status:** ✅ PASS (scope gate blocks)

---

### Test 3: Scope Gate Enforcement

**Objective:** Verify Admin cannot delete Super Admin's managed users

**Prerequisites:**
- Super Admin creates Staff user "alice"
- Admin "thuyduong" creates Staff user "bob"

**Steps:**
1. Login as Admin "thuyduong"
2. Navigate to Users page
3. Attempt to delete Staff user "alice" (managed by Super Admin)
4. Attempt to delete Staff user "bob" (managed by self)

**Expected Result:**
```
DELETE alice → DENIED (out of scope)
DELETE bob   → SUCCESS (in scope)
```

**Code Evidence:**
```javascript
// main.js:82-93 - checkScope function
async function checkScope(caller, target) {
    if (caller.role === 'super_admin') return true;
    if (caller.role === 'admin') {
        if (target.id === caller.id) return true;  // Self
        return target.managed_by_admin_id === caller.id;  // Managed staff only
    }
    return false;
}
```

**Status:** ✅ PASS (verified 2026-01-18)

---

### Test 4: Permission Override Works

**Objective:** Verify `user_permissions` table overrides `roleDefaults`

**Prerequisites:**
- Admin "thuyduong" (default: NO `users.delete` permission)

**Steps:**
1. Login as Super Admin
2. Navigate to Users → thuyduong → Permissions
3. Grant `users.delete` permission
4. Logout, login as "thuyduong"
5. Attempt to delete a managed Staff user

**Expected Result:**
```
BEFORE override: DELETE denied (Missing users.delete permission)
AFTER override:  DELETE success (Override wins)
```

**Code Evidence:**
```javascript
// main.js:49-80 - checkPermission function
async function checkPermission(userId, permissionKey) {
    // Check for override first
    const [overrides] = await pool.query(
        'SELECT enabled FROM user_permissions WHERE user_id = ? AND permission_key = ?',
        [userId, permissionKey]
    );
    if (overrides.length > 0) {
        return overrides[0].enabled === 1;  // Override wins
    }
    
    // Fall back to role defaults
    return (roleDefaults[role] || []).includes(permissionKey);
}
```

**Status:** ⚠️ NOT TESTED (Permission UI not implemented)

---

### Test 5: Restart Migration OK

**Objective:** Verify idempotent migrations produce zero errors on restart

**Steps:**
1. Stop app (`Ctrl+C`)
2. Start app (`npm start`)
3. Check console logs for migration errors
4. Repeat 3 times

**Expected Result:**
```
[MySQL] user_permissions table ready
[MySQL] audit_log table ready
```

**NO errors like:**
- `ER_DUP_FIELDNAME`
- `ER_DUP_KEYNAME`
- `ER_FK_DUP_NAME`

**Code Evidence:** `mysql.js:158-254` (existence checks before ALTER/CREATE)

**Status:** ✅ PASS (verified 2026-01-18)

---

### Test 6: Audit Log Insert OK

**Objective:** Verify audit_log table receives records on actions

**Steps:**
1. Login as Super Admin
2. Delete a Staff user (e.g., "bob")
3. Query database:
   ```sql
   SELECT * FROM audit_log 
   WHERE action = 'delete_user' 
   ORDER BY timestamp DESC LIMIT 1;
   ```
4. Verify record exists with:
   - `user_id` = Super Admin's ID
   - `target_user_id` = "bob"'s ID
   - `action` = 'delete_user'

**Expected Result:**
```sql
+----+--------------+--------------------------------------+--------------------------------------+---------+---------------------+
| id | action       | user_id                              | target_user_id                       | details | timestamp           |
+----+--------------+--------------------------------------+--------------------------------------+---------+---------------------+
|  1 | delete_user  | admin-id                             | bob-id                               | {...}   | 2026-01-18 08:15:23 |
+----+--------------+--------------------------------------+--------------------------------------+---------+---------------------+
```

**Code Evidence:**
```javascript
// main.js:16-34 - auditLog function
async function auditLog(action, userId, details) {
    await pool.execute(
        'INSERT INTO audit_log (action, user_id, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [action, userId, details.targetUserId || null, JSON.stringify(details)]
    );
}

// main.js:678 - Usage
await auditLog('delete_user', callerId, { targetUserId: userId });
```

**Status:** ✅ PASS (verified 2026-01-18)

---

## Additional Security Tests (Recommended)

### Test 7: Create-Only Assignment
**Scenario:** Admin creates Staff → auto-assigned  
**Expected:** `managed_by_admin_id = admin_id`

### Test 8: Input Sanitization
**Scenario:** Renderer sends `managed_by_admin_id` in create request  
**Expected:** Stripped by `delete userData.managed_by_admin_id` (main.js:1028)

### Test 9: Role Change Restriction
**Scenario:** Admin attempts to change user role  
**Expected:** Denied (only Super Admin can change roles)

### Test 10: Unassigned Accounts (delete-account)
**Scenario:** Admin attempts to delete unassigned account  
**Expected:** Denied (scope gate requires JOIN, no unassigned) **FIXED 2026-01-18**

---

## Test Coverage Summary

| Test | Status | Evidence |
|:---|:---:|:---|
| 1. Login/Logout Session | ✅ PASS | main.js:945, 971 |
| 2. Renderer Spoof Fails | ✅ PASS | main.js:668 |
| 3. Scope Gate | ✅ PASS | main.js:82-93 |
| 4. Permission Override | ⚠️ NOT TESTED | UI not impl |
| 5. Restart Migration | ✅ PASS | mysql.js:158-254 |
| 6. Audit Log Insert | ✅ PASS | main.js:678 |
| 7-10. Additional | ❌ NOT RUN | - |

**Pass Rate:** 5/6 core tests (83%)

---

## Automated Testing (Future)

### Unit Tests (NOT IMPLEMENTED)
```javascript
describe('checkScope', () => {
    it('Super Admin sees all', () => {
        const caller = { role: 'super_admin' };
        expect(checkScope(caller, anyTarget)).toBe(true);
    });
    
    it('Admin sees managed staff only', () => {
        const admin = { id: 'admin-1', role: 'admin' };
        const managedStaff = { managed_by_admin_id: 'admin-1' };
        const otherStaff = { managed_by_admin_id: 'admin-2' };
        
        expect(checkScope(admin, managedStaff)).toBe(true);
        expect(checkScope(admin, otherStaff)).toBe(false);
    });
});
```

### Integration Tests (NOT IMPLEMENTED)
- E2E workflow: Create Staff → Delete Staff → Check audit_log
- Session timeout (when implemented)
- Permission UI (when implemented)

---

## For AI Partners

**Before claiming "Tested":**
1. Run all 6 core manual tests
2. Document pass/fail status
3. Attach screenshots or console logs
4. Do NOT use "presumed working" - verify with evidence

**Automated tests are PLANNED but NOT IMPLEMENTED in v2.0.0.**
