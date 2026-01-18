# User Management UI Contract - Account Assignment

**Version:** 2.0  
**Last Updated:** 2026-01-18

---

## Assigned Accounts Modal

### Purpose
Allow Super Admin and Admin to view and manage account assignments for users.

### Accessing the Modal
- From User Management tab
- Click the account count link (e.g., "2 accounts") in the "Assigned Accounts" column
- Opens detailed modal showing all assigned accounts for that user

---

## Modal Features

### 1. View Assigned Accounts

**Display Format:**
```
User: {username}

👤 nguyenkienthehuman@gmail.com
   Gmail                             [×Unassign]

👤 design.mylife91@gmail.com  
   Gmail                             [×Unassign]
```

**Information Shown:**
- **Profile Name:** Email or username from `auth_config` (NOT "Account #xxx")
- **Platform Name:** Platform associated with account
- **Unassign Button:** Per-account removal (authorized users only)

**Empty State:**
- If no accounts assigned: "No accounts assigned"

---

### 2. Assign More Accounts (Super Admin + Admin Only)

**Button Visibility:**
- **Super Admin:** Always visible
- **Admin:** Visible when viewing managed staff or self
- **Staff:** Not visible (read-only view)

**Button:**
```
[+] Assign More Accounts
```

**On Click:**
- Shows multi-select dropdown
- Displays available accounts filtered by caller's role

**Dropdown Format:**
```
Select Accounts to Assign:
┌─────────────────────────────────────┐
│ ☐ facebook.account@gmail.com (FB)  │
│ ☐ twitter.main@gmail.com (Twitter) │
│ ☐ info.gearhuman@gmail.com (Tazapay)│
└─────────────────────────────────────┘
         [Assign Selected] [Cancel]
```

**Behavior:**
- Multi-select (hold Ctrl/Cmd to select multiple)
- Shows profile email/username + platform name
- Sorted by platform, then account ID

---

## Authorization Rules

### Super Admin

**View:**
- Can view assigned accounts for ANY user

**Assign:**
- Can assign ANY account to ANY user
- Dropdown shows ALL unassigned accounts (global pool)

**Unassign:**
- Can unassign any account from any user

### Admin

**View:**
- Can view assigned accounts for:
  - Managed staff (users with `managed_by_admin_id = admin.id`)
  - Self

**Assign:**
- Can assign accounts ONLY to managed staff or self
- Dropdown shows ONLY accounts from managed pool:
  - Accounts currently assigned to managed users
  - Accounts assigned to admin themselves
  - **Excludes** accounts from global pool or other admins

**Unassign:**
- Can unassign accounts from managed staff or self

### Staff

**View:**
- Can view ONLY own assigned accounts

**Assign/Unassign:**
- Cannot assign or unassign
- Read-only view

---

## Backend Implementation

### IPC Handlers

#### `get-user-assigned-accounts`
- **Input:** `userId`
- **Authorization:** Based on caller role
- **Returns:** Array of assigned accounts with `profile_name`, `platform_name`, `id`

#### `get-available-accounts`
- **Input:** `userId`
- **Authorization:** Super Admin/Admin only
- **Returns:** Array of unassigned accounts filtered by role
  - Super Admin: All unassigned
  - Admin: Only from managed pool

#### `assign-accounts`
- **Input:** `{ userId, accountIds[] }`
- **Authorization:** Super Admin/Admin only
- **Action:** Bulk INSERT IGNORE into `account_assignments`
- **Audit:** Logs assignment action

#### `unassign-account`
- **Input:** `{ accountId, userId }`
- **Authorization:** Role-based
- **Action:** DELETE from `account_assignments`

---

## Profile Name Display

**Source:** `accounts.auth_config` JSON field

**Extraction Logic:**
```javascript
const auth = JSON.parse(auth_config);
const profile_name = auth?.email || auth?.username || `Account #${id.substring(0, 8)}`;
```

**Priority:**
1. `auth_config.email`
2. `auth_config.username`  
3. Fallback: `Account #xxxxxxxx` (first 8 chars of ID)

**Important:** Always display profile name, never raw account ID in UI

---

## UI/UX Notes

- **Modal width:** 600px max
- **Account list:** Max height 300px, scrollable
- **Colors:** Use theme variables (`--text-primary`, `--border`, etc.)
- **Icons:** Font Awesome (`fa-user`, `fa-plus`, `fa-times`, `fa-check`)
- **Feedback:** Alert on error, auto-refresh on success

---

## Complete User Flow

### Super Admin Assigns Account

1. Navigate to User Management
2. Click "2 accounts" for Staff "kien"
3. See 2 currently assigned accounts with profile names
4. Click "[ + ] Assign More Accounts"
5. See dropdown with ALL unassigned accounts
6. Select "info.gearhuman@gmail.com (Tazapay)"
7. Click "Assign Selected"
8. Modal refreshes showing 3 accounts
9. User table updates "Assigned Accounts" count to 3

### Admin Assigns to Managed Staff

1. Login as Admin "thuyduong"
2. Click "1 account" for managed Staff "kien"
3. See current assignments
4. Click "[ + ] Assign More Accounts"
5. See dropdown with accounts from managed pool ONLY
6. Select account
7. Click "Assign Selected"
8. Success - modal refreshes

### Staff Views Own Accounts

1. Login as Staff "kien"
2. In User Management, click own "2 accounts" link
3. See list of assigned accounts
4. **No assign button** (read-only)
5. **No unassign button**
6. Click "Close"

---

## Error Handling

**Common Errors:**
- "Access denied: Cannot manage this user" - Admin trying to assign to non-managed user
- "Access denied: Insufficient permissions" - Staff trying to assign
- "No available accounts to assign" - All accounts already assigned

**Error Display:**
- JavaScript `alert()` for user-facing errors
- Console log for debugging

---

## Related Specs

- `AI-Partner/specs/rbac-v2/ui-contract.md` - RBAC v2 rules
- `AI-Partner/specs/rbac-v2/spec.md` - Overall RBAC spec
- `REGRESSION_PREVENTION.md` - Testing protocols
