/**
 * Bulk Assignment UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// Selection state
var selectedAccountIds = new Set();
var bulkMode = 'assign'; // 'assign' or 'revoke'

/**
 * Toggle select all profiles checkbox
 */
function toggleSelectAll() {
    const isChecked = document.getElementById('selectAllProfiles').checked;
    const boxes = document.querySelectorAll('.profile-checkbox');
    boxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) selectedAccountIds.add(cb.value);
        else selectedAccountIds.delete(cb.value);
    });
    updateSelectedHeader();
}

/**
 * Handle individual account selection
 * @param {Event} event - Checkbox change event
 */
function onAccountSelect(event) {
    const cb = event.target;
    if (cb.checked) selectedAccountIds.add(cb.value);
    else selectedAccountIds.delete(cb.value);
    updateSelectedHeader();
}

/**
 * Update selection header bar visibility and count
 */
function updateSelectedHeader() {
    const count = selectedAccountIds.size;
    const bar = document.getElementById('bulk-actions');
    const label = document.getElementById('selected-count');
    if (count > 0) {
        bar.style.display = 'flex';
        label.innerText = `${count} accounts selected`;
    } else {
        bar.style.display = 'none';
        if (document.getElementById('selectAllProfiles')) {
            document.getElementById('selectAllProfiles').checked = false;
        }
    }
}

/**
 * Open bulk assign/revoke modal
 * @param {string} mode - 'assign' or 'revoke'
 */
async function openBulkAssignModal(mode) {
    bulkMode = mode || 'assign';

    // Update Modal UI
    const title = document.getElementById('bulkModalTitle');
    const desc = document.getElementById('bulkModalDesc');
    const btn = document.getElementById('bulkSubmitBtn');

    if (title) title.innerText = bulkMode === 'assign' ? 'Assign Selected Accounts' : 'Revoke Access';
    if (desc) desc.innerText = bulkMode === 'assign'
        ? 'Choose users who should GAIN access to these accounts.'
        : 'Choose users who should LOSE access to these accounts.';
    if (btn) {
        btn.innerText = bulkMode === 'assign' ? 'Give Access' : 'Revoke Access';
        btn.className = bulkMode === 'assign' ? 'btn' : 'btn btn-danger';
    }

    // Get current user role
    const currentUser = global.currentAuthUser || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
    const eligibleUsers = await ipcRenderer.invoke('get-eligible-users', currentUser?.role);

    const container = document.getElementById('eligibleUsersList');
    container.innerHTML = '';

    eligibleUsers.forEach(u => {
        const div = document.createElement('div');
        div.style.padding = '8px';
        div.style.borderBottom = '1px solid var(--border)';
        div.innerHTML = `
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                <input type="checkbox" name="targetUser" value="${u.id}">
                <span>${u.username} <small style="color:#666">(${u.role})</small></span>
            </label>
        `;
        container.appendChild(div);
    });

    document.getElementById('bulkAssignModal').classList.add('active');
}

/**
 * Save bulk assignments/revocations
 */
async function saveBulkAssignments() {
    const userCheckboxes = document.querySelectorAll('input[name="targetUser"]:checked');
    const userIds = Array.from(userCheckboxes).map(cb => cb.value);

    if (userIds.length === 0) {
        alert('Select at least one user');
        return;
    }

    const accountIds = Array.from(selectedAccountIds);
    let res;

    if (bulkMode === 'assign') {
        res = await ipcRenderer.invoke('bulk-assign', { accountIds, userIds });
    } else {
        res = await ipcRenderer.invoke('bulk-revoke', { accountIds, userIds });
    }

    if (res.success) {
        if (typeof showToast === 'function') {
            showToast(`${bulkMode === 'assign' ? 'Assigned' : 'Revoked'} ${accountIds.length} account(s) successfully!`, 'success');
        }
        selectedAccountIds.clear();
        updateSelectedHeader();
        if (typeof closeModal === 'function') {
            closeModal('bulkAssignModal');
        }
        if (typeof loadAllData === 'function') {
            loadAllData();
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('Operation failed: ' + res.error, 'error');
        }
    }
}

/**
 * Clear all selections
 */
function clearSelections() {
    selectedAccountIds.clear();
    updateSelectedHeader();
    document.querySelectorAll('.profile-checkbox').forEach(cb => {
        cb.checked = false;
    });
}

/**
 * Get selected account IDs
 * @returns {Set}
 */
function getSelectedAccountIds() {
    return selectedAccountIds;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        toggleSelectAll,
        onAccountSelect,
        updateSelectedHeader,
        openBulkAssignModal,
        saveBulkAssignments,
        clearSelections,
        getSelectedAccountIds,
        selectedAccountIds
    };
}
