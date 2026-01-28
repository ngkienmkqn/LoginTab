// ==================== USER MANAGEMENT (RBAC v2) ====================
const { ipcRenderer } = require('electron');

let users = [];
let editingUserId = null;
let transferringUserId = null;
let currentAssigningUserId = null;
let currentAssigningUsername = null;

async function loadUsers() {
    try {
        users = await ipcRenderer.invoke('get-users');
        renderUserTable();
    } catch (e) {
        console.error('Failed to load users:', e);
    }
}

// Render User Table (scoped by backend)
async function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No users found</td></tr>';
        return;
    }

    const currentUser = window.currentUser || {};

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

        // Delete button
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
    const currentUser = window.currentUser || {};
    editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Add New User';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = 'staff';

    const roleSelect = document.getElementById('userRole');
    const assignGroup = document.getElementById('assignToAdminGroup');
    const assignSelect = document.getElementById('userAssignToAdmin');

    if (currentUser.role === 'admin') {
        roleSelect.innerHTML = '<option value="staff">Staff</option>';
        roleSelect.disabled = true;
        if (assignGroup) assignGroup.style.display = 'none';
    } else {
        roleSelect.innerHTML = `
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
        `;
        roleSelect.disabled = false;

        if (assignSelect) appendAdminOptions(assignSelect);

        roleSelect.onchange = () => {
            if (assignGroup) {
                assignGroup.style.display = (roleSelect.value === 'staff') ? 'block' : 'none';
            }
        };

        if (assignGroup) assignGroup.style.display = 'block';
    }

    document.getElementById('modalUser').style.display = 'flex';
    document.getElementById('userUsername').focus();
}

function appendAdminOptions(selectElement) {
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
    const currentUser = window.currentUser || {};
    editingUserId = user.id;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').placeholder = 'Leave blank to keep current password';

    const roleSelect = document.getElementById('userRole');
    if (currentUser.role === 'super_admin') {
        roleSelect.innerHTML = `
            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
        `;
        roleSelect.disabled = false;
    } else {
        roleSelect.innerHTML = `<option value="${user.role}">${user.role}</option>`;
        roleSelect.disabled = true;
    }

    document.getElementById('modalUser').style.display = 'flex';
    document.getElementById('userUsername').focus();
}

// Save User (Create or Update)
async function saveUser() {
    const currentUser = window.currentUser || {};
    const username = document.getElementById('userUsername').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const assignToAdminId = document.getElementById('userAssignToAdmin')?.value || null;

    if (!username) return alert('Username is required');

    if (!editingUserId && !password) return alert('Password is required for new users');

    try {
        const userData = { username, role };

        if (editingUserId) {
            userData.id = editingUserId;
            if (password) userData.password = password;
        } else {
            userData.password = password;
            if (currentUser.role === 'super_admin' && role === 'staff' && assignToAdminId) {
                userData.managed_by_admin_id = assignToAdminId;
            }
        }

        const res = await ipcRenderer.invoke('save-user', userData);
        if (res.success) {
            document.getElementById('modalUser').style.display = 'none';
            await loadUsers();
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
            await loadUsers();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function closeUserModal() {
    document.getElementById('modalUser').style.display = 'none';
    editingUserId = null;
}

// ==================== TRANSFER OWNERSHIP ====================

function openTransferModal(user) {
    transferringUserId = user.id;
    document.getElementById('transferUsername').value = user.username;

    if (user.managed_by_admin_id) {
        const manager = users.find(u => u.id === user.managed_by_admin_id);
        document.getElementById('transferCurrentAdmin').value = manager ? manager.username : 'Unknown';
    } else {
        document.getElementById('transferCurrentAdmin').value = 'Unassigned';
    }

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
    if (!transferringUserId) return alert('No user selected for transfer');

    try {
        const res = await ipcRenderer.invoke('transfer-user-ownership', {
            userId: transferringUserId,
            newAdminId: newAdminId
        });

        if (res.success) {
            closeTransferModal();
            await loadUsers();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ==================== ASSIGNED ACCOUNTS MODAL ====================

async function showAssignedAccounts(userId, username) {
    const currentUser = window.currentUser || {};
    currentAssigningUserId = userId;
    currentAssigningUsername = username;
    document.getElementById('assignedAccountsUsername').textContent = username;

    try {
        const canAssign = currentUser.role === 'super_admin' || currentUser.role === 'admin';
        const assignButton = canAssign ? `
            <button class="btn btn-primary" style="margin-bottom:16px; width:100%;" 
                    onclick="showAssignAccountsDropdown()">
                <i class="fa-solid fa-plus"></i> Assign More Accounts
            </button>
        ` : '';
        document.getElementById('assignAccountsButtonContainer').innerHTML = assignButton;

        const accounts = await ipcRenderer.invoke('get-user-assigned-accounts', userId);
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
        if (modal) {
            modal.style.setProperty('display', 'flex', 'important');
            modal.classList.add('active'); // Add active class if CSS uses it
        }
    } catch (err) {
        alert('Error loading assigned accounts: ' + err.message);
    }
}

async function unassignAccount(accountId, userId, username) {
    if (!confirm(`Remove this account assignment from ${username}?`)) return;

    try {
        const res = await ipcRenderer.invoke('unassign-account', { accountId, userId });
        if (res.success) {
            showAssignedAccounts(userId, username);
            await loadUsers();
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

        if (available.length === 0) return alert('No available accounts to assign');

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

    if (selectedIds.length === 0) return alert('Please select at least one account');

    try {
        const res = await ipcRenderer.invoke('assign-accounts', {
            userId: currentAssigningUserId,
            accountIds: selectedIds
        });

        if (res.success) {
            document.getElementById('assignAccountsDropdown').style.display = 'none';
            showAssignedAccounts(currentAssigningUserId, currentAssigningUsername);
            await loadUsers();
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
window.loadUsers = loadUsers; // Exported for app.js
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
