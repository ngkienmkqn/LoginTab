# Release History

## [2.1.0] - 2026-01-19
**"Admin Empowerment Update"**

### Features
- **Admin User Management:** Admins can now manage their own "Staff" users via the UI (scoped view).
- **Admin Automations:** "Automations" tab is now accessible to Admins.
- **Profile Deletion:** Admins can now DELETE profiles they manage (assigned to self or staff).
- **Resource Auto-Assignment:** Newly created profiles are automatically assigned to the creator, ensuring immediate visibility.

### Security (RBAC v2.1.0)
- **Scoped User Management:** Backend enforces strict scoping so Admins cannot see/edit users not managed by them.
- **Workflow Scoping:** `get-workflows` is now role-aware. Admin sees only workflows they created. Super Admin sees all.
- **Google Login Bypass:** Confirmed 95% compliance with "Real Chrome, Zero Noise" strategy.

### Fixes
- Fixed "Add User" button unresponsiveness.
- Fixed logic where Admin created profiles were invisible (due to missing assignment).
