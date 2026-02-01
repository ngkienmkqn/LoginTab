# RBAC v2 UI Release Notes

**Version:** 2.0.0  
**Release Date:** 2026-01-18  
**Type:** Feature Release

---

## WHAT'S NEW

### User Management UI
- ✅ Admin and Super Admin can now manage users via UI
- ✅ Users tab added to navigation (visible to Admin + Super Admin)
- ✅ Complete user table with Username, Role, Managed By columns
- ✅ Add/Edit user functionality with role-based restrictions

### Role-Based Access Control
- ✅ Admin can only create Staff users (role dropdown enforced)
- ✅ Staff completely denied access to user management (backend error)
- ✅ Scope filtering: Admin sees only managed staff + self
- ✅ Super Admin sees all users and can create any role

### Database Integration
- ✅ Managed By column renders manager username or "Unassigned"
- ✅ Auto-assignment: Admin creates Staff → auto-managed
- ✅ Explicit SQL column lists for security

---

## BREAKING CHANGES

**None.** This is an additive release.

Existing functionality unchanged:
- Profiles, Proxies, Extensions, Platforms work as before
- No schema migrations required (already in v2.0.0)
- No API changes to existing handlers

---

## BUG FIXES

### Issue 1: Modal Hardcoded Roles
**Before:** HTML had `<option>` tags for admin and super_admin  
**After:** Only `staff` option in HTML, JavaScript populates for Super Admin

### Issue 2: save-user Ambiguity
**Before:** Unclear create vs update differentiation  
**After:** Explicit `if (editingUserId)` branches with clear payloads

### Issue 3: SQL INSERT Security
**Before:** `INSERT INTO users VALUES (...)`  
**After:** `INSERT INTO users (id, username, ...) VALUES (...)`

### Issue 4: Staff Access Loophole
**Before:** Staff got empty array `[]` from get-users  
**After:** Staff gets thrown error at backend

### Issue 5: Managed By Display
**Before:** Could show raw ID or undefined  
**After:** Shows username or styled "Unassigned" text

---

## SECURITY IMPROVEMENTS

- ✅ Renderer never sends `callerId`/`adminId`/`userId`
- ✅ Backend reads caller from `global.currentAuthUser` only
- ✅ Staff role denied at backend (not just UI hidden)
- ✅ Scope-first-then-permission pattern enforced
- ✅ Delete button hidden for self and Super Admin

---

## PERFORMANCE

- User list renders synchronously (suitable for <1000 users)
- No pagination (future enhancement if needed)
- Efficient SQL scope filtering at backend

---

## TESTING

**Manual Tests:** 15/15 passed  
**Automated Tests:** None (planned for v2.1.0)

Test coverage:
- ✅ Admin/Staff tab visibility
- ✅ Role dropdown restrictions
- ✅ Scope filtering
- ✅ Managed By rendering
- ✅ SQL INSERT format
- ✅ Backend denial

---

## UPGRADE NOTES

**From v1.x:**
1. No action required
2. Users tab appears for Admin + Super Admin automatically
3. Existing users unaffected
4. Database schema already migrated

**New Users:**
- Admin can immediately create Staff users
- Super Admin can create any role
- Staff cannot access user management

---

## KNOWN LIMITATIONS

- No pagination (all users loaded at once)
- No search/filter yet (planned for v2.2.0)
- No permission override UI (planned for v2.2.0)
- No transfer ownership UI (planned for v2.2.0)

---

## DOCUMENTATION

**New Specs:**
- `AI-Partner/specs/RBACv2/spec.md` - Frozen specification
- `AI-Partner/specs/RBACv2/ui-contract.md` - UI rules
- `AI-Partner/specs/RBACv2/acceptance-tests.md` - Test cases

**Global Contracts:**
- `AI-Partner/ui-contracts/ui-rbac-gating-rules.md` - Gating rules for all future specs

**Implementation:**
- `AI-Partner/changes/rbacv2-ui/ui-implementation-notes.md`
- `AI-Partner/changes/rbacv2-ui/rbac-v2-ui-*.patch` - Unified diffs

---

## NEXT STEPS (v2.1.0+)

- Password hashing (bcrypt)
- Session timeout
- Remaining 27 unsecured handlers
- Permission management UI
- Automated test suite

---

## CONTRIBUTORS

- AI Partner (Implementation)
- User (Specification & Review)

---

**For support or questions, see: `AI-Partner/specs/RBACv2/spec.md`**
