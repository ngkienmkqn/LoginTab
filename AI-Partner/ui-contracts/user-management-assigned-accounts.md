# User Management - Assigned Accounts Feature

## UI Component: Assigned Accounts Modal

### Location
Accessible from User Management tab by clicking the "X accounts" link in the "Assigned Accounts" column.

### Visual Appearance
- **Trigger:** Clickable link showing account count (e.g., "3 accounts")
- **Modal Overlay:** Semi-transparent black background (rgba(0,0,0,0.5))
- **Modal Container:** Centered white box with shadow
- **Header:** "Assigned Accounts for [username]"
- **Content:** Scrollable list of assigned accounts
- **Actions:** Assign/Unassign buttons based on user role

### Account List Format
Each account displayed as:
```
👤 profile_name_or_email
   Platform: platform_name
   [Unassign] button (if permitted)
```

### RBAC Rules

#### Visibility
- **Super Admin:** Can view assignments for any user
- **Admin:** Can view assignments for:
  - Self
  - Staff users managed by the admin (`managed_by_admin_id`)
- **Staff:** Can only view own assignments

#### Actions Available
| Role | View | Assign | Unassign |
|------|------|--------|----------|
| Super Admin | All users | ✅ | ✅ |
| Admin | Self + Managed Staff | ✅ | ✅ |
| Staff | Self only | ❌ | ❌ |

### Interaction Flow

1. **Opening Modal**
   - User clicks "X accounts" link in User Management table
   - Frontend calls `showAssignedAccounts(userId, username)`
   - Backend handler `get-user-assigned-accounts` fetches data with RBAC check
   - Modal displays with account list

2. **Viewing Accounts**
   - Each account shows: profile name, platform, assignment status
   - List is scrollable if more than ~5 accounts

3. **Assigning Accounts** (Admin/Super Admin only)
   - Click "Assign More Accounts" button
   - Dropdown shows available accounts (not yet assigned, within scope)
   - Select accounts and click "Assign Selected"
   - Accounts added to list immediately

4. **Unassigning Accounts** (Admin/Super Admin only)
   - Click "Unassign" button next to account
   - Confirmation (optional)
   - Account removed from list immediately

5. **Closing Modal**
   - Click "Close" button or overlay background
   - Modal disappears, returns to User Management table

### Technical Implementation

#### Frontend Files
- **HTML:** `src/ui/index.html` - Modal structure at body level
- **JavaScript:** `src/ui/user_management.js` - Modal functions
- **Trigger:** User Management table's "Assigned Accounts" column

#### Backend Handlers
- `get-user-assigned-accounts` - Fetch assigned accounts
- `get-available-accounts` - Fetch assignable accounts  
- `assign-accounts` - Add assignments
- `unassign-account` - Remove assignment

#### Database Tables
- `account_assignments` - Links accounts to users
- `accounts` - Account details
- `platforms` - Platform names for display

### Error Handling
- **Access Denied:** If user tries to view out-of-scope assignments, show error message
- **No Accounts:** Display "No accounts assigned" message in empty list
- **Network Error:** Show "Error loading accounts" with retry option

### UI States
1. **Loading:** Show spinner while fetching data
2. **Empty:** "No accounts assigned" message
3. **Populated:** List of accounts with action buttons
4. **Error:** Error message with close/retry options

### CSS Requirements
- Modal MUST be direct child of `<body>` (not nested in other modals)
- Use `position: fixed` with `top:0; left:0; width:100%; height:100%`
- Set `z-index: 1000` or higher
- Use flexbox for centering (`justify-content: center; align-items: center`)

### Critical Implementation Note
⚠️ **The modal div must NOT be nested inside any element with `display: none` or hidden state.** Parent elements with `display: none` will hide all children regardless of child's display property.

**Correct Structure:**
```html
<body>
    <div id="modalUser" class="modal">...</div>  <!-- User Modal -->
    <div id="modalAssignedAccounts">...</div>    <!-- Accounts Modal (sibling!) -->
</body>
```

**Incorrect Structure:**
```html
<body>
    <div id="modalUser" class="modal">
        <div id="modalAssignedAccounts">...</div>  <!-- WRONG: Nested inside hidden modal -->
    </div>
</body>
```
