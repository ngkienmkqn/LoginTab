# Auth & RBAC Specification

## 1. User Entity
**Table**: `users`
- `id` (UUID)
- `username`
- `password` (Plain text, pending hash upgrade)
- `role`: `super_admin`, `admin`, `staff`
- `managed_by_admin_id`: (FK to users.id) - **Strict 1:1 Mapping** of staff to specific admin.

## 2. Roles & Capabilities
| Role | capabilities |
| :--- | :--- |
| **Super Admin** | Full System Access, Manage Admins, View All Staff, DevTools Access. |
| **Admin** | Create/Manage *assigned* Staff. Cannot see other Admins' staff. |
| **Staff** | Read-Only view of assigned accounts. Execute Workflows. No Edit/Delete. |

## 3. Account Assignment Logic
- **Table**: `account_assignments` (Junction: `user_id` <-> `account_id`)
- **Queries**:
  - `super_admin`: Select * from accounts
  - `admin`: Select * from accounts WHERE id IN (assigned_to_me) [Future Scope]
  - `staff`: Select * from accounts WHERE id IN (SELECT account_id FROM account_assignments WHERE user_id = ?)

## 4. Security
- **DevTools**: IPC `toggle-devtools` is restricted to `super_admin`.
- **Session Auth**: `main.js` holds `global.currentAuthUser`. Renderer ID is *never* trusted.
