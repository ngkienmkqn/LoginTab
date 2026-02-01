# RBAC v2 Specification (FROZEN)

**Version:** 2.1.0  
**Status:** ACTIVE  
**Date:** 2026-01-19  
**Amendment Required For:** Any behavioral changes

---

## 1. CORE DECISIONS (IMMUTABLE)

### Decision 1: Session-Based Authentication
**Rule:** `global.currentAuthUser` is the ONLY source of caller identity.

```javascript
const callerId = global.currentAuthUser?.id;
if (!callerId) throw new Error('Not authenticated');
```

**Non-Negotiable:**
- ❌ Renderer CANNOT send `callerId`, `adminId`, `userId` as context
- ❌ No JWT, no token-based auth
- ❌ No client-side session storage

### Decision 2: Scope-First-Then-Permission Pattern
**Rule:** Authorization MUST check scope BEFORE permission.

```javascript
async function authorize(callerId, action, targetId) {
    const hasScope = await checkScope(caller, target);  // STEP 1
    if (!hasScope) return false;
    return await checkPermission(callerId, action);     // STEP 2
}
```

**Non-Negotiable:**
- ❌ Permission check alone is insufficient
- ❌ Cannot skip scope check

### Decision 3: 1:1 Managed-By Mapping
**Rule:** Each Staff has EXACTLY 0 or 1 Admin owner.

```sql
managed_by_admin_id VARCHAR(36) DEFAULT NULL,
CONSTRAINT fk_managed_by_admin FOREIGN KEY (managed_by_admin_id) 
    REFERENCES users(id) ON DELETE SET NULL
```

**Non-Negotiable:**
- ❌ No many-to-many support
- ❌ No shared staff between Admins
- ❌ Requires v3.0.0 to change

### Decision 4: Create-Only Assignment
**Rule:** Admin auto-assigns `managed_by_admin_id` when creating Staff. Cannot claim existing Staff.

```javascript
if (caller.role === 'admin' && newUser.role === 'staff') {
    newUser.managed_by_admin_id = callerId;  // Auto-assign
}
```

**Non-Negotiable:**
- ❌ Admin cannot update `managed_by_admin_id` via save-user
- ❌ No retroactive claiming
- ✅ Only Super Admin can transfer via `transfer-user-to-admin`

### Decision 5: No Legacy Compatibility Mode
**Rule:** RBAC v2 is a clean break. No toggle.

**Non-Negotiable:**
- ❌ No gradual rollout toggle

### Decision 6: Resource Auto-Assignment
**Rule:** Resources (Profiles) created by a user are AUTOMATICALLY assigned to them.
**Context:** Admins have scoped visibility (can only see assigned resources). Without auto-assignment, created resources become invisible to the creator.

```javascript
// Post-Creation Logic
await pool.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [creatorId, newAccountId]);
```

**Non-Negotiable:**
- ✅ Creation implies Ownership (via assignment)
- ✅ Applies to ALL roles (including Super Admin for consistency)

---

## 2. DATABASE SCHEMA (LOCKED)

### users Table
```sql
ALTER TABLE users ADD COLUMN managed_by_admin_id VARCHAR(36) DEFAULT NULL;
ALTER TABLE users ADD CONSTRAINT fk_managed_by_admin 
    FOREIGN KEY (managed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_managed_by_admin ON users(managed_by_admin_id);
```

### user_permissions Table
```sql
CREATE TABLE user_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_user_permission (user_id, permission_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### audit_log Table
```sql
CREATE TABLE audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    target_user_id VARCHAR(36),
    details TEXT,
    timestamp DATETIME NOT NULL,
    INDEX idx_action (action),
    INDEX idx_user (user_id),
    INDEX idx_target (target_user_id),
    INDEX idx_timestamp (timestamp)
);
```

---

## 3. API CONTRACTS (FROZEN)

### IPC Handlers (Secured)

#### get-users
```javascript
// Input: NONE (uses session)
// Output: User[] (scoped by role)
// Rules:
// - Staff: throw error
// - Admin: managed staff + self
// - Super Admin: all users
```

#### save-user
```javascript
// Input: { id?, username, password?, role }
// Output: { success, userId?, error? }
// Rules:
// - CREATE: no id, auto-assign managed_by_admin_id if Admin→Staff
// - UPDATE: has id, scope check required
// - SQL: MUST use explicit column list
```

#### delete-user
```javascript
// Input: userId (string)
// Output: { success, error? }
// Rules:
// - Scope check required
// - Cannot delete self or Super Admin
// - Audit log required
```

#### transfer-user-to-admin
```javascript
// Input: { userId, newAdminId }
// Output: { success, error? }
// Rules:
// - Super Admin only
// - Target must be Staff
// - Audit log required
```

---

## 4. ROLE PERMISSIONS (DEFAULT)

### roleDefaults
```javascript
{
    super_admin: [
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete',
        'workflows.view', 'workflows.create', 'workflows.edit', 'workflows.delete',
        'workflows.execute'
    ],
    admin: [
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete',
        'workflows.view', 'workflows.create', 'workflows.edit', 'workflows.execute'
    ],
    staff: [
        'accounts.view', 'workflows.view', 'workflows.execute'
    ]
}
```

### Permission Override Rules
1. `user_permissions` table overrides `roleDefaults`
2. `enabled=1` grants, `enabled=0` revokes
3. Scope check applies BEFORE permission check

---

## 5. SECURITY GUARANTEES

### What IS Secured (v2.0.0)
- ✅ User CRUD (scope + permission)
- ✅ Account deletion (scope + permission)
- ✅ Permission management (scope + permission + transaction)
- ✅ Audit logging for mutations
- ✅ Renderer cannot spoof caller identity
- ✅ Profile Visibility (Scoped by Assignment)
- ✅ Profile Creation (Auto-assigned to Creator)

### What is NOT Secured (Out of Scope)
- ❌ Proxy/Extension/Platform CRUD (no auth)
- ❌ Database reset (CATASTROPHIC - no auth)
- ❌ Import session (CRITICAL - no validation)

---

## 6. AMENDMENT PROCESS

### To Change This Spec
1. Create `SPEC_CHANGE_PROPOSAL.md` in same directory
2. Document:
   - Rationale (why change needed)
   - Breaking changes (what breaks)
   - Migration path (how to upgrade)
   - Security impact (new attack vectors)
3. Get user approval
4. Bump version (major for breaking changes)
5. Archive old spec as `spec_v2.0.0.md`

### What Requires Amendment
- Changing any Decision (1-5)
- Modifying database schema
- Altering API contracts
- Changing role permissions defaults
- Weakening security guarantees

### What Does NOT Require Amendment
- Adding new IPC handlers (if compliant)
- Adding new permissions to `roleDefaults`
- Documentation fixes (typos, clarifications)
- Implementation bug fixes

---

## 7. DEPENDENCIES

**This spec PROVIDES:**
- Session-based auth pattern
- Scope-first-then-permission pattern
- 1:1 ownership model
- Permission override system

**Future specs MUST:**
- Import `ui-contracts/ui-rbac-gating-rules.md`
- NOT modify UI navigation visibility rules
- NOT bypass scope checks
- NOT trust renderer-provided caller identity

---

## 8. VERIFICATION CHECKLIST

Before claiming compliance with this spec:
- [ ] All IPC handlers use `global.currentAuthUser?.id`
- [ ] All mutation handlers call `authorize(callerId, action, targetId)`
- [ ] All SQL INSERTs use explicit column lists
- [ ] Staff role denied at backend (throw error)
- [ ] Managed By column renders username or "Unassigned"
- [ ] Modal HTML only has `staff` option (JS populates for Super Admin)
- [ ] No renderer-provided `callerId`/`adminId`/`userId`

---

**THIS SPEC IS FROZEN. DO NOT MODIFY WITHOUT AMENDMENT.**
