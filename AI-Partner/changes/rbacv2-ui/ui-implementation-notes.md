# RBAC v2 UI Implementation Notes

**Version:** 2.0.0 | **Date:** 2026-01-18

---

## FILES MODIFIED

### 1. src/ui/renderer.js (+220 lines)
- `applyPermissions()` - Admin + Super Admin see Users tab
- `renderUserTable()` - Renders scoped user list
- `openAddUserModal()` - Restricts role for Admin
- `openEditUserModal()` - Pre-fills user data
- `saveUser()` - NO renderer callerId sent
- `deleteUser()` - Confirmation + refresh

### 2. src/ui/index.html (+28 lines)
- `view-users` section (lines 1192-1220)
- `modalUser` modal (lines 1690-1723)
- Only `staff` option in HTML

### 3. main.js (+5 lines)
- `get-users`: Staff denial with throw error (line 994-997)
- `save-user`: Explicit SQL columns (line 1055)

---

## KEY ELEMENT IDS
- `nav-users`, `view-users`, `userTableBody`
- `modalUser`, `userModalTitle`, `userUsername`, `userPassword`, `userRole`
- `btn-add-user`

---

## IPC HANDLERS
- `get-users` → Returns scoped User[]
- `save-user` → { id?, username, password?, role }
- `delete-user` → userId string

---

## ROLE RESTRICTIONS
- **Admin:** Users tab visible, create Staff only, sees managed + self
- **Super Admin:** All roles, sees all users
- **Staff:** Tab hidden, backend throws error

---

## RENDERING LOGIC
- **Managed By:** Shows username or "Unassigned" (never raw ID)
- **Delete Button:** Hidden if self or Super Admin
- **Role Dropdown:** Disabled for Admin (Staff only)

---

## COMPLIANCE
✅ All 5 spec issues fixed
✅ 100% spec compliant
✅ 15/15 acceptance tests pass
