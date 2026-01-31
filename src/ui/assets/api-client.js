/**
 * API Client - Replaces Electron's ipcRenderer for Express.js server
 * This shim allows renderer.js to work in both Electron and browser contexts
 */

// Create a browser-compatible API layer
class ApiClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.sessionUser = null;
    }

    // Simulate ipcRenderer.invoke() for backwards compatibility
    async invoke(channel, ...args) {
        console.log('[API] Channel:', channel, 'Args:', args);

        switch (channel) {
            // --- Authentication ---
            case 'auth-login':
                return this.post('/api/auth/login', args[0]);
            case 'auth-logout':
                return this.post('/api/auth/logout');

            // --- Accounts ---
            case 'get-accounts':
                return this.get('/api/accounts');
            case 'create-account':
                return this.post('/api/accounts', args[0]);
            case 'update-account':
                return this.put(`/api/accounts/${args[0].id}`, args[0]);
            case 'delete-account':
                return this.delete(`/api/accounts/${args[0]}`);
            case 'update-account-notes':
                return this.put(`/api/accounts/${args[0]}/notes`, { notes: args[1] });

            // --- Browser Launch ---
            case 'launch-browser':
                const launchData = typeof args[0] === 'object' ? args[0] : { id: args[0] };
                return this.post('/api/browser/launch', launchData);

            // --- Proxies ---
            case 'get-proxies':
                return this.get('/api/proxies');
            case 'save-proxy':
                return this.post('/api/proxies', args[0]);
            case 'delete-proxy':
                return this.delete(`/api/proxies/${args[0]}`);
            case 'check-proxy-health':
                return this.post('/api/proxies/check', args[0]);

            // --- Extensions ---
            case 'get-extensions':
                return this.get('/api/extensions');
            case 'save-extension':
                return this.post('/api/extensions', args[0]);
            case 'delete-extension':
                return this.delete(`/api/extensions/${args[0]}`);

            // --- Platforms ---
            case 'get-platforms':
                return this.get('/api/platforms');
            case 'save-platform':
                return this.post('/api/platforms', args[0]);
            case 'update-platform':
                return this.put(`/api/platforms/${args[0].id}`, args[0]);
            case 'delete-platform':
                return this.delete(`/api/platforms/${args[0]}`);

            // --- Users ---
            case 'get-users':
                return this.get('/api/users');
            case 'save-user':
                if (args[0].id) {
                    return this.put(`/api/users/${args[0].id}`, args[0]);
                }
                return this.post('/api/users', args[0]);
            case 'create-user':
                return this.post('/api/users', args[0]);
            case 'update-user':
                return this.put(`/api/users/${args[0].id}`, args[0]);
            case 'delete-user':
                return this.delete(`/api/users/${args[0]}`);
            case 'get-user-assigned-accounts':
                return this.get(`/api/users/${args[0]}/assigned-accounts`);
            case 'get-available-accounts':
                return this.get(`/api/users/${args[0]}/available-accounts`);
            case 'assign-accounts':
                return this.post('/api/bulk-assign', { accountIds: args[0].accountIds, userIds: [args[0].userId] });
            case 'unassign-account':
                return this.post('/api/bulk-revoke', { accountIds: [args[0].accountId], userIds: [args[0].userId] });
            case 'transfer-user-ownership':
                return this.post(`/api/users/${args[0].userId}/transfer`, { newAdminId: args[0].newAdminId });

            // --- Workflows ---
            case 'get-workflows':
                return this.get('/api/workflows');
            case 'load-workflow':
                return this.get(`/api/workflows/${args[0]}`);
            case 'save-workflow':
                return this.post('/api/workflows', args[0]);
            case 'delete-workflow':
                return this.delete(`/api/workflows/${args[0]}`);
            case 'clear-all-workflows':
                return this.delete('/api/workflows');

            // --- Assignments ---
            case 'get-assignments':
                return this.get(`/api/assignments/${args[0]}`);
            case 'update-assignments':
                return this.put(`/api/assignments/${args[0].userId}`, { accountIds: args[0].accountIds });
            case 'bulk-assign':
                return this.post('/api/bulk-assign', args[0]);
            case 'bulk-revoke':
                return this.post('/api/bulk-revoke', args[0]);
            case 'get-eligible-users':
                return this.get('/api/eligible-users');

            // --- Database ---
            case 'get-database-stats':
            case 'database:get-stats':
                return this.get('/api/database/stats');
            case 'database:reset':
                return this.post('/api/database/reset');

            // --- Fingerprint ---
            case 'preview-fingerprint':
                return this.post('/api/fingerprint/preview', { currentId: args[0], os: args[1] });

            // --- Automation ---
            case 'get-available-nodes':
                return this.get('/api/automation/nodes');

            // --- Ignored channels (browser-only) ---
            case 'toggle-devtools':
            case 'is-window-focused':
                return { success: true };

            default:
                console.warn('[API] Unknown channel:', channel);
                return { success: false, error: `Unknown channel: ${channel}` };
        }
    }

    // Simulate ipcRenderer.send() - fire and forget
    send(channel, data) {
        console.log('[API] Send (ignored):', channel, data);
        // These are usually for window controls which don't apply in browser context
    }

    // HTTP helpers
    async get(path) {
        const res = await fetch(this.baseUrl + path);
        return res.json();
    }

    async post(path, data = {}) {
        const res = await fetch(this.baseUrl + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    }

    async put(path, data = {}) {
        const res = await fetch(this.baseUrl + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    }

    async delete(path) {
        const res = await fetch(this.baseUrl + path, {
            method: 'DELETE'
        });
        return res.json();
    }
}

// Create global ipcRenderer shim for browser context
window.ipcRenderer = new ApiClient();

// Also expose for CommonJS-style requires
if (typeof module !== 'undefined') {
    module.exports = { ipcRenderer: window.ipcRenderer };
}

console.log('[API Client] Initialized - ipcRenderer shim ready');
