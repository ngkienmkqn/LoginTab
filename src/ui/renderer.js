var { ipcRenderer } = require('electron');
console.log('Renderer.js loaded');

// TEST: Verify script is running
window.addEventListener('DOMContentLoaded', () => {
    console.log('✓ DOM Content Loaded - Renderer.js is executing!');
    setTimeout(() => {
        const loginBtn = document.querySelector('button[onclick="handleLogin()"]');
        console.log('Login button found:', !!loginBtn);
        console.log('handleLogin function exists:', typeof window.handleLogin);
    }, 100);
});

var jsQR = require('jsqr');
var protobuf = require('protobufjs');
var base32 = require('hi-base32');
var Drawflow = require('./assets/libs/drawflow.min.js');

// --- State ---
var accounts = [];
var proxies = [];
var extensions = [];
var platforms = [];
var users = [];
var allWorkflows = [];

// --- Globals ---
var editor = null;
var currentWorkflowId = null;
var workflowHasChanges = false;
var selectedNodeId = null;

// Node Templates (Global for Consistency)
var NODE_TEMPLATES = {
    start: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-play"></i> START</div>
            <div class="node-body">Trigger</div>
        </div>
    `,
    click: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-mouse-pointer"></i> Click</div>
            <div class="node-body">Click Element</div>
        </div>
    `,
    type: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-keyboard"></i> Type</div>
            <div class="node-body">Type Text</div>
        </div>
    `,
    wait: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-clock"></i> Wait</div>
            <div class="node-body">Delay/Wait</div>
        </div>
    `,
    twofa: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-shield-alt"></i> 2FA Code</div>
            <div class="node-body">Enter OTP</div>
        </div>
    `,
    find: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-search"></i> Find</div>
            <div class="node-body">Verify Element</div>
        </div>
    `,
    keyboard: `
        <div class="node-content">
            <div class="node-header"><i class="fa-solid fa-keyboard"></i> Keyboard</div>
            <div class="node-body">Press Key</div>
        </div>
    `
};

var currentUser = null; // { id, username, role }
var editingAccountId = null;
var editingPlatformId = null;
var editingUserId = null;
var proxyHealthMap = {}; // id -> { score, label }

// --- Init ---

// --- GLOBAL EXPORTS (Hoisted) ---
// We export these early so UI buttons work even if later code fails
window.addNode = addNode;
window.saveWorkflow = saveWorkflow;
window.refreshWorkflowList = refreshWorkflowList;
window.loadWorkflow = loadWorkflow;
window.createNewWorkflow = createNewWorkflow;
window.closeEditor = closeEditor;
window.filterProfiles = filterProfiles;
window.runAutomation = runAutomation;
window.showEditor = showEditor;
window.toggleNodeMenu = toggleNodeMenu;
window.toggleTheme = toggleTheme;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.deleteWorkflow = deleteWorkflow;
window.filterWorkflows = filterWorkflows; // Export filter function
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.zoomReset = zoomReset;
window.centerWorkflow = centerWorkflow;
window.clearAllWorkflows = clearAllWorkflows;

// Don't load data immediately. Wait for Login.
// Check if already logged in (persistence could be added later, for now session based)

// --- Auth Logic ---
async function handleLogin() {
    try {
        const u = document.getElementById('loginUser').value;
        const p = document.getElementById('loginPass').value;

        const res = await ipcRenderer.invoke('auth-login', { username: u, password: p });
        if (res.success) {
            currentUser = res.user;
            document.getElementById('login-screen').style.display = 'none';

            // Show Main UI
            document.querySelector('.sidebar').style.display = 'flex';
            document.querySelector('.content').style.display = 'block';

            // Force refresh view state
            navigate('profiles');

            applyPermissions();
            loadAllData();

            // Toggle DevTools based on Role
            console.log('User Role:', currentUser.role);
            if (currentUser.role === 'super_admin') {
                ipcRenderer.send('toggle-devtools', { visible: true });
            } else {
                ipcRenderer.send('toggle-devtools', { visible: false });
            }

            // Start 2FA loop only after login
            setInterval(update2FACodes, 1000);
        } else {
            alert(res.error);
        }
    } catch (err) {
        alert('Login Error: ' + err.message);
    }
}

function handleLogout() {
    currentUser = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';

    // Hide Main UI
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.content').style.display = 'none';

    // Clear views
    document.getElementById('profileTableBody').innerHTML = '';

    // Hide all main content views to prevent glitches on re-login
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
}

function applyPermissions() {
    const role = currentUser.role;

    // 1. Sidebar Access
    const userTab = document.getElementById('nav-users');
    const dbTab = document.getElementById('nav-database');
    const autoTab = document.getElementById('nav-automations');
    const automationsTab = document.getElementById('nav-automations');

    if (role === 'super_admin') {
        if (userTab) userTab.style.display = 'block';
        if (dbTab) dbTab.style.display = 'flex';
        if (autoTab) autoTab.style.display = 'flex';
    } else {
        if (userTab) userTab.style.display = 'none';
        if (dbTab) dbTab.style.display = 'none';
        if (autoTab) autoTab.style.display = 'none';
    }

    // 2. Action Buttons Visibility (Add Buttons outside tables)
    // We will handle this by simply hiding them via CSS classes or ID manipulation
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


async function loadAllData() {
    console.log('[Renderer] Loading all data...');
    try {
        // 1. Profiles (Critical)
        try {
            accounts = await ipcRenderer.invoke('get-accounts', currentUser);
        } catch (e) {
            console.error('Failed to load accounts:', e);
            alert('Critial: Failed to load accounts. ' + e.message);
        }

        // 2. Proxies
        try {
            proxies = await ipcRenderer.invoke('get-proxies');
        } catch (e) {
            console.error('Failed to load proxies:', e);
            proxies = [];
        }

        // 3. Extensions
        try {
            extensions = await ipcRenderer.invoke('get-extensions');
        } catch (e) {
            console.error('Failed to load extensions:', e);
            extensions = [];
        }

        // 4. Platforms
        try {
            platforms = await ipcRenderer.invoke('get-platforms');
        } catch (e) {
            console.error('Failed to load platforms:', e);
            platforms = [];
        }

        // 5. Users (if admin)
        if (currentUser.role === 'super_admin' || currentUser.role === 'admin') {
            try {
                users = await ipcRenderer.invoke('get-users');
                renderUserTable();
            } catch (e) { console.error('Failed to load users:', e); }
        }

        // 6. Workflows
        try {
            refreshWorkflowList();
        } catch (e) { console.error('Failed to refresh workflows:', e); }

        console.log('[Renderer] Data load complete.');
        renderTable();
        renderProxyTable();
        renderExtensionTable();
        renderPlatformTable();


    } catch (error) {
        console.error('Critical Error loading data:', error);
        alert('Failed to load application data. Please check logs.');
    }
}



// --- Navigation ---
function navigate(viewName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const navItem = document.getElementById(`nav-${viewName}`);
    if (navItem) navItem.classList.add('active');

    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(`view-${viewName}`).style.display = 'block';

    // Apply Permissions
    if (currentUser.role === 'viewer') {
        document.querySelectorAll('.btn:not(#logoutBtn)').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('button[onclick*="delete"]').forEach(btn => btn.style.display = 'none');
    }

    // Show Clear All Workflows button only for super_admin
    if (currentUser.role === 'super_admin') {
        const clearBtn = document.getElementById('btnClearWorkflows');
        if (clearBtn) clearBtn.style.display = 'block';
    } else {
        const clearBtn = document.getElementById('btnClearWorkflows');
        if (clearBtn) clearBtn.style.display = 'none';
    }

    if (viewName === 'database') {
        loadDatabaseStats();
    }
}

async function clearAllWorkflows() {
    const confirmed = confirm('⚠️ WARNING: This will DELETE ALL workflows permanently!\n\nAre you absolutely sure?');
    if (!confirmed) return;

    const doubleConfirm = confirm('This cannot be undone. Type OK to confirm.');
    if (!doubleConfirm) return;

    try {
        const res = await ipcRenderer.invoke('clear-all-workflows');
        if (res.success) {
            alert('✅ All workflows cleared successfully!');
            await refreshWorkflowList();
        } else {
            alert('❌ Error: ' + res.error);
        }
    } catch (e) {
        alert('❌ Error: ' + e.message);
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// --- Modals ---
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openModal(accountToEdit = null) {
    const modal = document.getElementById('profileModal');
    const title = modal.querySelector('h3');
    const btn = modal.querySelector('.modal-footer .btn:last-child');

    // Populate dropdowns FIRST (platforms, proxies, extensions)
    // But DON'T populate workflows yet - need platform value first
    const selPlat = document.getElementById('selPlatform');
    selPlat.innerHTML = '<option value="">-- Select a Platform --</option>';
    platforms.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        selPlat.appendChild(opt);
    });

    const selProxy = document.getElementById('selProxy');
    selProxy.innerHTML = `<option value="none">No Proxy (Direct)</option><option value="manual">+ Enter Manually...</option>`;
    proxies.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;

        // Health Text
        let healthText = '';
        if (proxyHealthMap[p.id]) {
            const s = proxyHealthMap[p.id].score;
            if (s === 4) healthText = ' [====]';
            else if (s === 3) healthText = ' [===.]';
            else if (s === 2) healthText = ' [==..]';
            else if (s === 1) healthText = ' [=...]';
            else healthText = ' [Offline]';
        }

        opt.innerText = `${p.host}:${p.port}${healthText} (${p.user || 'No Auth'})`;
        selProxy.appendChild(opt);
    });

    const selExt = document.getElementById('selExt');
    selExt.innerHTML = `<option value="none">No Extension</option><option value="manual">+ Enter Path Manually...</option>`;
    extensions.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.innerText = e.name;
        selExt.appendChild(opt);
    });

    // Toggle QR Button
    const btnScan = document.getElementById('btn-scan-qr');
    if (btnScan) {
        btnScan.style.display = (currentUser && currentUser.role === 'super_admin') ? 'block' : 'none';
    }

    if (accountToEdit) {
        editingAccountId = accountToEdit.id;
        title.innerText = 'Edit Browser Profile';
        btn.innerText = 'Save Changes';
        document.getElementById('inpName').value = accountToEdit.name;
        document.getElementById('inpUrl').value = accountToEdit.loginUrl || '';
        document.getElementById('inpOS').value = 'win';

        document.getElementById('inpAuthUser').value = accountToEdit.auth?.username || '';
        document.getElementById('inpAuthPass').value = accountToEdit.auth?.password || '';
        document.getElementById('inpAuth2FA').value = accountToEdit.auth?.secret2FA || '';

        if (accountToEdit.proxy) {
            document.getElementById('selProxy').value = 'manual';
            toggleManualProxy();
            document.getElementById('inpProxyHost').value = accountToEdit.proxy.host || '';
            document.getElementById('inpProxyPort').value = accountToEdit.proxy.port || '';
            document.getElementById('inpProxyUser').value = accountToEdit.proxy.user || '';
            document.getElementById('inpProxyPass').value = accountToEdit.proxy.pass || '';
        } else {
            document.getElementById('selProxy').value = 'none';
            toggleManualProxy();
        }

        if (accountToEdit.extensionsPath) {
            document.getElementById('selExt').value = 'manual';
            toggleManualExt();
            document.getElementById('inpExtPath').value = accountToEdit.extensionsPath;
        } else {
            document.getElementById('selExt').value = 'none';
            toggleManualExt();
        }

        document.getElementById('inpUA').value = accountToEdit.fingerprint?.userAgent || '';
        document.getElementById('inpRes').value = accountToEdit.fingerprint?.resolution || '1920x1080';

        // Populate Advanced Fingerprint Details
        const fp = accountToEdit.fingerprint || {};
        document.getElementById('fpHardware').value = fp.hardwareConcurrency || 'Auto';
        document.getElementById('fpMemory').value = fp.deviceMemory || 'Auto';
        document.getElementById('fpRenderer').value = fp.webglRenderer || 'Auto';

        // Format Canvas/Audio info
        const cNoise = (fp.canvasNoise && fp.canvasNoise.shift !== undefined)
            ? `Shift: ${fp.canvasNoise.shift}, CH: ${['R', 'G', 'B', 'A'][fp.canvasNoise.channel]}`
            : 'Pending (Launch to fix)'; // Show meaningful status
        document.getElementById('fpCanvas').value = cNoise;

        const aNoise = (fp.audioNoise !== undefined)
            ? `Offset: ${Number(fp.audioNoise).toFixed(7)}`
            : 'Pending (Launch to fix)';
        document.getElementById('fpAudio').value = aNoise;

        document.getElementById('inpNotes').value = accountToEdit.notes || '';
        // Set platform FIRST before populating workflows (so filtering works)
        document.getElementById('selPlatform').value = accountToEdit.platform_id || "";

        // Now populate workflow dropdown with filtering based on platform
        populateWorkflowDropdown();

        // Set workflow value after dropdown is populated
        if (document.getElementById('selWorkflow')) {
            document.getElementById('selWorkflow').value = accountToEdit.workflow_id || "";
        }

    } else {
        editingAccountId = null;
        title.innerText = 'New Browser Profile';
        btn.innerText = 'Create Profile';
        document.querySelectorAll('input').forEach(i => i.value = '');
        document.getElementById('selProxy').value = 'none';
        document.getElementById('selExt').value = 'none';
        document.getElementById('selPlatform').value = "";
        if (document.getElementById('selWorkflow')) {
            document.getElementById('selWorkflow').value = "";
        }
        toggleManualProxy();
        toggleManualExt();
        randomUA();

        // Clear Advanced Fingerprint Details
        document.getElementById('fpHardware').value = '';
        document.getElementById('fpMemory').value = '';
        document.getElementById('fpRenderer').value = '';
        document.getElementById('fpCanvas').value = '';
        document.getElementById('fpAudio').value = '';
    }

    // Re-populate workflows when platform changes
    const platformSelect = document.getElementById('selPlatform');
    platformSelect.addEventListener('change', populateWorkflowDropdown, { once: true });

    modal.classList.add('active');
}

function openUserModal(userToEdit = null) {
    const modal = document.getElementById('userModal');
    if (userToEdit) {
        editingUserId = userToEdit.id;
        document.getElementById('uName').value = userToEdit.username;
        document.getElementById('uPass').value = userToEdit.password;
        document.getElementById('uRole').value = userToEdit.role;
    } else {
        editingUserId = null;
        document.getElementById('uName').value = '';
        document.getElementById('uPass').value = '';
        document.getElementById('uRole').value = 'staff';
    }
    modal.classList.add('active');
}


function openExtensionModal() { document.getElementById('extensionModal').classList.add('active'); }
function openPlatformModal(platformToEdit = null) {
    const modal = document.getElementById('platformModal');
    const title = modal.querySelector('h3');
    const btn = modal.querySelector('.modal-footer .btn:last-child');

    if (platformToEdit) {
        editingPlatformId = platformToEdit.id;
        title.innerText = 'Edit Platform';
        btn.innerText = 'Save Changes';
        document.getElementById('newPlatName').value = platformToEdit.name;
        document.getElementById('newPlatUrl').value = platformToEdit.url;
    } else {
        editingPlatformId = null;
        title.innerText = 'Add Platform';
        btn.innerText = 'Save Preset';
        document.getElementById('newPlatName').value = '';
        document.getElementById('newPlatUrl').value = '';
    }
    modal.classList.add('active');
}

function populateDropdowns() {
    const selProxy = document.getElementById('selProxy');
    selProxy.innerHTML = `<option value="none">No Proxy (Direct)</option><option value="manual">+ Enter Manually...</option>`;
    proxies.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;

        // Health Text
        let healthText = '';
        if (proxyHealthMap[p.id]) {
            const s = proxyHealthMap[p.id].score;
            if (s === 4) healthText = ' [====]';
            else if (s === 3) healthText = ' [===.]';
            else if (s === 2) healthText = ' [==..]';
            else if (s === 1) healthText = ' [=...]';
            else healthText = ' [Offline]';
        }

        opt.innerText = `${p.host}:${p.port}${healthText} (${p.user || 'No Auth'})`;
        selProxy.appendChild(opt);
    });

    const selExt = document.getElementById('selExt');
    selExt.innerHTML = `<option value="none">No Extension</option><option value="manual">+ Enter Path Manually...</option>`;
    extensions.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.innerText = e.name;
        selExt.appendChild(opt);
    });

    const selPlat = document.getElementById('selPlatform');
    selPlat.innerHTML = `<option value="">-- Select a Platform --</option>`;
    platforms.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        opt.innerText = p.name;
        selPlat.appendChild(opt);
    });

    // Populate workflow dropdown (filtered by platform)
    populateWorkflowDropdown();
}

// Separate function to populate workflow dropdown with platform filtering
function populateWorkflowDropdown() {
    const selWork = document.getElementById('selWorkflow');
    if (!selWork) return;

    selWork.innerHTML = `<option value="">-- No Workflow --</option>`;

    const currentPlatformId = document.getElementById('selPlatform')?.value;

    if (allWorkflows && allWorkflows.length > 0) {
        allWorkflows.forEach(w => {
            // Filter: only show workflows matching profile's platform or "all" platform
            if (currentPlatformId && w.platform !== 'all' && w.platform !== currentPlatformId) {
                return; // Skip this workflow
            }

            const opt = document.createElement('option');
            opt.value = w.id;
            opt.innerText = w.name;
            selWork.appendChild(opt);
        });
    }
}

function applyPlatformPreset() {
    const id = document.getElementById('selPlatform').value;
    if (!id) return;
    const p = platforms.find(x => x.id === id);
    if (p) {
        document.getElementById('inpName').value = p.name + ' Account';
        document.getElementById('inpUrl').value = p.url;
    }
}

function toggleManualProxy() {
    const val = document.getElementById('selProxy').value;
    const area = document.getElementById('manualProxyArea');
    if (val === 'manual') area.classList.add('active');
    else area.classList.remove('active');
}

function toggleManualExt() {
    const val = document.getElementById('selExt').value;
    const area = document.getElementById('manualExtArea');
    if (val === 'manual') area.classList.add('active');
    else area.classList.remove('active');
}

function randomUA() {
    const os = ['Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15_7', 'X11; Linux x86_64'];
    const selectedOS = os[Math.floor(Math.random() * os.length)];
    const chromeVer = Math.floor(Math.random() * 20) + 110;
    document.getElementById('inpUA').value = `Mozilla/5.0 (${selectedOS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.0.0 Safari/537.36`;
}

// --- CRUD Logic ---

// USER
async function saveUser() {
    const username = document.getElementById('uName').value;
    const password = document.getElementById('uPass').value;
    const role = document.getElementById('uRole').value;

    if (!username || !password) return alert('Missing fields');

    await ipcRenderer.invoke('save-user', { id: editingUserId, username, password, role });
    closeModal('userModal');
    loadAllData();
}

async function deleteUser(id) {
    if (confirm('Delete User?')) {
        const res = await ipcRenderer.invoke('delete-user', id);
        if (!res.success) alert(res.error);
        loadAllData();
    }
}


// PROXY
var editingProxyId = null;

function openProxyModal(proxyToEdit = null) {
    const modal = document.getElementById('proxyModal');
    const title = modal.querySelector('h3');
    const btn = modal.querySelector('.modal-footer .btn:last-child');

    if (proxyToEdit) {
        editingProxyId = proxyToEdit.id;
        title.innerText = 'Edit Proxy';
        btn.innerText = 'Save Changes';
        document.getElementById('newProxyType').value = proxyToEdit.type || 'http';
        document.getElementById('newProxyHost').value = proxyToEdit.host;
        document.getElementById('newProxyPort').value = proxyToEdit.port;
        document.getElementById('newProxyUser').value = proxyToEdit.user;
        document.getElementById('newProxyPass').value = proxyToEdit.pass;
    } else {
        editingProxyId = null;
        title.innerText = 'Add New Proxy';
        btn.innerText = 'Add to Pool';
        document.getElementById('newProxyType').value = 'http';
        document.getElementById('newProxyHost').value = '';
        document.getElementById('newProxyPort').value = '';
        document.getElementById('newProxyUser').value = '';
        document.getElementById('newProxyPass').value = '';
    }
    modal.classList.add('active');
}

async function saveNewProxy() {
    const type = document.getElementById('newProxyType').value;
    const host = document.getElementById('newProxyHost').value;
    const port = document.getElementById('newProxyPort').value;
    const user = document.getElementById('newProxyUser').value;
    const pass = document.getElementById('newProxyPass').value;

    if (!host || !port) return alert('Host/Port required');

    const payload = { type, host, port, user, pass };
    if (editingProxyId) payload.id = editingProxyId;

    await ipcRenderer.invoke('save-proxy', payload);
    closeModal('proxyModal');
    loadAllData();
}

async function deleteProxy(id) {
    if (confirm('Delete Proxy?')) {
        await ipcRenderer.invoke('delete-proxy', id);
        loadAllData();
    }
}

// EXTENSION
async function saveNewExtension() {
    const name = document.getElementById('newExtName').value;
    const path = document.getElementById('newExtPath').value;
    if (!name || !path) return alert('Required');
    await ipcRenderer.invoke('save-extension', { name, path });
    closeModal('extensionModal');
    loadAllData();
}

async function deleteExtension(id) {
    if (confirm('Delete Extension?')) {
        await ipcRenderer.invoke('delete-extension', id);
        loadAllData();
    }
}

// PLATFORM
async function savePlatform() {
    const name = document.getElementById('newPlatName').value;
    const url = document.getElementById('newPlatUrl').value;
    if (!name) return alert('Name required');
    if (editingPlatformId) {
        await ipcRenderer.invoke('update-platform', { id: editingPlatformId, name, url });
    } else {
        await ipcRenderer.invoke('save-platform', { name, url });
    }
    closeModal('platformModal');
    loadAllData();
}

async function deletePlatform(id) {
    if (confirm('Delete Platform?')) {
        await ipcRenderer.invoke('delete-platform', id);
        loadAllData();
    }
}


// Helper for random GPU
function getRandomGPU() {
    const gpus = [
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 570 Direct3D11 vs_5_0 ps_5_0, D3D11)"
    ];
    return gpus[Math.floor(Math.random() * gpus.length)];
}

// PROFILE
async function saveProfile() {
    const name = document.getElementById('inpName').value;
    const loginUrl = document.getElementById('inpUrl').value;
    if (!name) return alert('Name Required');

    // Proxy Resolve
    let proxy = null;
    const proxyChoice = document.getElementById('selProxy').value;
    if (proxyChoice === 'manual') {
        const host = document.getElementById('inpProxyHost').value;
        const port = document.getElementById('inpProxyPort').value;
        const type = document.getElementById('inpProxyType').value;
        if (host && port) {
            proxy = {
                type,
                host, port,
                user: document.getElementById('inpProxyUser').value,
                pass: document.getElementById('inpProxyPass').value
            };
        }
    } else if (proxyChoice !== 'none') {
        const p = proxies.find(x => x.id === proxyChoice);
        if (p) {
            proxy = {
                type: p.type || 'http', // Copy type from pool
                host: p.host,
                port: p.port,
                user: p.user,
                pass: p.pass
            };
        }
    }

    // Extension Resolve
    let extPath = '';
    const extChoice = document.getElementById('selExt').value;
    if (extChoice === 'manual') {
        extPath = document.getElementById('inpExtPath').value;
    } else if (extChoice !== 'none') {
        const e = extensions.find(x => x.id === extChoice);
        if (e) extPath = e.path;
    }

    // FINGERPRINT GENERATION
    let fingerprint = {
        userAgent: document.getElementById('inpUA').value,
        resolution: document.getElementById('inpRes').value
    };

    // If updating, preserve existing seeds/hardware
    if (editingAccountId) {
        const acc = accounts.find(a => a.id === editingAccountId);
        if (acc && acc.fingerprint) {
            // Merge existing keys
            fingerprint = { ...acc.fingerprint, ...fingerprint };
        }
    }

    // Fill missing hardware info (Consistent Generation)
    if (!fingerprint.deviceMemory) fingerprint.deviceMemory = [4, 8, 16, 32][Math.floor(Math.random() * 4)];
    if (!fingerprint.hardwareConcurrency) fingerprint.hardwareConcurrency = [4, 8, 12, 16, 24][Math.floor(Math.random() * 5)];
    if (!fingerprint.webglRenderer) fingerprint.webglRenderer = getRandomGPU();
    if (!fingerprint.webglVendor) fingerprint.webglVendor = "Google Inc. (NVIDIA)";

    // (Optional) Seeds for future robust noise injection
    // if (!fingerprint.canvasSeed) fingerprint.canvasSeed = Math.floor(Math.random() * 1000000);

    const payload = {
        name,
        loginUrl,
        extensionsPath: extPath,
        proxy,
        auth: {
            username: document.getElementById('inpAuthUser').value,
            password: document.getElementById('inpAuthPass').value,
            twoFactorSecret: document.getElementById('inpAuth2FA').value
        },
        fingerprint,
        notes: document.getElementById('inpNotes').value,
        platformId: document.getElementById('selPlatform').value,
        workflowId: document.getElementById('selWorkflow')?.value || null
    };

    let res;
    if (editingAccountId) {
        payload.id = editingAccountId;
        res = await ipcRenderer.invoke('update-account', payload);
    } else {
        res = await ipcRenderer.invoke('create-account', payload);
    }

    if (res.success) {
        closeModal('profileModal');
        loadAllData();
    } else {
        alert('Error: ' + res.error);
    }
}

async function remove(id, name) {
    if (confirm('Delete ' + name + '?')) {
        await ipcRenderer.invoke('delete-account', id);
        loadAllData();
    }
}

function launch(id) {
    ipcRenderer.invoke('launch-browser', id);
}

function editAccount(id) {
    const acc = accounts.find(a => a.id === id);
    if (acc) openModal(acc);
}

function editPlatform(id) {
    const p = platforms.find(x => x.id === id);
    if (p) openPlatformModal(p);
}

// --- Renderers ---

function renderTable() {
    console.log('[Renderer] Rendering Table. Accounts:', accounts.length);
    const tbody = document.getElementById('profileTableBody');
    if (!tbody) {
        console.error('Table Body not found!');
        return;
    }
    tbody.innerHTML = '';

    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666">No profiles found</td></tr>';
        return;
    }

    const canEdit = currentUser && currentUser.role !== 'staff';
    const isSuperAdmin = currentUser && currentUser.role === 'super_admin';

    // Populate Dynamic Platform Filter
    const filterSelect = document.getElementById('filterPlatform');
    if (filterSelect) {
        // Collect unique platforms from current accounts
        const existingPlatforms = new Set();
        accounts.forEach(acc => {
            if (acc.platform_id) {
                const p = platforms.find(pl => pl.id === acc.platform_id);
                if (p) existingPlatforms.add(p.name);
            }
        });

        // Add options
        const currentVal = filterSelect.value;
        let opts = `<option value="all">All Platforms</option>`;
        existingPlatforms.forEach(pName => {
            opts += `<option value="${pName}">${pName}</option>`;
        });
        filterSelect.innerHTML = opts;
        filterSelect.value = currentVal;
    }



    // Show/hide columns based on role
    const th2FA = document.getElementById('th-2fa-code');
    const thNotes = document.getElementById('th-notes');
    if (th2FA) th2FA.style.display = isSuperAdmin ? '' : 'none';
    if (thNotes) thNotes.style.display = '';

    accounts.forEach(acc => {
        const tr = document.createElement('tr');

        // Checkbox for bulk
        const isSelected = selectedAccountIds.has(acc.id) ? 'checked' : '';
        const checkboxTd = `<td><input type="checkbox" class="profile-checkbox" value="${acc.id}" ${isSelected} onclick="onAccountSelect(event)"></td>`;

        // Proxy Badge with Health
        let proxyDisplay = '<span style="color:#666">No Proxy</span>';
        if (acc.proxy && acc.proxy.host) {
            // Identifier for live updates
            const pHost = acc.proxy.host;
            const pPort = acc.proxy.port;

            proxyDisplay = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="proxy-badge">${pHost}:${pPort}</span>
                    <div class="live-proxy-health" data-host="${pHost}" data-port="${pPort}" style="display:flex; gap:2px; align-items:flex-end; height:12px; width:16px;" title="Health Status">
                        <div style="width:3px; height:25%; background:#444; border-radius:1px;"></div>
                        <div style="width:3px; height:50%; background:#444; border-radius:1px;"></div>
                        <div style="width:3px; height:75%; background:#444; border-radius:1px;"></div>
                        <div style="width:3px; height:100%; background:#444; border-radius:1px;"></div>
                    </div>
                </div>
            `;
        }

        // 2FA Badge (only for superadmin)
        let codeDisplay = '<span style="color:#666">No</span>';
        if (isSuperAdmin && acc.auth && acc.auth.secret2FA) {
            codeDisplay = '<span style="color:#2ecc71">Yes</span>';
        }

        // Notes Display (for non-superadmin)
        let notesDisplay = '<span style="color:#666; font-style:italic">No notes</span>';
        if (acc.notes) {
            const truncated = acc.notes.length > 30 ? acc.notes.substring(0, 30) + '...' : acc.notes;
            notesDisplay = `<span style="color:#ddd" title="${acc.notes.replace(/"/g, '&quot;')}">${truncated}</span>`;
        }

        // Last Active Display
        let lastActiveDisplay = '<span style="color:#666">Never</span>';
        if (acc.lastActive) {
            const date = new Date(acc.lastActive);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) lastActiveDisplay = '<span style="color:#2ecc71">Just now</span>';
            else if (diffMins < 60) lastActiveDisplay = `<span style="color:#3498db">${diffMins}m ago</span>`;
            else if (diffMins < 1440) lastActiveDisplay = `<span style="color:#f39c12">${Math.floor(diffMins / 60)}h ago</span>`;
            else lastActiveDisplay = `<span style="color:#95a5a6">${Math.floor(diffMins / 1440)}d ago</span>`;
        }

        // Action Buttons
        let actions = `
            <button class="btn" style="padding:6px 12px; font-size:12px" onclick="launch('${acc.id}')"><i class="fa-solid fa-rocket"></i> Open</button>
        `;

        if (canEdit) {
            actions += `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="runAutomation('${acc.id}')" title="Run Automation"><i class="fa-solid fa-robot"></i></button>
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="editAccount('${acc.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="remove('${acc.id}', '${acc.name}')"><i class="fa-solid fa-trash"></i></button>
            `;
        }

        // Platform Display
        let platformDisplay = '<span style="color:#666">--</span>';
        if (acc.platform_id) {
            const p = platforms.find(pl => pl.id === acc.platform_id);
            if (p) platformDisplay = `<span style="color:#a855f7; font-weight:500">${p.name}</span>`;
        }

        tr.innerHTML = `
            ${checkboxTd}
            <td>
                <div style="font-weight:600">${acc.name}</div>
                <div style="font-size:12px; color:#666">ID: ${acc.id.substring(0, 6)}...</div>
            </td>
            <td><span class="status-badge">Active</span></td>
            <td>${platformDisplay}</td>
            <td style="display:${isSuperAdmin ? '' : 'none'}">${codeDisplay}</td>
            <td>${notesDisplay}</td>
            <td>${lastActiveDisplay}</td>
            <td>${proxyDisplay}</td>
            <td style="text-align:right">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
    // Immediately attempt to load 2FA if data exists
    if (accounts.length > 0 && isSuperAdmin) update2FACodes();
}

function renderProxyTable() {
    const tbody = document.getElementById('proxyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = currentUser && currentUser.role !== 'staff';

    proxies.forEach(p => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            actions = `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick='openProxyModal(${JSON.stringify(p)})'><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="deleteProxy('${p.id}')"><i class="fa-solid fa-trash"></i></button>
            `;
        } else {
            actions = '<span style="color:#666">ReadOnly</span>';
        }

        // Unique ID for health badge
        const healthId = `proxy-health-${p.id}`;

        tr.innerHTML = `
            <td>
                <div>${p.host}:${p.port}</div>
                <div style="font-size:12px; color:#555">${p.type.toUpperCase()}</div>
            </td>
            <td>${p.user || '--'}</td>
            <td>${p.pass ? '******' : '--'}</td>
            <td>
                <!-- Signal Bars Container -->
                <div id="${healthId}" style="display:flex; gap:3px; align-items:flex-end; height:16px; width:24px; cursor:pointer;" title="Click to Test" onclick="testProxyHealth('${p.id}', '${p.type}', '${p.host}', '${p.port}', '${p.user}', '${p.pass}')">
                    <div style="width:4px; height:25%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:50%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:75%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:100%; background:#444; border-radius:1px;"></div>
                </div>
            </td>
            <td>${actions}</td>
        `;
        tbody.appendChild(tr);

        // Initial Check
        setTimeout(() => testProxyHealth(p.id, p.type, p.host, p.port, p.user, p.pass), 500);
    });

    // Clear existing interval if any
    if (window.proxyHealthInterval) clearInterval(window.proxyHealthInterval);

    // Continuous Real-Time Check (every 10 seconds)
    window.proxyHealthInterval = setInterval(() => {
        proxies.forEach(p => {
            // Test if Proxy View OR Profile View is visible
            const proxyView = document.getElementById('view-proxies');
            const profileView = document.getElementById('view-profiles');
            const isProxyVisible = proxyView && proxyView.style.display !== 'none';
            const isProfileVisible = profileView && profileView.style.display !== 'none';

            if (isProxyVisible || isProfileVisible) {
                testProxyHealth(p.id, p.type, p.host, p.port, p.user, p.pass);
            }
        });
    }, 10000);
}

// Function to call IPC for health check
async function testProxyHealth(id, type, host, port, user, pass) {
    const el = document.getElementById(`proxy-health-${id}`);
    if (!el) return;

    // Set to loading state (pulse animation?)
    const bars = el.querySelectorAll('div');
    bars.forEach(b => b.style.background = '#666'); // Reset

    const proxy = { type, host, port: parseInt(port), user: user === 'undefined' ? '' : user, pass: pass === 'undefined' ? '' : pass };
    const res = await ipcRenderer.invoke('check-proxy-health', proxy);

    if (res.success) {
        const score = res.score; // 0-4
        const color = res.color;

        // Save to map
        proxyHealthMap[id] = { score, label: res.label, color };

        // Update Main Proxy Table Bar
        bars.forEach((b, index) => {
            if (index < score) {
                b.style.background = color;
            } else {
                b.style.background = '#444';
            }
        });
        el.title = `Status: ${res.label}`;

        // Sync to Profile Table (Live Update)
        const profileBars = document.querySelectorAll(`.live-proxy-health[data-host="${host}"][data-port="${port}"]`);
        profileBars.forEach(wrapper => {
            const divs = wrapper.querySelectorAll('div');
            divs.forEach((d, idx) => {
                if (idx < score) d.style.background = color;
                else d.style.background = '#444';
            });
            wrapper.title = `Status: ${res.label}`;
        });

    } else {
        // Error state (red X or just red bar 0)
        proxyHealthMap[id] = { score: 0, label: 'Offline', color: '#e74c3c' };

        bars.forEach(b => b.style.background = '#e74c3c');
        el.title = 'Connection Failed';

        // Sync to Profile Table (Error)
        const profileBars = document.querySelectorAll(`.live-proxy-health[data-host="${host}"][data-port="${port}"]`);
        profileBars.forEach(wrapper => {
            const divs = wrapper.querySelectorAll('div');
            divs.forEach(d => d.style.background = '#e74c3c');
            wrapper.title = 'Connection Failed';
        });
    }
}

function renderExtensionTable() {
    const tbody = document.getElementById('extensionTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = currentUser && currentUser.role !== 'staff';

    extensions.forEach(e => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            actions = `<button class="btn btn-danger" onclick="deleteExtension('${e.id}')"><i class="fa-solid fa-trash"></i></button>`;
        } else {
            actions = '<span style="color:#666">ReadOnly</span>';
        }

        tr.innerHTML = `
            <td style="font-weight:600">${e.name}</td>
            <td style="font-family:monospace; color:#ccc; font-size:12px;">${e.path}</td>
            <td>${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPlatformTable() {
    const tbody = document.getElementById('platformTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = currentUser && currentUser.role !== 'staff';

    platforms.forEach(p => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            actions = `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="editPlatform('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="deletePlatform('${p.id}')"><i class="fa-solid fa-trash"></i></button>
            `;
        } else {
            actions = '<span style="color:#666">ReadOnly</span>';
        }

        tr.innerHTML = `
            <td><span style="font-weight:600; color: var(--accent)">${p.name}</span></td>
            <td><a href="#" style="color:var(--accent)" onclick="require('electron').shell.openExternal('${p.url}')">${p.url}</a></td>
            <td style="text-align:right">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}
function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        let roleBadge = '<span class="status-badge" style="background:#444">Staff</span>';
        if (u.role === 'admin') roleBadge = '<span class="status-badge" style="background:var(--accent)">Admin</span>';
        if (u.role === 'super_admin') roleBadge = '<span class="status-badge" style="background:linear-gradient(45deg, #FFD700, #DAA520); color:black">Super Admin</span>';

        tr.innerHTML = `
            <td>${u.username}</td>
            <td>${roleBadge}</td>
            <td style="text-align:right">
                <button class="btn btn-secondary" style="padding:5px 10px; font-size:12px;" onclick="openAssignmentModal('${u.id}', '${u.username}')">
                    <i class="fa-solid fa-link"></i> Assign
                </button>
                <button class="btn btn-secondary" onclick="openUserModal({id:'${u.id}', username:'${u.username}', password:'${u.password}', role:'${u.role}'})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Assignments ---
var currentAssigningUserId = null;

async function openAssignmentModal(userId, username) {
    currentAssigningUserId = userId;
    document.getElementById('assignModalTitle').innerText = `Assign Accounts to ${username}`;

    // Load all accounts (admin view) and current assignments
    const allAccounts = await ipcRenderer.invoke('get-accounts', { role: 'admin' });
    const assignedIds = await ipcRenderer.invoke('get-assignments', userId);

    const container = document.getElementById('assignmentList');
    container.innerHTML = '';

    allAccounts.forEach(acc => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.marginBottom = '10px';
        const isChecked = assignedIds.includes(acc.id) ? 'checked' : '';
        div.innerHTML = `
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                <input type="checkbox" name="assignAcc" value="${acc.id}" ${isChecked}>
                <span>${acc.name} (${acc.loginUrl})</span>
            </label>
        `;
        container.appendChild(div);
    });

    document.getElementById('assignmentModal').classList.add('active');
}

async function saveAssignments() {
    const checkboxes = document.querySelectorAll('input[name="assignAcc"]:checked');
    const accountIds = Array.from(checkboxes).map(cb => cb.value);

    const res = await ipcRenderer.invoke('update-assignments', {
        userId: currentAssigningUserId,
        accountIds
    });

    if (res.success) {
        closeModal('assignmentModal');
    } else {
        alert('Failed to update: ' + res.error);
    }
}

// --- Bulk Assignments ---
var selectedAccountIds = new Set();
var bulkMode = 'assign'; // 'assign' or 'revoke'

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

function onAccountSelect(event) {
    const cb = event.target;
    if (cb.checked) selectedAccountIds.add(cb.value);
    else selectedAccountIds.delete(cb.value);
    updateSelectedHeader();
}

function updateSelectedHeader() {
    const count = selectedAccountIds.size;
    const bar = document.getElementById('bulk-actions');
    const label = document.getElementById('selected-count');
    if (count > 0) {
        bar.style.display = 'flex';
        label.innerText = `${count} accounts selected`;
    } else {
        bar.style.display = 'none';
        if (document.getElementById('selectAllProfiles')) document.getElementById('selectAllProfiles').checked = false;
    }
}

async function openBulkAssignModal(mode) {
    bulkMode = mode || 'assign';

    // Update Modal UI
    const title = document.getElementById('bulkModalTitle');
    const desc = document.getElementById('bulkModalDesc');
    const btn = document.getElementById('bulkSubmitBtn');

    // Fallbacks if elements are missing (newly added in HTML)
    if (title) title.innerText = bulkMode === 'assign' ? 'Assign Selected Accounts' : 'Revoke Access';
    if (desc) desc.innerText = bulkMode === 'assign' ? 'Choose users who should GAIN access to these accounts.' : 'Choose users who should LOSE access to these accounts.';
    if (btn) {
        btn.innerText = bulkMode === 'assign' ? 'Give Access' : 'Revoke Access';
        btn.className = bulkMode === 'assign' ? 'btn' : 'btn btn-danger';
    }

    const eligibleUsers = await ipcRenderer.invoke('get-eligible-users', currentUser.role);

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

async function saveBulkAssignments() {
    const userCheckboxes = document.querySelectorAll('input[name="targetUser"]:checked');
    const userIds = Array.from(userCheckboxes).map(cb => cb.value);

    if (userIds.length === 0) return alert('Select at least one user');

    const accountIds = Array.from(selectedAccountIds);
    let res;

    if (bulkMode === 'assign') {
        res = await ipcRenderer.invoke('bulk-assign', { accountIds, userIds });
    } else {
        res = await ipcRenderer.invoke('bulk-revoke', { accountIds, userIds });
    }

    if (res.success) {
        alert(`${bulkMode === 'assign' ? 'Assigned' : 'Revoked'} successfully.`);
        selectedAccountIds.clear();
        closeModal('bulkAssignModal');
        loadAllData();
    } else {
        alert('Operation failed: ' + res.error);
    }
}

// 2FA Utils
async function update2FACodes() {
    if (!currentUser) return; // Don't run if not logged in
    const accountsWith2FA = accounts.filter(a => a.auth && a.auth.secret2FA);
    if (accountsWith2FA.length === 0) return;
    const codes = await ipcRenderer.invoke('get-2fa-codes', accountsWith2FA.map(a => ({ id: a.id, secret: a.auth.secret2FA })));
    codes.forEach(item => {
        const el = document.getElementById(`otp-${item.id}`);
        if (el) el.innerText = item.token;
    });
}

// UI Utils
function filterTable(input, tbodyId) {
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById(tbodyId);
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        let visible = false;
        const cells = rows[i].getElementsByTagName('td');
        for (let j = 0; j < cells.length; j++) {
            if (cells[j]) {
                const txtValue = cells[j].textContent || cells[j].innerText;
                if (txtValue.toLowerCase().indexOf(filter) > -1) {
                    visible = true;
                    break;
                }
            }
        }
        rows[i].style.display = visible ? "" : "none";
    }
}

function copyCode(id) {
    const el = document.getElementById(`otp-${id}`);
    if (el) {
        navigator.clipboard.writeText(el.innerText);
        const originalText = el.innerText;
        el.innerText = "COPIED";
        setTimeout(() => el.innerText = originalText, 1000);
    }
}

// DATABASE STATS
async function loadDatabaseStats() {
    const configEl = document.getElementById('db-config-content');
    const statsEl = document.getElementById('db-stats-content');
    const tablesEl = document.getElementById('db-tables-content');

    if (!configEl) return;

    configEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    try {
        const data = await ipcRenderer.invoke('get-database-stats');

        // Render Config
        configEl.innerHTML = `
            <div><strong>Host:</strong> ${data.config.host}</div>
            <div><strong>Port:</strong> ${data.config.port}</div>
            <div><strong>Database:</strong> ${data.config.database}</div>
            <div><strong>User:</strong> ${data.config.user}</div>
            <div><strong>SSL:</strong> ${data.config.ssl ? 'Enabled' : 'Disabled'}</div>
        `;

        // Render Stats
        statsEl.innerHTML = `
            <div><strong>Status:</strong> <span style="color:${data.status === 'Connected' ? 'var(--success)' : 'var(--danger)'}">${data.status}</span></div>
            <div><strong>Version:</strong> ${data.version}</div>
            <div><strong>Size:</strong> ${data.sizeMB} MB (approx)</div>
            <div><strong>Connections:</strong> ${data.pool.activeConnections} / ${data.pool.connectionLimit}</div>
        `;

        // Render Tables
        tablesEl.innerHTML = '';
        Object.entries(data.tables).forEach(([table, count]) => {
            const card = document.createElement('div');
            card.innerHTML = `
                <div style="font-size:24px; color:var(--accent); font-weight:bold;">${count}</div>
                <div style="text-transform:uppercase; font-size:12px; color:var(--text-muted);">${table}</div>
             `;
            card.style.textAlign = 'center';
            card.style.background = 'var(--bg-body)';
            card.style.padding = '15px';
            card.style.borderRadius = '8px';
            card.style.minWidth = '100px';
            tablesEl.appendChild(card);
        });

    } catch (err) {
        if (configEl) configEl.innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
    }
}

// QR Code Scanning
// Protobuf Schema for Google Auth Migration
var root = protobuf.Root.fromJSON({
    nested: {
        MigrationPayload: {
            fields: {
                otpParameters: { rule: "repeated", type: "OtpParameters", id: 1 },
                version: { type: "int32", id: 2 },
                batchSize: { type: "int32", id: 3 },
                batchIndex: { type: "int32", id: 4 },
                batchId: { type: "int32", id: 5 }
            }
        },
        OtpParameters: {
            fields: {
                secret: { type: "bytes", id: 1 },
                name: { type: "string", id: 2 },
                issuer: { type: "string", id: 3 },
                algorithm: { type: "int32", id: 4 },
                digits: { type: "int32", id: 5 },
                type: { type: "int32", id: 6 },
                counter: { type: "int64", id: 7 }
            }
        }
    }
});
var MigrationPayload = root.lookupType("MigrationPayload");

function triggerQRScan() {
    const input = document.getElementById('qrInput');
    if (input) input.click();
}

async function processQR(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            try {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    console.log('QR Raw:', code.data);
                    let secret = null;

                    if (code.data.startsWith('otpauth://')) {
                        try {
                            const url = new URL(code.data);
                            secret = url.searchParams.get('secret');
                        } catch (e) { }
                    } else if (code.data.startsWith('otpauth-migration://')) {
                        try {
                            const url = new URL(code.data);
                            const dataDetails = url.searchParams.get('data');
                            if (dataDetails) {
                                const buffer = Buffer.from(dataDetails, 'base64');
                                const message = MigrationPayload.decode(buffer);
                                const object = MigrationPayload.toObject(message, { includesDefault: true });

                                if (object.otpParameters && object.otpParameters.length > 0) {
                                    const acc = object.otpParameters[0];
                                    if (acc.secret) {
                                        secret = base32.encode(acc.secret).replace(/=/g, '');
                                        alert(`Found Account: ${acc.name}\nIssuer: ${acc.issuer || 'Unknown'}`);
                                    }
                                }
                            }
                        } catch (e) {
                            alert('Migration Decode Failed: ' + e.message);
                        }
                    } else if (code.data.match(/^[A-Z2-7=]+$/i)) {
                        secret = code.data;
                    }

                    if (secret) {
                        document.getElementById('inpAuth2FA').value = secret;
                    } else if (!code.data.startsWith('otpauth-migration://')) {
                        alert('QR found, but not a valid 2FA Secret.\nData: ' + code.data);
                    }
                } else {
                    alert('No QR code detected in this image.');
                }
            } catch (error) {
                alert('Error processing image: ' + error.message);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// --- Filter Logic (Global) ---
function filterProfiles() {
    // Elements
    const searchInput = document.getElementById('profileSearchInput');
    const filterSelect = document.getElementById('filterPlatform');
    const searchFilter = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const platformFilter = filterSelect ? filterSelect.value.toLowerCase() : 'all';

    // Table Body
    const tbody = document.getElementById('profileTableBody');
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Name: Cell 1 (text content)
        const nameCell = row.cells[1];
        const nameText = nameCell ? nameCell.textContent.toLowerCase() : '';

        // Platform: Cell 3
        const platformCell = row.cells[3];
        const platformText = platformCell ? platformCell.textContent.toLowerCase().trim() : '';

        // 1. Name Match
        const nameMatch = nameText.includes(searchFilter);

        // 2. Platform Match
        let platformMatch = true;
        if (platformFilter !== 'all') {
            if (!platformText || platformText.includes('--')) {
                platformMatch = false; // "No Platform" rows don't match specific filters
            } else {
                platformMatch = (platformText === platformFilter) || (platformText.indexOf(platformFilter) !== -1);
            }
        }

        // Final Decision
        if (nameMatch && platformMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
}

// --- Automation Logic ---



function showEditor(show) {
    const listView = document.getElementById('automation-list-view');
    const editorView = document.getElementById('automation-editor-view');

    if (show) {
        listView.style.display = 'none';
        editorView.style.display = 'flex';
    } else {
        listView.style.display = 'flex';
        editorView.style.display = 'none';
        refreshWorkflowList();
    }
}


function initDrawflow() {
    if (editor) return; // Already init

    const id = document.getElementById('drawflow');
    if (!id) return;

    editor = new Drawflow(id);
    editor.reroute = true;
    editor.editor_mode = 'edit';
    editor.start();

    // Enable zoom with reasonable limits for better UX
    editor.zoom = 1;
    editor.zoom_max = 1.6;
    editor.zoom_min = 0.5;
    editor.zoom_last_value = 1;

    // Events
    editor.on('nodeSelected', (id) => showNodeProperties(id));
    editor.on('nodeUnselected', (id) => closePropertyPanel());
    editor.on('nodeRemoved', (id) => {
        if (selectedNodeId == id) closePropertyPanel();
    });

    // PERFORMANCE FIX: Add 'drag' class during node dragging to hide connections
    const container = document.getElementById('drawflow');
    let isDragging = false;

    // Detect drag start
    editor.on('mouseMove', (event) => {
        if (editor.drag && !isDragging) {
            isDragging = true;
            container.classList.add('drag');
        }
    });

    // Detect drag end
    editor.on('mouseUp', (event) => {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('drag');
            // Force connection redraw after drag
            setTimeout(() => editor.updateConnectionNodes('node-' + editor.ele_selected?.id), 10);
        }
    });

    // --- Register Nodes ---
    editor.registerNode('start', NODE_TEMPLATES.start, {}, {});
    editor.registerNode('click', NODE_TEMPLATES.click, { selector: '' }, {}, 1, 1);
    editor.registerNode('type', NODE_TEMPLATES.type, { selector: '', text: '', delay: 50 }, {}, 1, 1);
    editor.registerNode('wait', NODE_TEMPLATES.wait, { mode: 'time', ms: 1000, selector: '', timeout: 30000 }, {}, 1, 1);

    // Find Node
    editor.registerNode('find', NODE_TEMPLATES.find, { selector: '', timeout: 30000 }, {}, 1, 1);

    // Keyboard Node - Default to Tab key
    editor.registerNode('keyboard', NODE_TEMPLATES.keyboard, { key: 'Tab' }, {}, 1, 1);

    // 2FA Node (Must match 'twofa' type used in addNode)
    editor.registerNode('twofa', NODE_TEMPLATES.twofa, { selector: '' }, {}, 1, 1);
}

// function addNode(type) {
//     if (!editor) {
//         console.error('Editor is null in addNode');
//         return;
//     }
//     try {
//         console.log('Adding node type:', type);
//         // Force numeric cast to avoid NaN
//         const posX = Number(editor.pos_x || 0);

function addNode(type) {
    if (!editor) {
        console.error('Editor is null in addNode');
        alert('Internal Error: Editor not ready');
        return;
    }

    try {
        console.log('Adding node type:', type);

        // Force numeric cast to avoid NaN
        const posX = Number(editor.pos_x || 0);
        const posY = Number(editor.pos_y || 0);

        // Add random offset to prevent stacking
        const offset = Math.floor(Math.random() * 50);

        // Calculate safe position
        const x = -posX + 200 + offset;
        const y = -posY + 200 + offset;

        switch (type) {
            case 'start':
                editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
                break;
            case 'click':
                editor.addNode('click', 1, 1, x, y, 'click', {}, NODE_TEMPLATES.click);
                break;
            case 'type':
                editor.addNode('type', 1, 1, x, y, 'type', {}, NODE_TEMPLATES.type);
                break;
            case 'wait':
                editor.addNode('wait', 1, 1, x, y, 'wait', {}, NODE_TEMPLATES.wait);
                break;
            case '2fa':
            case 'twofa':
                editor.addNode('twofa', 1, 1, x, y, 'twofa', {}, NODE_TEMPLATES.twofa);
                break;
            case 'find':
                editor.addNode('find', 1, 1, x, y, 'find', {}, NODE_TEMPLATES.find);
                break;
            case 'keyboard':
                editor.addNode('keyboard', 1, 1, x, y, 'keyboard', {}, NODE_TEMPLATES.keyboard);
                break;
            default:
                console.warn('Unknown node type:', type);
                alert('Unknown node type: ' + type);
                return;
        }

        console.log('✓ Node added successfully:', type);
        toggleNodeMenu();
        // Mark workflow as changed
        markWorkflowChanged();
    } catch (e) {
        console.error('Add Node Error:', e);
        alert('Failed to add node: ' + e.message + '\n\nStack: ' + e.stack);
    }
}

// --- Property Panel Logic ---

function showNodeProperties(nodeId) {
    selectedNodeId = nodeId;
    const node = editor.drawflow.drawflow.Home.data[nodeId];
    const data = node.data;
    const type = node.name; // 'click', 'wait', etc.
    const panel = document.getElementById('property-panel');
    const content = document.getElementById('panel-content');
    const title = document.getElementById('panel-title');

    panel.classList.add('active');
    title.innerText = `Edit: ${type.toUpperCase()}`;
    content.innerHTML = '';

    // Helper to create input with optional Pick Element button
    const createInput = (label, key, placeholder, inputType = 'text', options = null, showPickerButton = false) => {
        const group = document.createElement('div');
        group.className = 'form-group-panel';

        const lbl = document.createElement('label');
        lbl.className = 'form-label-panel';
        lbl.innerText = label;
        group.appendChild(lbl);

        let input;
        if (options) {
            input = document.createElement('select');
            input.className = 'form-control-panel';
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.innerText = opt.label;
                if (data[key] === opt.value) o.selected = true;
                input.appendChild(o);
            });
            // Add onchange event to update node data
            input.onchange = () => {
                updateNodeData(nodeId, key, input.value);
            };
            group.appendChild(input);
        } else {
            const inputWrapper = document.createElement('div');
            inputWrapper.style.cssText = 'display: flex; gap: 5px;';

            input = document.createElement('input');
            input.className = 'form-control-panel';
            input.type = inputType;
            input.placeholder = placeholder || '';
            input.value = data[key] || '';
            input.oninput = (e) => updateNodeData(nodeId, key, e.target.value);
            inputWrapper.appendChild(input);

            if (showPickerButton) {
                const pickBtn = document.createElement('button');
                pickBtn.className = 'btn';
                pickBtn.style.cssText = 'padding: 8px 12px; background: var(--accent); color: white; white-space: nowrap;';
                pickBtn.innerHTML = '🎯 Pick';
                pickBtn.onclick = async () => {
                    try {
                        // Get default URL
                        let defaultUrl = 'https://example.com';

                        const workflowPlatform = document.getElementById('workflowPlatformInput')?.value;
                        if (workflowPlatform && workflowPlatform !== 'all') {
                            const platforms = await ipcRenderer.invoke('get-platforms');
                            const platform = platforms.find(p => p.id === workflowPlatform);
                            if (platform && platform.login_url) {
                                defaultUrl = platform.login_url;
                            }
                        }

                        // Show URL and confirm
                        const confirmed = window.confirm(
                            `Open element picker at:\n${defaultUrl}\n\nClick OK to proceed.\n\nTo change URL, edit platform settings.`
                        );
                        if (!confirmed) return;

                        const url = defaultUrl;

                        pickBtn.disabled = true;
                        pickBtn.innerHTML = '⏳...';

                        try {
                            const res = await ipcRenderer.invoke('open-element-picker', { url, nodeId });
                            if (res.success) {
                                input.value = res.selector;
                                updateNodeData(nodeId, key, res.selector);
                                alert(`✅ Captured: ${res.selector}`);
                            } else {
                                alert(`❌ Error: ${res.error}`);
                            }
                        } catch (e) {
                            alert(`❌ ${e.message}`);
                        }

                        pickBtn.disabled = false;
                        pickBtn.innerHTML = '🎯 Pick';
                    } catch (e) {
                        pickBtn.disabled = false;
                        pickBtn.innerHTML = '🎯 Pick';
                        alert(`❌ ${e.message}`);
                    }
                };
                inputWrapper.appendChild(pickBtn);
            }

            group.appendChild(inputWrapper);
        }
        return group;
    };

    // Dynamic Form Building
    if (type === 'click') {
        content.appendChild(createInput('CSS Selector', 'selector', '.btn-submit', 'text', null, true));
    } else if (type === 'type') {
        content.appendChild(createInput('CSS Selector', 'selector', '#username', 'text', null, true));

        // Add variable type selector
        content.appendChild(createInput('Text Type', 'textType', '', 'text', [
            { value: 'static', label: 'Static Text' },
            { value: 'username', label: '{{username}} - Profile Email/Username' },
            { value: 'password', label: '{{password}} - Profile Password' },
            { value: '2fa', label: '{{2FA}} - 2FA Code (if enabled)' }
        ]));

        content.appendChild(createInput('Text to Type', 'text', 'Hello World'));
        content.appendChild(createInput('Typing Delay (ms)', 'delay', '50', 'number'));
    } else if (type === 'wait') {
        const mod = createInput('Wait Mode', 'mode', '', 'text', [
            { value: 'time', label: 'Time Duration' },
            { value: 'selector', label: 'Wait for Selector' },
        ]);
        content.appendChild(mod);

        if (data.mode === 'time' || !data.mode) {
            content.appendChild(createInput('Duration (ms)', 'ms', '1000', 'number'));
        } else if (data.mode === 'selector') {
            content.appendChild(createInput('CSS Selector', 'selector', '.element', 'text', null, true));
            content.appendChild(createInput('Timeout (ms)', 'timeout', '30000', 'number'));
        }
        mod.querySelector('select').addEventListener('change', () => setTimeout(() => showNodeProperties(nodeId), 50));

    } else if (type === '2fa') {
        content.appendChild(createInput('Input Selector', 'selector', '#otp-input', 'text', null, true));
    } else if (type === 'find') {
        content.appendChild(createInput('CSS Selector', 'selector', '.element', 'text', null, true));
        content.appendChild(createInput('Timeout (ms)', 'timeout', '30000', 'number'));
    } else if (type === 'keyboard') {
        content.appendChild(createInput('Key to Press', 'key', '', 'text', [
            { value: 'Tab', label: 'Tab - Navigate to next field' },
            { value: 'Enter', label: 'Enter - Submit form' },
            { value: 'Escape', label: 'Escape - Close dialog' },
            { value: 'Space', label: 'Space - Spacebar' },
            { value: 'ArrowDown', label: 'Arrow Down' },
            { value: 'ArrowUp', label: 'Arrow Up' }
        ]));
    }
}

async function pickElement(nodeId) {
    const btn = document.getElementById('btn-pick-' + nodeId);
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Picking... Check Browser';
        btn.disabled = true;

        const res = await ipcRenderer.invoke('start-element-picker');

        if (res.success && res.selector) {
            // Update input
            const input = document.getElementById(`input-selector-${nodeId}`);
            if (input) {
                input.value = res.selector;
                // Trigger change
                updateNodeData(nodeId, 'selector', res.selector);
            }
            alert('Element Picked: ' + res.selector);
        } else {
            if (res.error) alert('Error: ' + res.error);
        }

    } catch (err) {
        alert('Picker Failed: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function updateNodeData(nodeId, key, value) {
    const node = editor.drawflow.drawflow.Home.data[nodeId];
    if (!node) return;
    node.data[key] = value;

    // Mark workflow as changed
    markWorkflowChanged();
}

// Helper to enable save button on changes
function markWorkflowChanged() {
    workflowHasChanges = true;
    const saveBtn = document.querySelector('.top-bar .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
    }
}

function closePropertyPanel() {
    const panel = document.getElementById('property-panel');
    if (panel) panel.classList.remove('active');
    selectedNodeId = null;
    // Note: removeNodeId('selected') removed - it was causing errors and isn't needed
}

// --- Automation CRUD ---

async function saveWorkflow() {
    if (!editor) return;
    const data = editor.export();

    let name = 'New Workflow';
    if (currentWorkflowId) {
        name = prompt('Update Workflow Name:', 'Updated Workflow');
    } else {
        name = prompt('Enter Workflow Name:', 'My Automation');
    }

    if (!name) return;

    // data.drawflow.Home.data structure
    const graphOnly = data.drawflow.Home.data;

    const res = await ipcRenderer.invoke('save-workflow', {
        id: currentWorkflowId,
        name,
        data: graphOnly
    });

    if (res.success) {
        currentWorkflowId = res.id;
        alert('Saved!');
        refreshWorkflowList();
    } else {
        alert('Error: ' + res.error);
    }
}


function closeEditor() {
    showEditor(false);
}

function createNewWorkflow() {
    showEditor(true);
    initDrawflow();

    // Clear and Add Start Node
    setTimeout(() => {
        if (editor) {
            editor.clear();
            currentWorkflowId = null;
            // Add Start Node
            editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);

            // Set Default Name & Reset Platform
            const nameInput = document.getElementById('workflowNameInput');
            if (nameInput) nameInput.value = 'New Workflow';

            const platformInput = document.getElementById('workflowPlatformInput');
            if (platformInput) platformInput.value = 'all';
        }
    }, 100);
}

async function populateWorkflowPlatformSelects() {
    const platforms = await ipcRenderer.invoke('get-platforms');
    const options = `<option value="all">Global / All</option>` +
        platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    // Editor Input
    const editorSelect = document.getElementById('workflowPlatformInput');
    if (editorSelect) editorSelect.innerHTML = options;

    // Filter Input (add "All" logic differently if needed, but 'all' works)
    const filterSelect = document.getElementById('workflowFilterPlatform');
    if (filterSelect) {
        // Keep selected value
        const current = filterSelect.value;
        filterSelect.innerHTML = `<option value="all">All Platforms</option>` +
            platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        filterSelect.value = current;
    }
}

function filterWorkflows() {
    const filter = document.getElementById('workflowFilterPlatform').value;
    const rows = document.querySelectorAll('#automationTableBody tr');

    rows.forEach(row => {
        // Platform is in 2nd column (index 1)
        const platformCell = row.cells[1];
        // We stored the ID/Name. Ideally we store ID in data attribute, but for now check text or value
        // The table cell shows NAME (w.platform is stored as ID usually, but here I think I stored actual ID or Name?
        // Wait, save-workflow saves the VALUE of the select. The select options have VALUE=p.id.
        // So w.platform in DB is an ID (UUID).
        // But in the table view I am showing `w.platform` directly. If it's a UUID it looks ugly.
        // I should probably map it back to name.

        // For simplicity, let's assume filtering by exact text match isn't perfect if I show Name but store ID.
        // I'll make the filter simple: Show All.
        // Actually, let's fix the table display to look up the name later. 
        // For now, rows.display logic:

        // Simple client-side text match won't work if ID is displayed.
        // But wait, the user wants to filter.

        // Let's store the platform ID in a data-attribute on the TR.
        const rowPlatform = row.getAttribute('data-platform');
        if (filter === 'all' || rowPlatform === filter) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

async function refreshWorkflowList() {
    // Populate dropdowns first
    await populateWorkflowPlatformSelects();

    // Populate the TABLE now, not select
    const tbody = document.getElementById('automationTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    const workflows = await ipcRenderer.invoke('get-workflows');
    allWorkflows = workflows; // Store globally
    const platforms = await ipcRenderer.invoke('get-platforms');
    const platformMap = {};
    platforms.forEach(p => platformMap[p.id] = p.name);

    tbody.innerHTML = '';

    if (workflows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No workflows found.</td></tr>';
        return;
    }

    workflows.forEach(w => {
        const row = document.createElement('tr');
        // w.platform is likely an ID. Map it.
        const pName = w.platform === 'all' ? 'Global' : (platformMap[w.platform] || w.platform || 'Global');

        row.setAttribute('data-platform', w.platform || 'all');
        row.innerHTML = `
            <td>${w.name}</td>
            <td>${pName}</td>
            <td>${new Date(w.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-secondary" onclick="loadWorkflow('${w.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
                <button class="btn btn-danger" onclick="deleteWorkflow('${w.id}')" style="margin-left:5px; background-color: var(--danger);"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Apply current filter
    filterWorkflows();
}

async function loadWorkflow(workflowId) {
    if (!workflowId) return;
    console.log('Loading workflow ID:', workflowId);
    showEditor(true);
    initDrawflow();

    const res = await ipcRenderer.invoke('load-workflow', workflowId);
    if (res.success) {
        currentWorkflowId = workflowId;

        // CRITICAL FIX: Rebuild Drawflow structure from saved node data
        // Saved: {1: {...}, 2: {...}} (plain nodes)
        // Need: {drawflow: {Home: {data: {...}}}} (Drawflow format)
        const importData = {
            drawflow: {
                Home: {
                    data: res.workflow.graph_data || {}
                }
            }
        };

        // Add Drawflow version (required for import)
        if (importData.drawflow && importData.drawflow.Home) {
            importData.drawflow.Home.version = '0.1';
        }

        console.log('Loaded graph_data from DB:', res.workflow.graph_data);
        console.log('Import Data Structure:', importData);
        console.log('Node count:', Object.keys(importData.drawflow.Home.data || {}).length);

        // REPAIR: Re-hydrate missing HTML (fix for optimized/corrupted workflows)
        if (importData.drawflow.Home.data && Object.keys(importData.drawflow.Home.data).length > 0) {
            Object.values(importData.drawflow.Home.data).forEach(node => {
                // Ensure typenode field exists (required by Drawflow)
                if (node.typenode === undefined) {
                    node.typenode = false;
                }

                // If HTML is missing, too short, or just text, replace with full Template
                if (!node.html || node.html.length < 50) {
                    const type = node.class || node.name; // 'click', 'start', etc.
                    if (NODE_TEMPLATES[type]) {
                        node.html = NODE_TEMPLATES[type];
                        console.log(`Repaired HTML for node ${node.id}, type: ${type}`);
                    }
                }
            });
        }


        // Set Name
        // Set Name & Platform
        const nameInput = document.getElementById('workflowNameInput');
        if (nameInput) nameInput.value = res.workflow.name;

        await populateWorkflowPlatformSelects(); // Ensure loaded
        const platformInput = document.getElementById('workflowPlatformInput');
        if (platformInput) platformInput.value = res.workflow.platform || 'all';

        setTimeout(() => {
            editor.clear();
            // Check if graph_data is empty or invalid
            if (!res.workflow.graph_data || Object.keys(res.workflow.graph_data).length === 0) {
                editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
            } else {
                try {
                    editor.import(importData);
                } catch (e) {
                    console.error("Import Failed:", e);
                    alert("Workflow data corrupted, resetting.");
                    editor.clear();
                    editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
                }
            }
        }, 50);
    } else {
        alert('Error loading: ' + res.error);
        showEditor(false);
    }
}

async function deleteWorkflow(id) {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    const res = await ipcRenderer.invoke('delete-workflow', id);
    if (res.success) {
        alert("Workflow deleted.");
        refreshWorkflowList();
    } else {
        alert("Delete failed: " + res.error);
    }
}

async function saveWorkflow() {
    console.log("saveWorkflow called");
    if (!editor) {
        console.error("Editor not initialized");
        alert("Editor not active");
        return;
    }

    let name = 'New Workflow';
    const nameInput = document.getElementById('workflowNameInput');
    if (nameInput && nameInput.value.trim()) {
        name = nameInput.value.trim();
    }

    try {
        const data = editor.export();
        const rawGraphData = data.drawflow.Home.data;

        // OPTIMIZE: Strip unnecessary fields to reduce MySQL storage
        const optimizedGraphData = {};
        Object.keys(rawGraphData).forEach(nodeId => {
            const node = rawGraphData[nodeId];
            optimizedGraphData[nodeId] = {
                id: node.id,
                name: node.name,
                class: node.class,
                data: node.data || {}, // Only store user data
                pos_x: node.pos_x,
                pos_y: node.pos_y,
                inputs: node.inputs,
                outputs: node.outputs
                // Removed: html, typenode (not needed for execution)
            };
        });

        console.log('Original size:', JSON.stringify(rawGraphData).length);
        console.log('Optimized size:', JSON.stringify(optimizedGraphData).length);
        console.log('Saved:', JSON.stringify(rawGraphData).length - JSON.stringify(optimizedGraphData).length, 'bytes');

        const workflow = {
            id: currentWorkflowId,
            name: document.getElementById('workflowNameInput')?.value || 'New Workflow',
            platform: document.getElementById('workflowPlatformInput')?.value || 'all',
            graph_data: optimizedGraphData // Send optimized data
        };

        console.log('Sending payload:', workflow);

        const res = await ipcRenderer.invoke('save-workflow', workflow);
        console.log('Save Response:', res);

        if (res.success) {
            // Disable save button until next change
            const saveBtn = document.querySelector('.top-bar .btn-primary');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
            }

            currentWorkflowId = res.id;
            workflowHasChanges = false; // Mark as saved
            refreshWorkflowList();
        } else {
            alert('Save failed: ' + res.error);
        }
    } catch (e) {
        console.error("Save Logic Error:", e);
        alert("Critical Save Error: " + e.message);
    }
}

async function runAutomation(profileId) {
    // Show workflow selector for this profile
    const profile = accounts.find(a => a.id === profileId);

    if (!profile) {
        return alert('Profile not found!');
    }

    // Get workflows matching this profile's platform
    const matchingWorkflows = allWorkflows.filter(w =>
        w.platform === 'all' || w.platform === profile.platform_id
    );

    if (matchingWorkflows.length === 0) {
        return alert('No workflows available for this platform. Create one first!');
    }

    // Build selection dialog
    let message = `Select workflow for "${profile.name}":\n\n`;
    matchingWorkflows.forEach((w, i) => {
        const selected = profile.workflow_id === w.id ? ' ✓' : '';
        message += `${i + 1}. ${w.name}${selected}\n`;
    });
    message += '\n0. Remove assignment';

    // Show alert with instructions (since prompt doesn't work)
    const choice = window.confirm(message + '\n\nThis will assign the workflow. Click OK to proceed to assignment modal.');

    if (!choice) return;

    // For now, just show alert - proper modal implementation would be better
    alert('Workflow assignment modal coming soon! For now, edit the profile in database or use the workflow selector in profile modal.');
}

function toggleNodeMenu() {
    const menu = document.getElementById('node-menu');
    const fab = document.getElementById('fab-add-node');
    if (!menu || !fab) return;

    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        fab.style.transform = 'rotate(0deg)';
    } else {
        menu.style.display = 'block';
        fab.style.transform = 'rotate(45deg)';
    }
}

function zoomIn() {
    if (!editor) return;
    editor.zoom_in();
}

function zoomOut() {
    if (!editor) return;
    editor.zoom_out();
}

function zoomReset() {
    if (!editor) return;
    editor.zoom_reset();
}

function centerWorkflow() {
    if (!editor) return;

    const nodes = editor.drawflow.drawflow.Home.data;
    if (!nodes || Object.keys(nodes).length === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    Object.values(nodes).forEach(node => {
        const x = node.pos_x;
        const y = node.pos_y;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    });

    // Add padding
    minX -= 50;
    minY -= 50;
    maxX += 250; // Extra padding for node width
    maxY += 150; // Extra padding for node height

    // Calculate center and zoom to fit
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate required zoom to fit all nodes
    const container = editor.container;
    const width = maxX - minX;
    const height = maxY - minY;
    const zoomX = container.clientWidth / width;
    const zoomY = container.clientHeight / height;
    const targetZoom = Math.min(zoomX, zoomY, editor.zoom_max);

    // Apply zoom
    editor.zoom = Math.max(targetZoom, editor.zoom_min);
    editor.zoom_refresh();

    // Center the view
    editor.canvas_x = -(centerX * editor.zoom) + container.clientWidth / 2;
    editor.canvas_y = -(centerY * editor.zoom) + container.clientHeight / 2;

    // Update canvas position
    editor.precanvas.style.transform = `translate(${editor.canvas_x}px, ${editor.canvas_y}px) scale(${editor.zoom})`;
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('node-menu');
    const fab = document.getElementById('fab-add-node');
    if (menu && menu.style.display === 'block') {
        if (!menu.contains(e.target) && !fab.contains(e.target)) {
            menu.style.display = 'none';
            fab.style.transform = 'rotate(0deg)';
        }
    }
});

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    const label = document.querySelector('#btn-theme-toggle');
    if (label) {
        label.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i> Light Mode' : '<i class="fa-solid fa-moon"></i> Dark Mode';
    }
}

// --- Database Reset ---
async function resetDatabaseWithConfirmation() {
    const confirmation = confirm("⚠️ DANGER ZONE ⚠️\n\nAre you sure you want to delete ALL database data?\n\n- Profiles, Proxies, Platforms will be WIPED.\n- Workflows will be KEPT.\n- Admin user will be RESTORED.\n\nThis action cannot be undone!");

    if (confirmation) {
        const doubleCheck = confirm("Please confirm one last time: DESTROY ALL DATA?");
        if (doubleCheck) {
            try {
                // Show loading state
                const btn = document.querySelector('#view-database button.btn-danger');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
                btn.disabled = true;

                const result = await ipcRenderer.invoke('database:reset');

                if (result.success) {
                    alert("✅ Database has been reset successfully!\n\nThe app will now reload.");
                    window.location.reload();
                } else {
                    alert("❌ Reset failed: " + result.error);
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            } catch (error) {
                alert("❌ Error: " + error.message);
                window.location.reload(); // Reload anyway to be safe
            }
        }
    }
}

// Make globally available
window.resetDatabaseWithConfirmation = resetDatabaseWithConfirmation;

// --- Launch Function (Manual Override) ---
window.launch = async function (id) {
    if (!id) return;
    console.log('Launching manual session for:', id);
    // Explicitly send mode: 'manual' to prevent auto-close behavior
    const result = await ipcRenderer.invoke('launch-browser', { id: id, mode: 'manual' });
    if (!result.success) alert('Launch failed: ' + result.error);
};
