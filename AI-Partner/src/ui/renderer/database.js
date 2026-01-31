/**
 * Database Management UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

/**
 * Load and display database statistics
 */
async function loadDatabaseStats() {
    try {
        const stats = await ipcRenderer.invoke('get-database-stats');

        // Configuration info
        setElementValue('db-host', stats.host || 'localhost');
        setElementValue('db-name', stats.database || 'login_tab');

        // Health stats
        setElementValue('db-status', stats.connected ? 'Connected' : 'Disconnected');
        setElementValue('db-pool-size', stats.poolSize || 0);
        setElementValue('db-active-connections', stats.activeConnections || 0);

        // Table records
        setElementValue('db-accounts-count', stats.accounts || 0);
        setElementValue('db-users-count', stats.users || 0);
        setElementValue('db-proxies-count', stats.proxies || 0);
        setElementValue('db-workflows-count', stats.workflows || 0);
        setElementValue('db-extensions-count', stats.extensions || 0);
        setElementValue('db-platforms-count', stats.platforms || 0);

        // Status indicator color
        const statusEl = document.getElementById('db-status');
        if (statusEl) {
            statusEl.className = stats.connected ? 'status-connected' : 'status-disconnected';
        }

    } catch (error) {
        console.error('[DB] Failed to load stats:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to load database stats', 'error');
        }
    }
}

/**
 * Reset database with confirmation
 */
async function resetDatabaseWithConfirmation() {
    const confirmed = confirm(
        'WARNING: This will delete all accounts, users (except admin), assignments, and related data.\n\n' +
        'Workflows will be preserved.\n\n' +
        'This action cannot be undone. Continue?'
    );

    if (!confirmed) return;

    // Second confirmation
    const secondConfirm = prompt('Type "RESET" to confirm database reset:');
    if (secondConfirm !== 'RESET') {
        if (typeof showToast === 'function') {
            showToast('Database reset cancelled', 'info');
        }
        return;
    }

    try {
        if (typeof showToast === 'function') {
            showToast('Resetting database...', 'warning', 0);
        }

        const result = await ipcRenderer.invoke('database:reset');

        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('Database reset complete!', 'success');
            }

            // Reload data
            if (typeof loadAllData === 'function') {
                await loadAllData();
            }
            loadDatabaseStats();
        } else {
            throw new Error(result.error || 'Reset failed');
        }
    } catch (error) {
        console.error('[DB] Reset failed:', error);
        if (typeof showToast === 'function') {
            showToast('Database reset failed: ' + error.message, 'error');
        }
    }
}

/**
 * Helper to set element text content
 */
function setElementValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadDatabaseStats,
        resetDatabaseWithConfirmation
    };
}
