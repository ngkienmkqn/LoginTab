/**
 * IPC Event Listeners Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// Track browser states
var openBrowserIds = new Set();
var syncingBrowserIds = new Set();

/**
 * Initialize all IPC event listeners
 */
function initIpcListeners() {

    // Browser loading progress
    ipcRenderer.on('browser-loading-progress', (event, data) => {
        console.log('[UI] Loading progress:', data.accountId, data.step);
        const row = document.querySelector(`tr[data-id="${data.accountId}"]`);
        if (row) {
            const statusCell = row.querySelector('.status-cell');
            if (statusCell) {
                statusCell.innerHTML = `<span class="status-loading">⏳ ${data.step}</span>`;
            }
        }
    });

    // Browser opened
    ipcRenderer.on('browser-opened', (event, data) => {
        console.log('[UI] Browser opened:', data.accountName);
        openBrowserIds.add(data.accountId);

        // Register for kick detection polling
        if (typeof registerMyOpenBrowser === 'function') {
            registerMyOpenBrowser(data.accountId);
        }

        if (typeof updateProfileButtonState === 'function') {
            updateProfileButtonState(data.accountId, 'open');
        }
        if (typeof showToast === 'function') {
            showToast(`Browser opened: ${data.accountName}`, 'success', 2000);
        }
    });

    // Browser syncing
    ipcRenderer.on('browser-syncing', (event, data) => {
        console.log('[UI] Browser syncing:', data.accountName);
        syncingBrowserIds.add(data.accountId);

        if (typeof showToast === 'function') {
            showToast(`Syncing session: ${data.accountName}...`, 'sync', 0);
        }
    });

    // Browser closed
    ipcRenderer.on('browser-closed', (event, data) => {
        console.log('[UI] Browser closed:', data.accountName);
        openBrowserIds.delete(data.accountId);
        syncingBrowserIds.delete(data.accountId);

        // Unregister from kick detection
        if (typeof unregisterMyOpenBrowser === 'function') {
            unregisterMyOpenBrowser(data.accountId);
        }

        if (typeof updateProfileButtonState === 'function') {
            updateProfileButtonState(data.accountId, 'closed');
        }
        if (typeof showToast === 'function') {
            showToast(`Session synced: ${data.accountName}`, 'success', 3000);
        }

        // Refresh profile table to show updated last_active
        if (typeof loadAllData === 'function') {
            loadAllData();
        }
    });

    // Force close browser (admin kick)
    ipcRenderer.on('force-close-browser', (event, data) => {
        const currentUserId = global.currentAuthUser?.id;

        // Only close if we're the kicked user
        if (data.kickedUserId === currentUserId) {
            console.log('[UI] Force closing browser - kicked by admin');
            openBrowserIds.delete(data.accountId);

            if (typeof updateProfileButtonState === 'function') {
                updateProfileButtonState(data.accountId, 'closed');
            }

            let msg = `Bạn đã bị kick bởi ${data.kickedBy}.`;
            if (data.restrictionMinutes === -1) {
                msg += ' Quyền truy cập đã bị thu hồi.';
            } else if (data.restrictionMinutes > 0) {
                msg += ` Hạn chế ${data.restrictionMinutes} phút.`;
            }

            if (typeof showToast === 'function') {
                showToast(msg, 'warning', 10000);
            }

            // Refresh data
            if (typeof loadAllData === 'function') {
                loadAllData();
            }
        }
    });

    // Window focus recovery
    ipcRenderer.on('window-focused', () => {
        // Re-focus any active input
        const activeInput = document.querySelector('input:focus, textarea:focus');
        if (activeInput) {
            activeInput.blur();
            setTimeout(() => activeInput.focus(), 10);
        }
    });

    console.log('[IPC] Event listeners initialized');
}

/**
 * Check if a browser is open for an account
 * @param {string} accountId - Account ID
 * @returns {boolean}
 */
function isBrowserOpen(accountId) {
    return openBrowserIds.has(accountId);
}

/**
 * Check if a browser is syncing for an account
 * @param {string} accountId - Account ID
 * @returns {boolean}
 */
function isBrowserSyncing(accountId) {
    return syncingBrowserIds.has(accountId);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initIpcListeners,
        isBrowserOpen,
        isBrowserSyncing,
        openBrowserIds,
        syncingBrowserIds
    };
}
