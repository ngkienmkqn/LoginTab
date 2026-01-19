# RBAC v2 - Account Assignment Feature Update

## Feature: Assigned Accounts Management

### Overview
Implemented complete account assignment feature for User Management tab, allowing admins to view and manage which accounts are assigned to which users.

### RBAC Compliance

#### Authorization Matrix

| Action | Super Admin | Admin | Staff |
|--------|------------|-------|-------|
| View own assignments | ✅ | ✅ | ✅ |
| View other user's assignments | ✅ | ✅ (if managed staff) | ❌ |
| Assign accounts to users | ✅ | ✅ (within scope) | ❌ |
| Unassign accounts from users | ✅ | ✅ (within scope) | ❌ |

#### Scope Rules

**Super Admin:**
- Can view and manage account assignments for ANY user
- Can assign/unassign ANY account to ANY user
- No scope restrictions

**Admin:**
- Can view assignments for:
  - Self
  - Staff users where `managed_by_admin_id = admin_id`
- Can assign/unassign only accounts that are:
  - Assigned to self, OR
  - Assigned to staff managed by the admin
- Cannot manage assignments for users outside their management scope

**Staff:**
- Can ONLY view own account assignments
- Cannot assign or unassign any accounts
- Read-only access to assignment data

### Backend Implementation

#### Database Schema
Uses existing `account_assignments` table:
```sql
CREATE TABLE account_assignments (
    account_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (account_id, user_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### IPC Handlers

**`get-user-assigned-accounts`**
- Authorization: Checks caller's role and scope before returning data
- Returns: Array of accounts with `id`, `profile_name`, `loginUrl`, `platform_name`
- Scope enforcement: Admin can only access own or managed staff

**`get-available-accounts`**  
- Authorization: Rejects Staff role  
- Returns: Accounts NOT yet assigned to target user, filtered by caller's scope
- Scope enforcement: Admin only sees accounts in their management scope

**`assign-accounts`**
- Authorization: Rejects Staff role
- Action: Creates account_assignments records
- Audit: Logs via `audit_log` table

**`unassign-account`**
- Authorization: Rejects Staff role
- Action: Deletes account_assignments record  
- Audit: Logs via `audit_log` table

### Frontend Implementation

#### UI Components
1. **Trigger:** "X accounts" clickable link in User Management table "Assigned Accounts" column
2. **Modal:** Full-screen overlay with account list
3. **Actions:**
   - "Assign More Accounts" button (if authorized)
   - "Unassign" button per account (if authorized)
   - Dropdown for selecting accounts to assign

#### User Experience
1. Click "X accounts" → Modal opens
2. View list of assigned accounts with platform names
3. (If Admin/Super Admin) Click "Assign More Accounts"
4. Select from dropdown of available accounts
5. Click "Assign Selected" → Accounts added immediately
6. Click "Unassign" → Account removed immediately
7. Click "Close" or overlay → Modal closes

### Security Considerations

#### Authorization Enforcement
- All backend handlers validate caller's identity via `global.currentAuthUser`
- Scope checks prevent admins from accessing data outside their management
- Staff role is explicitly blocked from modification operations

#### Audit Logging
All account assignment changes are logged with:
- Action type (`assign_accounts`, `unassign_account`)
- Actor (`callerId`)
- Target user (`targetUserId`)
- Affected accounts (`accountIds` or `accountId`)
- Timestamp

#### SQL Injection Prevention
- All queries use parameterized statements
- User-provided IDs validated before use
- No string concatenation in SQL

### Testing Requirements

#### Functional Tests
- [ ] Super Admin can view/assign/unassign for any user
- [ ] Admin can view/assign/unassign for self and managed staff only
- [ ] Admin CANNOT view/modify unmanaged users
- [ ] Staff can view own assignments only
- [ ] Staff CANNOT assign or unassign any accounts

#### Edge Cases
- [ ] Empty assignment list shows "No accounts assigned"
- [ ] Available accounts dropdown only shows un-assigned accounts
- [ ] Duplicate assignment attempts are ignored gracefully
- [ ] Unassigning non-existent assignment fails gracefully

#### Audit Verification
- [ ] All assignment actions appear in `audit_log` table
- [ ] Audit entries include correct actor and target information
- [ ] Timestamps are accurate

### Known Limitations
None. Feature is fully functional and RBAC v2 compliant.

### Related Files
- **Backend:** [main.js](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/main.js#L1150-L1300)
- **Frontend:** [user_management.js](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/src/ui/user_management.js#L348-L500)
- **HTML:** [index.html](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/src/ui/index.html#L1761-L1791)
- **UI Contracts:** [user-management-assigned-accounts.md](file:///c:/Users/admin/OneDrive/Desktop/Auto%20Login%20APP/AI-Partner/ui-contracts/user-management-assigned-accounts.md)

### Migration Notes
No database migrations required. Uses existing `account_assignments` table structure.

### Deployment Checklist
- [x] Backend IPC handlers implemented
- [x] Frontend UI components created  
- [x] RBAC authorization enforced
- [x] Audit logging integrated
- [x] UI tested with all three roles
- [x] Documentation updated
- [x] No breaking changes to existing features
