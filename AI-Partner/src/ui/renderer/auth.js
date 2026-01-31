/**
 * Authentication UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// Current user state
var currentUser = null;

/**
 * Handle login form submission
 */
async function handleLogin() {
    const username = document.getElementById('loginUsername')?.value;
    const password = document.getElementById('loginPassword')?.value;

    if (!username || !password) {
        if (typeof showToast === 'function') {
            showToast('Please enter username and password', 'warning');
        }
        return;
    }

    try {
        const result = await ipcRenderer.invoke('auth-login', { username, password });

        if (result.success) {
            currentUser = result.user;
            global.currentAuthUser = result.user;

            // Hide login screen, show main content
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainContent').style.display = 'flex';

            // Apply role-based permissions
            applyPermissions();

            // Load initial data
            if (typeof loadAllData === 'function') {
                loadAllData();
            }

            // Start status polling
            if (typeof pollProfileStatus === 'function') {
                setInterval(pollProfileStatus, 5000);
            }

            // Toggle DevTools based on role
            const showDevTools = currentUser.role === 'super_admin';
            ipcRenderer.send('toggle-devtools', { visible: showDevTools });

            if (typeof showToast === 'function') {
                showToast(`Welcome, ${currentUser.username}!`, 'success');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(result.error || 'Login failed', 'error');
            }
        }
    } catch (error) {
        console.error('[Auth] Login error:', error);
        if (typeof showToast === 'function') {
            showToast('Login failed: ' + error.message, 'error');
        }
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await ipcRenderer.invoke('auth-logout');

        currentUser = null;
        global.currentAuthUser = null;

        // Show login screen, hide main content
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';

        // Close DevTools
        ipcRenderer.send('toggle-devtools', { visible: false });

        // Clear sensitive data
        document.getElementById('loginPassword').value = '';

        if (typeof showToast === 'function') {
            showToast('Logged out successfully', 'info');
        }
    } catch (error) {
        console.error('[Auth] Logout error:', error);
    }
}

/**
 * Apply UI permissions based on current user role
 */
async function applyPermissions() {
    if (!currentUser) return;

    const role = currentUser.role;

    // Elements to show/hide based on role
    const superAdminOnly = document.querySelectorAll('[data-role="super_admin"]');
    const adminOnly = document.querySelectorAll('[data-role="admin"]');
    const staffHidden = document.querySelectorAll('[data-hide-staff="true"]');

    // Super Admin: Show everything
    if (role === 'super_admin') {
        superAdminOnly.forEach(el => el.style.display = '');
        adminOnly.forEach(el => el.style.display = '');
        staffHidden.forEach(el => el.style.display = '');
    }
    // Admin: Hide super_admin elements
    else if (role === 'admin') {
        superAdminOnly.forEach(el => el.style.display = 'none');
        adminOnly.forEach(el => el.style.display = '');
        staffHidden.forEach(el => el.style.display = '');
    }
    // Staff: Hide admin and super_admin elements
    else {
        superAdminOnly.forEach(el => el.style.display = 'none');
        adminOnly.forEach(el => el.style.display = 'none');
        staffHidden.forEach(el => el.style.display = 'none');
    }

    // Check specific permissions via IPC
    const canEditUsers = await ipcRenderer.invoke('check-permission', 'users.edit');
    const canDeleteAccounts = await ipcRenderer.invoke('check-permission', 'accounts.delete');

    // Apply permission-based visibility
    document.querySelectorAll('[data-permission="users.edit"]').forEach(el => {
        el.style.display = canEditUsers ? '' : 'none';
    });

    document.querySelectorAll('[data-permission="accounts.delete"]').forEach(el => {
        el.style.display = canDeleteAccounts ? '' : 'none';
    });
}

/**
 * Get current user
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Set current user (for external modules)
 */
function setCurrentUser(user) {
    currentUser = user;
    global.currentAuthUser = user;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleLogin,
        handleLogout,
        applyPermissions,
        getCurrentUser,
        setCurrentUser
    };
}
