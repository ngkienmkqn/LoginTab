# RBAC v2: Core Decisions

**Version:** 2.0.0  
**Status:** APPROVED (immutable)  
**Last Updated:** 2026-01-18

---

## Decision 1: Session-Based Authentication

### What
Use in-memory `global.currentAuthUser` as the ONLY source of caller identity.

### Why
- **Simplicity:** No JWT parsing, no token refresh, no crypto overhead
- **Security:** Renderer cannot spoof identity (session is server-side only)
- **Electron-native:** Single-process architecture makes global state safe

### Implementation

```javascript
// main.js:11
global.currentAuthUser = null;

// auth-login handler sets it
global.currentAuthUser = { id: user.id, username: user.username, role: user.role };

// All handlers read it
const callerId = global.currentAuthUser?.id;
if (!callerId) throw new Error('Not authenticated');
```

**Evidence:** `main.js:11`, `main.js:933-948`

### Non-Negotiable
- ❌ Renderer CANNOT send `userId`/`callerId`/`adminId` as context
- ❌ No token-based auth
- ❌ No renderer-side session storage

### Future Consideration
- Session timeout (v2.1.0) - add `expiresAt` check
- Session refresh - currently permanent until logout

---

## Decision 2: Scope-First-Then-Permission Pattern

### What
Authorization MUST check scope BEFORE permission.

```javascript
async function authorize(callerId, action, targetId) {
    // STEP 1: Scope gate (can caller access target?)
    const hasScope = await checkScope(caller, target);
    if (!hasScope) return false;
    
    // STEP 2: Permission check (does caller have the right?)
    return await checkPermission(callerId, action);
}
```

### Why
- **Defense in depth:** Even with permission, out-of-scope targets are denied
- **Prevents lateral movement:** Admin with `users.delete` cannot delete unmanaged users
- **Explicit intent:** Scope is about WHO you manage, permission is about WHAT you can do

### Example

```javascript
// Admin trying to delete Super Admin's staff
// hasPermission('users.delete') = true (Admin has the permission)
// hasScope(admin, super_admin_staff) = false (out of scope)
// Result: DENIED
```

**Evidence:** `main.js:82-116` (authorize function)

### Non-Negotiable
- ❌ Permission check alone is insufficient
- ❌ Cannot skip scope check "for convenience"
- ❌ `check-permission` (UI helper) is NOT a substitute

### Exceptions
- Super Admin: Scope check always returns true
- Self-access: Users can access their own data

---

## Decision 3: 1:1 Managed-By Mapping

### What
Each Staff user has EXACTLY 0 or 1 Admin owner.

```sql
-- users table
managed_by_admin_id VARCHAR(36) DEFAULT NULL,
CONSTRAINT fk_managed_by_admin 
    FOREIGN KEY (managed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
```

### Why NOT Many-to-Many
- **Simplicity:** Clear ownership hierarchy (no conflict resolution)
- **Audit clarity:** One owner = one responsible party
- **Query performance:** Simple JOIN vs complex graph lookup
- **Business logic:** Staff reports to one manager, not multiple

### Use Case
- Admin A creates Staff 1 → `managed_by_admin_id = A`
- Super Admin transfers Staff 1 to Admin B → `managed_by_admin_id = B`
- Admin B leaves company (deleted) → `managed_by_admin_id = NULL` (unassigned)

**Evidence:** `src/database/mysql.js:165-183`, `main.js:1095-1138`

### Non-Negotiable
- ❌ No many-to-many support
- ❌ No "shared staff" between Admins
- ❌ Cannot change without major version (v3.0.0)

### Migration Impact
- Existing systems with many-to-many: Must pick primary Admin per Staff
- Unassigned Staff: Allowed (`managed_by_admin_id = NULL`)

---

## Decision 4: Create-Only Assignment

### What
Admin auto-assigns managed_by_admin_id when creating Staff. Cannot claim existing Staff.

```javascript
// main.js:1002-1018
if (caller.role === 'admin' && newUser.role === 'staff') {
    // Auto-assignment on creation
    await pool.query(
        'INSERT INTO users VALUES (?, ?, ?, ?, ?)',
        [newId, username, password, 'staff', callerId]  // callerId = managed_by_admin_id
    );
}

// ❌ FORBIDDEN: Update existing Staff's managed_by_admin_id via save-user
```

### Why
- **Prevent ownership hijacking:** Admin cannot steal other Admin's staff
- **Clear lifecycle:** Ownership established at birth, movable only by Super Admin
- **Audit integrity:** Ownership changes are intentional (via transfer API), not accidental

### Transfer API
**Only Super Admin** can move Staff between Admins:

```javascript
// main.js:1095-1138
ipcMain.handle('transfer-user-to-admin', async (event, { userId, newAdminId }) => {
    if (caller.role !== 'super_admin') throw new Error('Only Super Admin');
    if (target.role !== 'staff') throw new Error('Only Staff users');
    
    await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', 
                     [newAdminId, userId]);
    await auditLog('transfer_ownership', callerId, { targetUserId: userId });
});
```

**Evidence:** `main.js:1002-1018`, `main.js:1095-1138`

### Non-Negotiable
- ❌ Admin cannot update `managed_by_admin_id` via save-user
- ❌ No "claim existing user" feature
- ❌ Input sanitization: `delete userData.managed_by_admin_id` from renderer

### Exceptions
- Super Admin: Can set `managed_by_admin_id` on creation or via transfer API

---

## Decision 5: No Legacy Compatibility Mode

### What
RBAC v2 is a clean break. No toggle, no backward compatibility, no migration flag.

### Why
- **Complexity avoidance:** Dual-mode systems double the test matrix
- **Security clarity:** One authorization model, no ambiguity
- **Forced migration:** Ensures all code paths are RBAC-aware

### Migration Strategy
- **Before deployment:** Audit all IPC handlers
- **Deploy:** Migrations run automatically
- **Rollback if needed:** `rollback-rbac-v2.sql`

### Non-Negotiable
- ❌ No `enableRBAC` flag
- ❌ No "v1 compatibility layer"
- ❌ No gradual rollout toggle

### Impact
- **Breaking change:** Handlers expecting `user` param from renderer will fail
- **Required updates:** All renderer code must use session-based auth
- **Version bump:** Major version (v2.0.0) signals breaking change

---

## Summary Table

| Decision | Why | Non-Negotiable |
|:---|:---|:---|
| Session-based auth | Simplicity + Security | No renderer-provided caller ID |
| Scope-first-then-permission | Defense in depth | Cannot skip scope check |
| 1:1 mapping | Clear ownership | No many-to-many |
| Create-only assignment | Prevent hijacking | Admin cannot claim existing Staff |
| No legacy mode | Complexity avoidance | No dual-mode system |

---

## For AI Partners

**Before proposing changes to these decisions:**
1. Create `SPEC_CHANGE_PROPOSAL.md`
2. Document breaking changes
3. Provide migration path
4. Analyze security impact
5. Justify complexity addition

**These decisions are APPROVED and IMMUTABLE for v2.x.**
