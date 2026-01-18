// ==================== USER MANAGEMENT (RBAC v2) ====================

// Render User Table (scoped by backend)
async function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');

        // Username
        const tdName = document.createElement('td');
        tdName.textContent = user.username;
        tr.appendChild(tdName);

        // Role
        const tdRole = document.createElement('td');
        const roleColors = {
            super_admin: '#f59e0b',
            admin: '#3b82f6',
            staff: '#10b981'
        };
        tdRole.innerHTML = `<span style="color:${roleColors[user.role] || '#888'}; font-weight:600">${user.role}</span>`;
        tr.appendChild(tdRole);

        // Managed By
        const tdManaged = document.createElement('td');
        if (user.managed_by_admin_id) {
            // Find manager in users array
            const manager = users.find(u => u.id === user.managed_by_admin_id);
            if (manager) {
                tdManaged.textContent = manager.username;
            } else {
                // Manager not in scope (shouldn't happen with proper backend)
                tdManaged.innerHTML = '<span style="color:#f59e0b">Unknown Admin</span>';
            }
        } else {
            tdManaged.innerHTML = '<span style="color:var(--text-muted); font-style:italic">Unassigned</span>';
        }
        tr.appendChild(tdManaged);

        // Assigned Accounts
        const tdAssignedAccounts = document.createElement('td');

        // Hide column for Admin viewing themselves (Admin can only see assignments for managed staff)
        const shouldShowAssignments = user.role === 'staff' ||
            (currentUser.role === 'super_admin' && user.role !== 'super_admin') ||
            (currentUser.role === 'admin' && user.id !== currentUser.id && user.role === 'staff');

        if (shouldShowAssignments) {
            const count = user.assigned_accounts_count || 0;
            if (count > 0) {
                tdAssignedAccounts.innerHTML = `
                    <a href="#" onclick="showAssignedAccounts('${user.id}', '${user.username}'); return false;" 
                       style="color:#3b82f6; text-decoration:underline; cursor:pointer;">
                        ${count} account${count > 1 ? 's' : ''}
                    </a>
                `;
            } else {
                tdAssignedAccounts.innerHTML = '<span style="color:var(--text-muted); font-style:italic">No assignments</span>';
            }
        } else {
            // Show dash for admin viewing self or super admins
            tdAssignedAccounts.innerHTML = '<span style="color:var(--text-muted)">—</span>';
        }
        tr.appendChild(tdAssignedAccounts);

        //Actions
        const tdActions = document.createElement('td');
        tdActions.style.textAlign = 'right';

        // Transfer button (Super Admin only, Staff users only)
        if (currentUser.role === 'super_admin' && user.role === 'staff') {
            const btnTransfer = document.createElement('button');
            btnTransfer.className = 'btn btn-secondary';
            btnTransfer.style.padding = '6px 12px';
            btnTransfer.style.fontSize = '13px';
            btnTransfer.style.marginRight = '8px';
            btnTransfer.innerHTML = '<i class="fa-solid fa-exchange-alt"></i> Transfer';
            btnTransfer.onclick = () => openTransferModal(user);
            tdActions.appendChild(btnTransfer);
        }

        // Edit button (Admin can edit managed staff, Super Admin can edit all)
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-secondary';
        btnEdit.style.padding = '6px 12px';
        btnEdit.style.fontSize = '13px';
        btnEdit.style.marginRight = '8px';
        btnEdit.innerHTML = '<i class="fa-solid fa-edit"></i> Edit';
        btnEdit.onclick = () => openEditUserModal(user);
        tdActions.appendChild(btnEdit);

        // Delete button (cannot delete self or Super Admin)
        if (user.id !== currentUser.id && user.role !== 'super_admin') {
            const btnDel = document.createElement('button');
            btnDel.className = 'btn btn-danger';
            btnDel.style.padding = '6px 12px';
            btnDel.style.fontSize = '13px';
            btnDel.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
            btnDel.onclick = () => deleteUser(user.id);
            tdActions.appendChild(btnDel);
        }

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

// Open Add User Modal
function openAddUserModal() {
    editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Add New User';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = 'staff'; // Default to staff

    const roleSelect = document.getElementById('userRole');
    const assignGroup = document.getElementById('assignToAdminGroup');
    const assignSelect = document.getElementById('userAssignToAdmin');

    if (currentUser.role === 'admin') {
        // Admin: Can only create Staff, no assignment option
        roleSelect.innerHTML = '<option value="staff">Staff</option>';
        roleSelect.disabled = true;
        if (assignGroup) assignGroup.style.display = 'none';
    } else {
        // Super Admin: Can create any role
        roleSelect.innerHTML = `
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
        `;
        roleSelect.disabled = false;

        // Populate admin list
        if (assignSelect) {
            populateAdminList(assignSelect);
        }

        // Show/hide assignment based on role selection
        roleSelect.onchange = () => {
            if (assignGroup) {
                assignGroup.style.display = (roleSelect.value === 'staff') ? 'block' : 'none';
            }
        };

        // Show by default (Staff is default role)
        if (assignGroup) assignGroup.style.display = 'block';
    }

    document.getElementById('modalUser').style.display = 'flex';
    document.getElementById('userUsername').focus();
}

// Populate Admin List for Assignment
function populateAdminList(selectElement) {
    const admins = users.filter(u => u.role === 'admin');

    selectElement.innerHTML = '<option value="">Unassigned</option>';
    admins.forEach(admin => {
        const option = document.createElement('option');
        option.value = admin.id;
        option.textContent = admin.username;
        selectElement.appendChild(option);
    });
}

// Open Edit User Modal
function openEditUserModal(user) {
    editingUserId = user.id;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = ''; // Leave blank
    document.getElementById('userPassword').placeholder = 'Leave blank to keep current password';

    // Role selection
    const roleSelect = document.getElementById('userRole');
    if (currentUser.role === 'super_admin') {
        roleSelect.innerHTML = `
            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
        `;
        roleSelect.disabled = false;
    } else {
        // Admin cannot change roles
        roleSelect.innerHTML = `<option value="${user.role}">${user.role}</option>`;
        roleSelect.disabled = true;
    }

    document.getElementById('modalUser').style.display = 'flex';
    document.getElementById('userUsername').focus();
}

// Save User (Create or Update)
async function saveUser() {
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const assignToAdminId = document.getElementById('userAssignToAdmin')?.value || null;

    if (!username) {
        alert('Username is required');
        return;
    }

    // Create mode: password required
    if (!editingUserId && !password) {
        alert('Password is required for new users');
        return;
    }

    try {
        const userData = {
            username,
            role
        };

        if (editingUserId) {
            // UPDATE mode
            userData.id = editingUserId;
            if (password) {
                userData.password = password; // Only update if provided
            }
        } else {
            // CREATE mode
            userData.password = password;

            // Only send assignToAdminId if Super Admin creating Staff
            if (currentUser.role === 'super_admin' && role === 'staff' && assignToAdminId) {
                userData.managed_by_admin_id = assignToAdminId;
            }
        }

        const res = await ipcRenderer.invoke('save-user', userData);
        if (res.success) {
            document.getElementById('modalUser').style.display = 'none';
            users = await ipcRenderer.invoke('get-users');
            renderUserTable();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Delete User
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        const res = await ipcRenderer.invoke('delete-user', userId);
        if (res.success) {
            users = await ipcRenderer.invoke('get-users');
            renderUserTable();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Close User Modal
function closeUserModal() {
    document.getElementById('modalUser').style.display = 'none';
    editingUserId = null;
}

// ==================== TRANSFER OWNERSHIP ====================

let transferringUserId = null;

function openTransferModal(user) {
    transferringUserId = user.id;

    document.getElementById('transferUsername').value = user.username;

    // Show current admin or "Unassigned"
    if (user.managed_by_admin_id) {
        const manager = users.find(u => u.id === user.managed_by_admin_id);
        document.getElementById('transferCurrentAdmin').value = manager ? manager.username : 'Unknown';
    } else {
        document.getElementById('transferCurrentAdmin').value = 'Unassigned';
    }

    // Populate admin list (exclude current)
    const selectElement = document.getElementById('transferNewAdmin');
    const admins = users.filter(u => u.role === 'admin' && u.id !== user.managed_by_admin_id);

    selectElement.innerHTML = '<option value="">Unassigned</option>';
    admins.forEach(admin => {
        const option = document.createElement('option');
        option.value = admin.id;
        option.textContent = admin.username;
        selectElement.appendChild(option);
    });

    document.getElementById('modalTransfer').style.display = 'flex';
}

function closeTransferModal() {
    document.getElementById('modalTransfer').style.display = 'none';
    transferringUserId = null;
}

async function executeTransfer() {
    const newAdminId = document.getElementById('transferNewAdmin').value || null;

    if (!transferringUserId) {
        alert('No user selected for transfer');
        return;
    }

    try {
        const res = await ipcRenderer.invoke('transfer-user-ownership', {
            userId: transferringUserId,
            newAdminId: newAdminId
        });

        if (res.success) {
            closeTransferModal();
            users = await ipcRenderer.invoke('get-users');
            renderUserTable();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ==================== ASSIGNED ACCOUNTS MODAL ====================

// Store current assignment context globally
let currentAssigningUserId = null;
let currentAssigningUsername = null;

async function showAssignedAccounts(userId, username) {
    console.log('[showAssignedAccounts] Called with userId:', userId, 'username:', username);
    currentAssigningUserId = userId;
    currentAssigningUsername = username;
    document.getElementById('assignedAccountsUsername').textContent = username;

    try {
        // Render assign button for Super Admin/Admin
        const canAssign = currentUser.role === 'super_admin' || currentUser.role === 'admin';
        const assignButton = canAssign ? `
            <button class="btn btn-primary" style="margin-bottom:16px; width:100%;" 
                    onclick="showAssignAccountsDropdown()">
                <i class="fa-solid fa-plus"></i> Assign More Accounts
            </button>
        ` : '';
        document.getElementById('assignAccountsButtonContainer').innerHTML = assignButton;

        const accounts = await ipcRenderer.invoke('get-user-assigned-accounts', userId);
        console.log('[showAssignedAccounts] Received', accounts.length, 'accounts:', accounts);
        const list = document.getElementById('assignedAccountsList');

        if (accounts.length === 0) {
            list.innerHTML = '<li style="color:var(--text-muted); font-style:italic; padding:8px;">No accounts assigned</li>';
        } else {
            list.innerHTML = accounts.map(acc => `
                <li style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <i class="fa-solid fa-user"></i> 
                        <strong>${acc.profile_name}</strong>
                        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">${acc.platform_name || 'Unknown platform'}</span>
                    </div>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" 
                            onclick="unassignAccount('${acc.id}', '${userId}', '${username}')">
                        <i class="fa-solid fa-times"></i> Unassign
                    </button>
                </li>
            `).join('');
        }

        const modal = document.getElementById('modalAssignedAccounts');
        console.log('[showAssignedAccounts] Modal element:', modal);
        console.log('[showAssignedAccounts] Modal display before:', modal?.style.display);
        console.log('[showAssignedAccounts] List innerHTML length:', list?.innerHTML.length);

        // Use !important to override CSS class that hides modal
        modal.style.setProperty('display', 'flex', 'important');
        // AGGRESSIVE VISIBILITY FORCING
        modal.style.setProperty('visibility', 'visible', 'important');
        modal.style.setProperty('opacity', '1', 'important');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.zIndex = '99999';

        // Log computed styles
        const computed = window.getComputedStyle(modal);
        console.log('[showAssignedAccounts] COMPUTED STYLES:');
        console.log('  display:', computed.display);
        console.log('  visibility:', computed.visibility);
        console.log('  opacity:', computed.opacity);
        console.log('  position:', computed.position);
        console.log('  zIndex:', computed.zIndex);
        console.log('  width:', computed.width);
        console.log('  height:', computed.height);

        console.log('[showAssignedAccounts] Modal display after:', modal.style.display);
        console.log('[showAssignedAccounts] Modal offsetParent:', modal.offsetParent);
        console.log('[showAssignedAccounts] Modal parent:', modal.parentElement?.tagName);
    } catch (err) {
        alert('Error loading assigned accounts: ' + err.message);
    }
}

async function unassignAccount(accountId, userId, username) {
    if (!confirm(`Remove this account assignment from ${username}?`)) return;

    try {
        const res = await ipcRenderer.invoke('unassign-account', { accountId, userId });
        if (res.success) {
            // Refresh modal to show updated list
            showAssignedAccounts(userId, username);
            // Refresh user table to update counts
            users = await ipcRenderer.invoke('get-users');
            renderUserTable();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function showAssignAccountsDropdown() {
    try {
        const available = await ipcRenderer.invoke('get-available-accounts', currentAssigningUserId);
        const select = document.getElementById('assignAccountsSelect');

        if (available.length === 0) {
            alert('No available accounts to assign');
            return;
        }

        select.innerHTML = available.map(acc => `
            <option value="${acc.id}">
                ${acc.profile_name} (${acc.platform_name || 'Unknown'})
            </option>
        `).join('');

        document.getElementById('assignAccountsDropdown').style.display = 'block';
    } catch (err) {
        alert('Error loading available accounts: ' + err.message);
    }
}

async function executeAssign() {
    const select = document.getElementById('assignAccountsSelect');
    const selectedIds = Array.from(select.selectedOptions).map(opt => opt.value);

    if (selectedIds.length === 0) {
        alert('Please select at least one account');
        return;
    }

    try {
        const res = await ipcRenderer.invoke('assign-accounts', {
            userId: currentAssigningUserId,
            accountIds: selectedIds
        });

        if (res.success) {
            // Hide dropdown
            document.getElementById('assignAccountsDropdown').style.display = 'none';
            // Refresh modal
            showAssignedAccounts(currentAssigningUserId, currentAssigningUsername);
            // Refresh user table counts
            users = await ipcRenderer.invoke('get-users');
            renderUserTable();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function cancelAssign() {
    document.getElementById('assignAccountsDropdown').style.display = 'none';
}

function closeAssignedAccountsModal() {
    document.getElementById('modalAssignedAccounts').style.display = 'none';
}

// Export functions to global scope
window.renderUserTable = renderUserTable;
window.openAddUserModal = openAddUserModal;
window.openEditUserModal = openEditUserModal;
window.saveUser = saveUser;
window.deleteUser = deleteUser;
window.closeUserModal = closeUserModal;
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.executeTransfer = executeTransfer;
window.showAssignedAccounts = showAssignedAccounts;
window.closeAssignedAccountsModal = closeAssignedAccountsModal;
window.unassignAccount = unassignAccount;
window.showAssignAccountsDropdown = showAssignAccountsDropdown;
window.executeAssign = executeAssign;
window.cancelAssign = cancelAssign;
