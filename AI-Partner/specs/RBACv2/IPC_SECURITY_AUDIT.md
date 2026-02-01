# IPC Security Audit - RBAC v2

**Audit Date:** 2026-01-18  
**Version:** 2.0.0  
**Total Handlers:** 41  
**Secured:** 14 (34%)  
**Status:** ⚠️ **NOT PRODUCTION-READY**

---

## Executive Summary

| Metric | Value | Status |
|:---|:---|:---|
| Handlers Secured | 14/41 (34%) | ⚠️ PARTIAL |
| Handlers Unsecured | 27/41 (66%) | ❌ BLOCKER |
| Handlers Not Registered | 3 | 💥 APP CRASHES |
| Session Auth Coverage | 14/41 | ⚠️ 34% |
| Scope Gate Coverage | 10/41 | ⚠️ 24% |
| Permission Check Coverage | 11/41 | ⚠️ 27% |
| Audit Log Coverage | 6/41 | ⚠️ 15% |

**Production Readiness:** ❌ **BLOCKED** (66% unsecured)

---

## SECURED HANDLERS (14)

### 1. Authentication (2 handlers)

#### auth-login
**Line:** 933-948  
**Session:** ✅ SETS `global.currentAuthUser`  
**Scope:** N/A (bootstrap)  
**Permission:** N/A  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:945
global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
return { success: true, user: { id, username, role } };
```

#### auth-logout
**Line:** 969-973  
**Session:** ✅ CLEARS `global.currentAuthUser`  
**Scope:** N/A  
**Permission:** N/A  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:971
global.currentAuthUser = null;
```

---

### 2. User Management (4 handlers)

#### get-users
**Line:** 977-1012  
**Session:** ✅ `global.currentAuthUser?.id`  
**Scope:** ✅ Role-based filtering  
**Permission:** ✅ `users.view` **FIXED 2026-01-18**  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:989-991
const hasPermission = await checkPermission(callerId, 'users.view');
if (!hasPermission) throw new Error('Unauthorized');

// main.js:995-1009 - Scope filtering
if (caller.role === 'admin') {
    const [rows] = await pool.query(
        'SELECT * FROM users WHERE managed_by_admin_id = ? OR id = ?',
        [callerId, callerId]
    );
}
```

#### save-user (create mode)
**Line:** 1021-1038  
**Session:** ✅  
**Scope:** ✅ Auto-assignment  
**Permission:** ✅ Role constraint  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:1028
delete userData.managed_by_admin_id;  // Sanitize

// main.js:1031-1033
if (caller.role === 'admin' && userData.role !== 'staff') {
    throw new Error('Admin can only create Staff users');
}
```

#### save-user (update mode)
**Line:** 1040-1075  
**Session:** ✅  
**Scope:** ✅ `authorize()`  
**Permission:** ✅ `users.edit`  
**Audit:** ✅ YES `edit_user`  

**Code Proof:**
```javascript
// main.js:1047
const authorized = await authorize(callerId, 'users.edit', userData.id);

// main.js:1070-1072
if ('role' in userData && caller.role !== 'super_admin') {
    throw new Error('Only Super Admin can change user roles');
}

// main.js:1093
await auditLog('edit_user', callerId, { targetUserId: userData.id });
```

#### delete-user
**Line:** 665-680  
**Session:** ✅  
**Scope:** ✅ `authorize()`  
**Permission:** ✅ `users.delete`  
**Audit:** ✅ YES `delete_user`  

**Code Proof:**
```javascript
// main.js:668
const authorized = await authorize(callerId, 'users.delete', userId);

// main.js:678
await auditLog('delete_user', callerId, { targetUserId: userId });
```

---

### 3. Account Management (2 handlers)

#### get-accounts
**Line:** 400-435  
**Session:** ✅ `global.currentAuthUser`  
**Scope:** ✅ Role-based filtering  
**Permission:** ❌ NO  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:402
const callerId = global.currentAuthUser?.id;

// main.js:409-413 - Staff filtering
if (user.role === 'staff') {
    query = 'SELECT a.* FROM accounts a JOIN account_assignments WHERE user_id = ?';
}
```

#### delete-account
**Line:** 897-928  
**Session:** ✅  
**Scope:** ✅ Explicit scope gate **FIXED 2026-01-18**  
**Permission:** ✅ `accounts.delete`  
**Audit:** ✅ YES `delete_account`  

**Code Proof:**
```javascript
// main.js:881-893 - Admin scope gate
if (caller.role === 'admin') {
    const [accounts] = await pool.query(`
        SELECT a.* FROM accounts a
        JOIN account_assignments aa ON a.id = aa.account_id
        LEFT JOIN users u ON aa.user_id = u.id
        WHERE a.id = ? AND (u.managed_by_admin_id = ? OR aa.user_id = ?)`,
        [accountId, callerId, callerId]
    );
    // No "OR aa.user_id IS NULL" - unassigned accounts rejected
}

// main.js:897-899 - Permission check
const hasPermission = await checkPermission(callerId, 'accounts.delete');

// main.js:914-916 - Audit log
await auditLog('delete_account', callerId, { targetAccountId: accountId });
```

---

### 4. RBAC v2 Handlers (5 handlers)

#### transfer-user-to-admin
**Line:** 1095-1138  
**Session:** ✅  
**Scope:** ✅ Super Admin only  
**Permission:** ✅ Implicit (role check)  
**Audit:** ✅ YES `transfer_ownership` / `unassign_staff`  

**Code Proof:**
```javascript
// main.js:1100-1102
if (callers[0].role !== 'super_admin') {
    throw new Error('Only Super Admin can transfer ownership');
}

// main.js:1131-1134
await auditLog(
    newAdminId ? 'transfer_ownership' : 'unassign_staff',
    callerId, { targetUserId: userId, newAdminId }
);
```

#### get-user-permissions
**Line:** 1140-1156  
**Session:** ✅  
**Scope:** ✅ `authorize()`  
**Permission:** ✅ `users.view`  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:1147
const authorized = await authorize(callerId, 'users.view', userId);
```

#### update-user-permissions
**Line:** 1158-1198  
**Session:** ✅  
**Scope:** ✅ `authorize()`  
**Permission:** ✅ `users.edit`  
**Audit:** ✅ YES `update_permissions`  

**Code Proof:**
```javascript
// main.js:1165
const authorized = await authorize(callerId, 'users.edit', userId);

// main.js:1172-1192 - Transaction-safe
await connection.beginTransaction();
// ... DELETE + INSERT
await connection.commit();

// main.js:1195-1197
await auditLog('update_permissions', callerId, { targetUserId: userId });
```

#### clear-user-permissions
**Line:** 1200-1218  
**Session:** ✅  
**Scope:** ✅ `authorize()`  
**Permission:** ✅ `users.edit`  
**Audit:** ✅ YES `clear_permissions`  

**Code Proof:**
```javascript
// main.js:1207
const authorized = await authorize(callerId, 'users.edit', userId);

// main.js:1215-1217
await auditLog('clear_permissions', callerId, { targetUserId: userId });
```

#### check-permission
**Line:** 1222-1229  
**Session:** ✅  
**Scope:** ❌ N/A (UI-only, no target)  
**Permission:** ✅ Self-check  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:1224-1225
const callerId = global.currentAuthUser?.id;
return await checkPermission(callerId, permissionKey);
```

---

### 5. Debug Helper (1 handler)

#### is-window-focused
**Line:** 1241-1246  
**Session:** ✅ **FIXED 2026-01-18**  
**Scope:** N/A  
**Permission:** N/A  
**Audit:** ❌ NO  

**Code Proof:**
```javascript
// main.js:1242-1243
const callerId = global.currentAuthUser?.id;
if (!callerId) throw new Error('Not authenticated');
```

---

## UNSECURED HANDLERS (27)

### 💥 Priority 0 - NOT REGISTERED (3 handlers)

| Handler | Impact | Line |
|:---|:---|:---|
| `get-workflows` | App crashes when called | Unknown |
| `check-proxy-health` | App crashes when called | 1249 |
| `get-database-stats` | App crashes when called | Unknown |

**Action Required:** Register handlers immediately

---

### 🔴 Priority 1 - CATASTROPHIC (6 handlers)

| Handler | Gap | Impact |
|:---|:---|:---|
| `reset-database` | No auth | **CATASTROPHIC** - Drops all data |
| `import-session` | No validation | Session injection |
| `execute-workflow` | No permission | Code execution |
| `update-assignments` | No scope | Assign accounts to anyone |
| `create-account` | No permission | Unlimited creation |
| `update-account` | No scope | Hijack any account |

**Action Required:** Block production deployment

---

### 🟠 Priority 2 - CRITICAL (18 handlers)

**Proxies (4):** get/create/update/delete - No auth  
**Extensions (3):** get/save/delete - No auth  
**Platforms (3):** get/save/delete - No auth  
**Workflows (3):** save/delete/get - No auth  
**Sessions (4):** get/export/delete-backup - No auth  
**Other (1):** pick-element - Low risk (UI helper)

---

## AUDIT LOG COVERAGE (6/41 = 15%)

**Logged Actions:**
1. `delete_user` (user management)
2. `edit_user` (user management)
3. `delete_account` (account management)
4. `transfer_ownership` (RBAC v2)
5. `update_permissions` (RBAC v2)
6. `clear_permissions` (RBAC v2)

**Missing Audit Logs (Critical):**
- User creation (save-user create mode)
- Account creation/update
- All proxy/extension/platform mutations
- Workflow execution
- Session export/import
- Database operations

---

## PRODUCTION BLOCKERS

### Must Fix Before Production

1. **Register Missing Handlers (3)**
   - get-workflows
   - check-proxy-health
   - get-database-stats

2. **Secure Catastrophic Handlers (6)**
   - reset-database → Super Admin + confirmation
   - import-session → Validate before import
   - execute-workflow → Add `workflow.execute` permission
   - update-assignments → Scope gate required
   - create-account → Add `accounts.create` permission
   - update-account → Scope gate + `accounts.edit`

3. **Complete Audit Logging (35 handlers missing)**
   - All mutation handlers must call `auditLog()`

4. **Add Missing Permissions to roleDefaults**
   ```javascript
   staff: [
       'accounts.view',
       'workflow.view',    // NEW
       'workflow.execute', // NEW - CRITICAL
       '2fa.generate'      // NEW
   ]
   ```

5. **Security Hardening**
   - Password hashing (bcrypt)
   - Session timeout
   - Input validation for all IPC params

---

## COMPLIANCE CHECKLIST

**Before deploying to production:**

- [ ] All 41 handlers have session auth
- [ ] All mutation handlers have audit logs
- [ ] All user/account actions use `authorize()`
- [ ] No renderer-trusted caller params
- [ ] All 3 missing handlers registered
- [ ] Reset-database has Super Admin guard
- [ ] Import-session has validation
- [ ] Execute-workflow has permission check
- [ ] Password hashing implemented
- [ ] Session timeout implemented
- [ ] Automated tests written

**Current Status:** 2/11 ✅ (18%)

---

## For AI Partners

**When adding new handlers:**
1. Add to this audit document
2. Mark as SECURED or UNSECURED
3. Provide code proof (line numbers + snippet)
4. Update coverage statistics
5. Do NOT claim production-ready if < 100%

**Spec is immutable. Coverage goal: 100%.**
