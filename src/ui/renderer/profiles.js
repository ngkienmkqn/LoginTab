/**
 * Profiles Management UI Module  
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// State
var accounts = [];
var editingAccountId = null;
var openBrowserIds = new Set();

// Kick modal state
var kickTargetAccountId = null;
var kickTargetUsername = null;

/**
 * Load accounts data
 */
async function loadAccounts() {
    try {
        accounts = await ipcRenderer.invoke('get-accounts');
        return accounts;
    } catch (error) {
        console.error('[Profiles] Load failed:', error);
        return [];
    }
}

/**
 * Get current accounts
 */
function getAccounts() {
    return accounts;
}

/**
 * Set accounts data (for external sync)
 */
function setAccounts(data) {
    accounts = data;
}

/**
 * Launch browser for a profile
 * @param {string} id - Account ID
 */
function launch(id) {
    if (openBrowserIds.has(id)) {
        console.log('[Launch] Already running/loading:', id);
        return;
    }

    openBrowserIds.add(id);
    if (typeof updateProfileButtonState === 'function') {
        updateProfileButtonState(id, 'loading');
    }

    ipcRenderer.invoke('launch-browser', id);
}

/**
 * Edit an account - open modal with data
 * @param {string} id - Account ID
 */
function editAccount(id) {
    const acc = accounts.find(a => a.id === id);
    if (acc && typeof openModal === 'function') {
        openModal(acc);
    }
}

/**
 * Delete an account
 * @param {string} id - Account ID
 * @param {string} name - Account name for confirmation
 */
async function remove(id, name) {
    if (confirm('Delete ' + name + '?')) {
        await ipcRenderer.invoke('delete-account', id);
        if (typeof loadAllData === 'function') loadAllData();
    }
}

/**
 * Open kick modal for admin to kick a user
 * @param {string} accountId - Account ID
 * @param {string} username - Username to display
 */
function openKickModal(accountId, username) {
    kickTargetAccountId = accountId;
    kickTargetUsername = username;
    document.getElementById('kickTargetName').textContent = username;
    document.getElementById('kickRestriction').value = '0';
    document.getElementById('kickModal').classList.add('active');
}

/**
 * Kick profile user (admin action)
 */
async function kickProfileUser() {
    if (!kickTargetAccountId) return;

    const restriction = parseInt(document.getElementById('kickRestriction').value);

    const res = await ipcRenderer.invoke('kick-profile-user', {
        accountId: kickTargetAccountId,
        restrictionMinutes: restriction
    });

    if (res.success) {
        if (typeof showToast === 'function') {
            showToast(res.message, 'success', 3000);
        }
        if (typeof closeModal === 'function') {
            closeModal('kickModal');
        }
        if (typeof loadAllData === 'function') {
            loadAllData();
        }
    } else {
        alert('Kick failed: ' + res.error);
    }

    kickTargetAccountId = null;
    kickTargetUsername = null;
}

/**
 * Update profile button state based on browser status
 * @param {string} accountId - Account ID
 * @param {string} state - State: 'loading', 'open', 'closed'
 */
function updateProfileButtonState(accountId, state) {
    const row = document.querySelector(`tr[data-id="${accountId}"]`);
    if (!row) return;

    const launchBtn = row.querySelector('.launch-btn');
    if (!launchBtn) return;

    switch (state) {
        case 'loading':
            launchBtn.disabled = true;
            launchBtn.innerHTML = '<span class="spinner"></span> Loading...';
            launchBtn.classList.add('btn-loading');
            break;
        case 'open':
            launchBtn.disabled = true;
            launchBtn.innerHTML = '🟢 Running';
            launchBtn.classList.remove('btn-loading');
            launchBtn.classList.add('btn-running');
            break;
        case 'closed':
        default:
            launchBtn.disabled = false;
            launchBtn.innerHTML = '▶ Launch';
            launchBtn.classList.remove('btn-loading', 'btn-running');
            openBrowserIds.delete(accountId);
            break;
    }
}

/**
 * Filter profiles table
 */
function filterProfiles() {
    const searchTerm = document.getElementById('profileSearch')?.value?.toLowerCase() || '';
    const platformFilter = document.getElementById('platformFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    const tbody = document.getElementById('profileBody');
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');

    for (let row of rows) {
        const name = row.children[1]?.textContent?.toLowerCase() || '';
        const platform = row.dataset.platform || '';
        const status = row.dataset.status || '';

        let show = true;

        if (searchTerm && !name.includes(searchTerm)) show = false;
        if (platformFilter && platform !== platformFilter) show = false;
        if (statusFilter && status !== statusFilter) show = false;

        row.style.display = show ? '' : 'none';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadAccounts,
        getAccounts,
        setAccounts,
        launch,
        editAccount,
        remove,
        openKickModal,
        kickProfileUser,
        updateProfileButtonState,
        filterProfiles,
        accounts,
        openBrowserIds
    };
}
