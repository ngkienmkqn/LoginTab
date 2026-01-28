const { ipcRenderer } = require('electron');

// State
let currentUser = null;

async function handleLogin() {
    try {
        const u = document.getElementById('loginUser').value;
        const p = document.getElementById('loginPass').value;

        const res = await ipcRenderer.invoke('auth-login', { username: u, password: p });
        if (res.success) {
            currentUser = res.user;
            window.currentUser = currentUser; // Expose globally for other modules

            document.getElementById('login-screen').style.display = 'none';

            // Show Main UI
            document.querySelector('.sidebar').style.display = 'flex';
            document.querySelector('.content').style.display = 'block';

            // Force refresh view state
            if (window.navigate) window.navigate('profiles');

            applyPermissions();

            // Trigger data load
            if (window.loadAllData) window.loadAllData();

            // Toggle DevTools based on Role
            console.log('User Role:', currentUser.role);
            if (currentUser.role === 'super_admin') {
                ipcRenderer.send('toggle-devtools', { visible: true });
            } else {
                ipcRenderer.send('toggle-devtools', { visible: false });
            }

            // Start 2FA loop only after login
            if (window.update2FACodes) setInterval(window.update2FACodes, 1000);

        } else {
            alert(res.error);
        }
    } catch (err) {
        alert('Login Error: ' + err.message);
    }
}

function handleLogout() {
    currentUser = null;
    window.currentUser = null;

    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';

    // Hide Main UI
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.content').style.display = 'none';

    // Clear views
    const tbody = document.getElementById('profileTableBody');
    if (tbody) tbody.innerHTML = '';

    // Hide all main content views to prevent glitches on re-login
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
}

function applyPermissions() {
    if (!currentUser) return;
    const role = currentUser.role;

    // 1. Sidebar Access
    const userTab = document.getElementById('nav-users');
    const dbTab = document.getElementById('nav-database');
    const autoTab = document.getElementById('nav-automations');

    if (role === 'super_admin') {
        if (userTab) userTab.style.display = 'block';
        if (dbTab) dbTab.style.display = 'flex';
        if (autoTab) autoTab.style.display = 'flex';
    } else if (role === 'admin') {
        if (userTab) userTab.style.display = 'block'; // Admin can manage their staff
        if (dbTab) dbTab.style.display = 'none';
        if (autoTab) autoTab.style.display = 'flex';
    } else {
        if (userTab) userTab.style.display = 'none';
        if (dbTab) dbTab.style.display = 'none';
        if (autoTab) autoTab.style.display = 'none';
    }

    // 2. Action Buttons Visibility
    const addProfileBtn = document.getElementById('btn-add-profile');
    const addProxyBtn = document.getElementById('btn-add-proxy');
    const addExtBtn = document.getElementById('btn-add-ext');
    const addPlatBtn = document.getElementById('btn-add-plat');

    if (role === 'staff') {
        if (addProfileBtn) addProfileBtn.style.display = 'none';
        if (addProxyBtn) addProxyBtn.style.display = 'none';
        if (addExtBtn) addExtBtn.style.display = 'none';
        if (addPlatBtn) addPlatBtn.style.display = 'none';
    } else {
        if (addProfileBtn) addProfileBtn.style.display = 'block';
        if (addProxyBtn) addProxyBtn.style.display = 'block';
        if (addExtBtn) addExtBtn.style.display = 'block';
        if (addPlatBtn) addPlatBtn.style.display = 'block';
    }
}

// Export to window
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.applyPermissions = applyPermissions;
