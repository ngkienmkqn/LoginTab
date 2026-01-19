# RBAC v2 Implementation

**Version:** 2.0.0  
**Status:** ⚠️ **PARTIAL / ALPHA** (34% handlers secured, NOT production-ready)  
**Last Updated:** 2026-01-18  
**Spec State:** APPROVED (immutable)

---

## 📊 Implementation Status

| Component | Status | Coverage |
|:---|:---:|:---|
| Database Schema | ✅ Complete | 3 tables migrated |
| Authorization Helpers | ✅ Complete | checkScope, checkPermission, authorize |
| IPC Handler Security | ⚠️ Partial | 14/41 (34%) |
| Frontend Integration | ⚠️ Partial | Session-based, no permission UI |
| Input Focus Fixes | ✅ Complete | ModalManager + window focus recovery |
| Documentation | ✅ Complete | Spec-driven docs |

**BLOCKER FOR PRODUCTION:**
- 27 unsecured handlers (66% coverage gap)
- 3 handlers not registered (app crashes)
- No password hashing (plaintext)
- No session timeout

---

## 🎯 Scope

### What RBAC v2 Delivers

**1. Authorization Infrastructure**
- Session management (`global.currentAuthUser`)
- Scope-first-then-permission pattern
- Permission override system
- Comprehensive audit logging

**2. 1:1 Ownership Model**
- Each Staff user managed by exactly 0 or 1 Admin
- Create-only assignment (Admin creates → auto-assigned)
- Transfer ownership (Super Admin only)

**3. Database Schema**
- `users.managed_by_admin_id` with FK constraint
- `user_permissions` table for overrides
- `audit_log` table with 4 indexes

**4. Secured Handlers (14)**
- Authentication: login/logout (session)
- User management: get/create/update/delete (scope + permission)
- Account management: get/delete (scope + permission)
- RBAC v2: transfer, permissions CRUD, check-permission

**Evidence:** See `AI-Partner/specs/rbac-v2/IPC_SECURITY_AUDIT.md`

---

## 🚫 Non-Negotiables (IMMUTABLE)

### 1. Caller Identity Source
```javascript
// ONLY valid source
const callerId = global.currentAuthUser?.id;

// ❌ FORBIDDEN
ipcMain.handle('handler', async (event, userId) => {
    // DO NOT USE userId from renderer as caller identity
});
```

### 2. Authorization Pattern
```javascript
// REQUIRED order
async function authorize(callerId, action, targetId) {
    // STEP 1: Scope gate
    const hasScope = await checkScope(caller, target);
    
    // STEP 2: Permission check
    const hasPermission = await checkPermission(callerId, action);
    
    return hasScope && hasPermission;
}
```

### 3. 1:1 Managed-By Mapping
- **Rule:** `users.managed_by_admin_id` → FK to `users(id)`
- **Enforcement:** ON DELETE SET NULL
- **No many-to-many:** Staff cannot have multiple admins

### 4. Create-Only Assignment
```javascript
// Admin creates Staff → auto-assigned
if (caller.role === 'admin' && newUser.role === 'staff') {
    newUser.managed_by_admin_id = callerId;  // Auto-assign
}

// ❌ FORBIDDEN: Admin cannot claim existing Staff
```

### 5. UI-Only vs Action Enforcement
- `check-permission` → UI hints ONLY (no scope check)
- Real actions → MUST use `authorize()` with scope check

---

## ✅ Decisions (Final)

See `AI-Partner/specs/rbac-v2/DECISIONS.md` for detailed rationale.

1. **Session-based auth** - No JWT, no token, just in-memory session
2. **Scope-first pattern** - Scope gate before permission check
3. **1:1 mapping** - No many-to-many support
4. **Create-only** - No retroactive claiming
5. **No legacy mode** - Clean break, no compatibility flags

---

## 🔴 Out of Scope (v2.0.0)

### Deferred to Future Versions
- Password hashing (bcrypt) → v2.1.0
- Session timeout → v2.1.0
- Complete handler migration (27 unsecured) → v2.1.0
- Permission management UI → v2.2.0
- Transfer ownership UI → v2.2.0
- Automated tests → v2.3.0

### Explicitly NOT Supported
- Legacy compatibility mode
- Many-to-many Admin-Staff mapping
- Retroactive claiming of Staff by Admin
- Client-side (renderer) authorization
- Optional audit logging

---

## 📁 Documentation Structure

```
AI-Partner/specs/rbac-v2/
├── README.md (this file)
├── DECISIONS.md (5 core decisions with rationale)
├── IPC_SECURITY_AUDIT.md (handler inventory 14/41)
├── DB_MIGRATIONS.md (schema + idempotency + rollback)
└── TEST_PLAN.md (6 manual test scenarios)
```

---

## 🛡️ Security Guarantees (v2.0.0)

**What IS secured:**
- ✅ User CRUD operations (scope + permission)
- ✅ Account deletion (scope + permission)
- ✅ Permission overrides (scope + permission + transaction)
- ✅ All secured actions logged to `audit_log`
- ✅ Renderer cannot spoof caller identity

**What is NOT secured:**
- ❌ Account creation/update (no auth)
- ❌ Proxy/Extension/Platform CRUD (no auth)
- ❌ Workflow execution (CRITICAL - no permission check)
- ❌ Database reset (CATASTROPHIC - no auth)
- ❌ Import session (CRITICAL - no validation)

**Production Readiness:** ❌ **NOT READY** (66% coverage gap)

---

## 🔄 Migration from v1.x

**Breaking Changes:**
1. All user records need `managed_by_admin_id` set (nullable OK)
2. Renderer must stop sending `userId`/`callerId` as context
3. Handlers expecting `user` param from renderer will break
4. `check-permission` alone is insufficient (need `authorize()`)

**Migration Steps:**
1. Backup database
2. Deploy code (migrations auto-run)
3. Verify console logs (FK, index, tables created)
4. Test with multiple role types
5. Check `audit_log` for action records

**Rollback:**
```bash
mysql < docs/ai-partner/rollback-rbac-v2.sql
```

---

## 📚 Related Specs

- **Input Focus Fix:** `AI-Partner/specs/input-focus-fix/README.md`
- **IPC Contract:** `docs/ai-partner/IPC_CONTRACT.md`
- **DB Schema:** `docs/ai-partner/DB_SCHEMA.md`
- **Spec Drift Guard:** `docs/ai-partner/DRIFT_GUARD.md`

---

## ⚠️ Known Issues (v2.0.0)

1. **get-users scope filtering** - Admin sees managed staff + self (✅ working)
2. **delete-account scope** - Admin restricted to managed staff accounts (✅ fixed 2026-01-18)
3. **Workflow permissions** - Staff missing `workflow.execute` (❌ blocker)
4. **Handler coverage** - 27/41 handlers unsecured (❌ blocker)

---

## 📞 For AI Partners

**When implementing new features:**
1. Read `DECISIONS.md` first
2. Run compliance check against non-negotiables
3. Update `IPC_SECURITY_AUDIT.md` for any new handlers
4. Do NOT claim production-ready if coverage < 100%

**Spec is IMMUTABLE. To change:** Create new version proposal with impact analysis.
