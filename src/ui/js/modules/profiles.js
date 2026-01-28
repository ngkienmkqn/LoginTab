const { ipcRenderer } = require('electron');

// State
let accounts = [];
let editingAccountId = null;
let selectedAccountIds = new Set();
let bulkMode = 'assign';

// --- Data Loading ---
async function loadAccounts() {
    try {
        if (!window.currentUser) return;
        console.log('[Profiles] Loading accounts...');
        accounts = await ipcRenderer.invoke('get-accounts', window.currentUser);
        renderTable();

        // Update 2FA if needed
        if (window.currentUser.role === 'super_admin') {
            update2FACodes();
        }
    } catch (e) {
        console.error('Failed to load accounts:', e);
        alert('Failed to load accounts: ' + e.message);
    }
}

// --- Rendering ---
function renderTable() {
    console.log('[Profiles] Rendering Table. Accounts:', accounts.length);
    const tbody = document.getElementById('profileTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#666">No profiles found</td></tr>';
        return;
    }

    const currentUser = window.currentUser;
    const canEdit = currentUser && currentUser.role !== 'staff';
    const isSuperAdmin = currentUser && currentUser.role === 'super_admin';

    // Populate Dynamic Platform Filter
    const filterSelect = document.getElementById('filterPlatform');
    if (filterSelect && window.platformsModule) {
        const platforms = window.platformsModule.getPlatforms();
        const existingPlatIds = new Set(accounts.map(a => a.platform_id).filter(Boolean));

        const currentVal = filterSelect.value;
        let opts = `<option value="all">All Platforms</option>`;

        // Only show platforms that are actually used? Or all? 
        // Renderer logic showed "existingPlatforms".
        existingPlatIds.forEach(pId => {
            const p = platforms.find(pl => pl.id === pId);
            if (p) opts += `<option value="${p.name}">${p.name}</option>`;
        });

        // If we want all platforms regardless of usage:
        // platforms.forEach(p => opts += `<option value="${p.name}">${p.name}</option>`);

        filterSelect.innerHTML = opts;
        filterSelect.value = currentVal;
    }

    // Toggle Columns
    const th2FA = document.getElementById('th-2fa-code');
    const thNotes = document.getElementById('th-notes');
    if (th2FA) th2FA.style.display = isSuperAdmin ? '' : 'none';
    if (thNotes) thNotes.style.display = '';

    // Get Data from other modules
    const proxies = window.proxiesModule ? window.proxiesModule.getProxies() : [];
    const platforms = window.platformsModule ? window.platformsModule.getPlatforms() : [];

    accounts.forEach(acc => {
        const tr = document.createElement('tr');

        // Checkbox
        const isSelected = selectedAccountIds.has(acc.id) ? 'checked' : '';
        const checkboxTd = `<td><input type="checkbox" class="profile-checkbox" value="${acc.id}" ${isSelected} onclick="window.profilesModule.onAccountSelect(event)"></td>`;

        // Proxy Display
        let proxyDisplay = '<span style="color:#666">No Proxy</span>';
        if (acc.proxy && acc.proxy.host) {
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

        // 2FA Display
        let codeDisplay = '<span style="color:#666">No</span>';
        if (isSuperAdmin && acc.auth && acc.auth.secret2FA) {
            codeDisplay = `<span id="otp-${acc.id}" style="font-family:monospace; color:#2ecc71; cursor:pointer;" onclick="window.uiUtils.copyCode('${acc.id}')">Loading...</span>`;
        }

        // Notes
        let notesDisplay = '<span style="color:#666; font-style:italic">No notes</span>';
        if (acc.notes) {
            const truncated = acc.notes.length > 30 ? acc.notes.substring(0, 30) + '...' : acc.notes;
            notesDisplay = `<span style="color:#ddd" title="${acc.notes.replace(/"/g, '&quot;')}">${truncated}</span>`;
        }

        // Active Status
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

        // Actions
        let actions = `
            <button class="btn" style="padding:6px 12px; font-size:12px" onclick="window.profilesModule.launch('${acc.id}')"><i class="fa-solid fa-rocket"></i> Open</button>
        `;

        if (canEdit) {
            actions += `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="window.automationsModule.runAutomation('${acc.id}')" title="Run Automation"><i class="fa-solid fa-robot"></i></button>
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="window.profilesModule.editAccount('${acc.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="window.profilesModule.remove('${acc.id}', '${acc.name}')"><i class="fa-solid fa-trash"></i></button>
            `;
        }

        // Platform
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
}

// --- CRUD ---
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
        const type = document.getElementById('inpProxyType') ? document.getElementById('inpProxyType').value : 'http'; // fallback
        if (host && port) {
            proxy = {
                type,
                host, port,
                user: document.getElementById('inpProxyUser').value,
                pass: document.getElementById('inpProxyPass').value
            };
        }
    } else if (proxyChoice !== 'none') {
        // Find in logic module
        if (window.proxiesModule) {
            const p = window.proxiesModule.getProxyById(proxyChoice);
            if (p) {
                proxy = {
                    type: p.type || 'http',
                    host: p.host, port: p.port, user: p.user, pass: p.pass
                };
            }
        }
    }

    // Extension Resolve
    let extPath = '';
    const extChoice = document.getElementById('selExt').value;
    if (extChoice === 'manual') {
        extPath = document.getElementById('inpExtPath').value;
    } else if (extChoice !== 'none') {
        if (window.extensionsModule) {
            const e = window.extensionsModule.getExtensions().find(x => x.id === extChoice);
            if (e) extPath = e.path;
        }
    }

    // Fingerprint
    let fingerprint = {
        userAgent: document.getElementById('inpUA').value,
        resolution: document.getElementById('inpRes').value
    };

    if (editingAccountId) {
        const acc = accounts.find(a => a.id === editingAccountId);
        if (acc && acc.fingerprint) {
            fingerprint = { ...acc.fingerprint, ...fingerprint };
        }
    }

    // Fill missing hardware (Consistent Generation)
    // Using simple defaults or helper if available. 
    // Assuming we want to keep it simple here or duplicate the arrays.
    if (!fingerprint.deviceMemory) fingerprint.deviceMemory = [4, 8, 16, 32][Math.floor(Math.random() * 4)];
    if (!fingerprint.hardwareConcurrency) fingerprint.hardwareConcurrency = [4, 8, 12, 16, 24][Math.floor(Math.random() * 5)];
    if (!fingerprint.webglRenderer) fingerprint.webglRenderer = window.uiUtils ? window.uiUtils.getRandomGPU() : 'ANGLE (NVIDIA)';
    if (!fingerprint.webglVendor) fingerprint.webglVendor = "Google Inc. (NVIDIA)";

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
        if (window.uiUtils) window.uiUtils.closeModal('profileModal');
        // Refresh all data to be safe (proxies might have health updates etc)
        if (window.loadAllData) window.loadAllData();
        else loadAccounts();
    } else {
        alert('Error: ' + res.error);
    }
}

async function remove(id, name) {
    if (confirm('Delete ' + name + '?')) {
        await ipcRenderer.invoke('delete-account', id);
        if (window.loadAllData) window.loadAllData();
        else loadAccounts();
    }
}

async function launch(id) {
    const btn = document.querySelector(`button[onclick="window.profilesModule.launch('${id}')"]`);
    const originalText = btn ? btn.innerHTML : null;

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Opening...';
        btn.disabled = true;
    }

    try {
        await ipcRenderer.invoke('launch-browser', id);
    } catch (error) {
        console.error('Launch Error:', error);
        alert('Launch Failed: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

function editAccount(id) {
    const acc = accounts.find(a => a.id === id);
    if (acc && window.uiUtils) {
        // We need to call userUtils.openModal but passed with the account object.
        // However uiUtils.openModal implementation in our previous step was assuming ID or object?
        // In ui.js I wrote `openModal(id)` which just opens the DOM element.

        // renderer.js had `openModal(account)` which populated the form.
        // ui.js `openModal` was simplified to just class toggling.

        // Logic to populate form should be HERE in profiles.js or passed to ui.js?
        // Since it involves business logic (Account fields), it's better here or in a specialized `populateProfileModal` function.
        // But `ui.js` has `openModal` which seemed generic.

        // I should implement `populateAndOpenProfileModal` here.
        populateAndOpenProfileModal(acc);
    }
}

async function populateAndOpenProfileModal(accountToEdit = null) {
    // This logic mimics the large openModal function from renderer.js
    const modal = document.getElementById('profileModal');
    const title = document.getElementById('modalTitle');
    const btn = modal.querySelector('.modal-footer .btn:last-child');

    // 1. Dropdowns need to be ready. 
    // They might be populated by `app.js` or `loadAllData` calling `populateDropdowns`?
    // Let's populate them here to be sure.
    await populateDropdownsInModal();

    if (accountToEdit) {
        editingAccountId = accountToEdit.id;
        title.innerText = 'Edit Browser Profile';
        btn.innerText = 'Save Changes';

        document.getElementById('inpName').value = accountToEdit.name;
        document.getElementById('inpUrl').value = accountToEdit.loginUrl || '';
        document.getElementById('inpOS').value = accountToEdit.platform_type || 'win';

        document.getElementById('inpAuthUser').value = accountToEdit.auth?.username || '';
        document.getElementById('inpAuthPass').value = accountToEdit.auth?.password || '';
        document.getElementById('inpAuth2FA').value = accountToEdit.auth?.secret2FA || '';

        // Proxy
        if (accountToEdit.proxy) {
            document.getElementById('selProxy').value = 'manual';
            toggleManualProxy(true); // Helper needed
            document.getElementById('inpProxyHost').value = accountToEdit.proxy.host || '';
            document.getElementById('inpProxyPort').value = accountToEdit.proxy.port || '';
            document.getElementById('inpProxyUser').value = accountToEdit.proxy.user || '';
            document.getElementById('inpProxyPass').value = accountToEdit.proxy.pass || '';
        } else {
            document.getElementById('selProxy').value = 'none';
            toggleManualProxy(false);
        }

        // Ext
        if (accountToEdit.extensionsPath) {
            document.getElementById('selExt').value = 'manual';
            toggleManualExt(true);
            document.getElementById('inpExtPath').value = accountToEdit.extensionsPath;
        } else {
            document.getElementById('selExt').value = 'none';
            toggleManualExt(false);
        }

        document.getElementById('inpUA').value = accountToEdit.fingerprint?.userAgent || '';
        document.getElementById('inpRes').value = accountToEdit.fingerprint?.resolution || '1920x1080';

        const fp = accountToEdit.fingerprint || {};
        document.getElementById('fpHardware').value = fp.hardwareConcurrency || 'Auto';
        document.getElementById('fpMemory').value = fp.deviceMemory || 'Auto';
        document.getElementById('fpRenderer').value = fp.webglRenderer || 'Auto';

        document.getElementById('inpNotes').value = accountToEdit.notes || '';

        document.getElementById('selPlatform').value = accountToEdit.platform_id || "";

        // Workflow - Trigger logic to filter based on platform
        if (document.getElementById('selWorkflow')) {
            updateWorkflowOptions(document.getElementById('selPlatform').value);
            document.getElementById('selWorkflow').value = accountToEdit.workflow_id || "";
        }

    } else {
        editingAccountId = null;
        title.innerText = 'New Browser Profile';
        btn.innerText = 'Create Profile';

        // Clear inputs
        modal.querySelectorAll('input').forEach(i => i.value = '');
        document.getElementById('selProxy').value = 'none';
        document.getElementById('selExt').value = 'none';
        document.getElementById('selPlatform').value = "";
        document.getElementById('inpOS').value = 'win';
        if (document.getElementById('selWorkflow')) {
            updateWorkflowOptions(""); // Reset to show only global/none
            document.getElementById('selWorkflow').value = "";
        }

        toggleManualProxy(false);
        toggleManualExt(false);

        if (window.uiUtils) window.uiUtils.updateFingerprintPreview();
    }

    // Toggle QR Button visibility
    const btnScan = document.getElementById('btn-scan-qr');
    if (btnScan) {
        btnScan.style.display = (window.currentUser && window.currentUser.role === 'super_admin') ? 'block' : 'none';
    }

    if (window.uiUtils) window.uiUtils.openModal('profileModal');
}

async function populateDropdownsInModal() {
    // Platforms
    const selPlat = document.getElementById('selPlatform');
    if (selPlat && window.platformsModule) {
        selPlat.innerHTML = '<option value="">-- Select a Platform --</option>';
        window.platformsModule.getPlatforms().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.name;
            selPlat.appendChild(opt);
        });
    }

    // Workflows (Fix for empty dropdown + Platform Filter)
    const selWorkflow = document.getElementById('selWorkflow');
    const selPlatform = document.getElementById('selPlatform');

    if (selWorkflow) {
        try {
            // Fetch and Store
            const workflows = await ipcRenderer.invoke('get-workflows');
            selWorkflow.dataset.allWorkflows = JSON.stringify(workflows); // Store for filtering

            // Attach Listener
            if (selPlatform) {
                selPlatform.onchange = () => updateWorkflowOptions(selPlatform.value);
            }

            // Initial Population (Full or Filtered? Let populateAndOpen handle the specific filter, 
            // but we can default to showing all or just global here initialization)
            // Actually, usually we open the modal and then set values. 
            // Let's just initialize with Global to be safe.
            updateWorkflowOptions(selPlatform ? selPlatform.value : '');

        } catch (e) { console.error('Failed to load workflows', e); }
    }

    // Proxies
    const selProxy = document.getElementById('selProxy');
    if (selProxy && window.proxiesModule) {
        selProxy.innerHTML = `<option value="none">No Proxy (Direct)</option><option value="manual">+ Enter Manually...</option>`;
        window.proxiesModule.getProxies().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = `${p.host}:${p.port} (${p.user || 'No Auth'})`;
            selProxy.appendChild(opt);
        });
    }

    // Extensions
    const selExt = document.getElementById('selExt');
    if (selExt && window.extensionsModule) {
        selExt.innerHTML = `<option value="none">No Extension</option><option value="manual">+ Enter Path Manually...</option>`;
        window.extensionsModule.getExtensions().forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.innerText = e.name;
            selExt.appendChild(opt);
        });
    }
}

function updateWorkflowOptions(platformId) {
    const selWorkflow = document.getElementById('selWorkflow');
    if (!selWorkflow || !selWorkflow.dataset.allWorkflows) return;

    const allWorkflows = JSON.parse(selWorkflow.dataset.allWorkflows);
    const currentVal = selWorkflow.value;

    // Filter: Show 'all' (Global) OR matching platformId
    const filtered = allWorkflows.filter(w => w.platform === 'all' || w.platform === platformId);

    selWorkflow.innerHTML = '<option value="">-- No Workflow --</option>';
    filtered.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.innerText = w.name + (w.platform === 'all' ? ' (Global)' : '');
        selWorkflow.appendChild(opt);
    });

    // Attempt to restore selection if it still exists
    if (currentVal && (currentVal === "" || filtered.find(w => w.id === currentVal))) {
        selWorkflow.value = currentVal;
    } else {
        selWorkflow.value = "";
    }
}

// Helper to show/hide manual inputs
function toggleManualProxy(forceShow = null) {
    const val = document.getElementById('selProxy').value;
    const div = document.getElementById('manual-proxy-fields');
    if (!div) return;
    if (forceShow === true || val === 'manual') div.style.display = 'block';
    else if (forceShow === false) div.style.display = 'none';
    else div.style.display = (val === 'manual') ? 'block' : 'none';
}

function toggleManualExt(forceShow = null) {
    const val = document.getElementById('selExt').value;
    const div = document.getElementById('manual-ext-fields');
    if (!div) return;
    if (forceShow === true || val === 'manual') div.style.display = 'block';
    else if (forceShow === false) div.style.display = 'none';
    else div.style.display = (val === 'manual') ? 'block' : 'none';
}

// Bulk Ops
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
        if (bar) bar.style.display = 'flex';
        if (label) label.innerText = `${count} accounts selected`;
    } else {
        if (bar) bar.style.display = 'none';
        if (document.getElementById('selectAllProfiles')) document.getElementById('selectAllProfiles').checked = false;
    }
}

async function update2FACodes() {
    if (!window.currentUser) return;
    const accountsWith2FA = accounts.filter(a => a.auth && a.auth.secret2FA);
    if (accountsWith2FA.length === 0) return;
    try {
        const codes = await ipcRenderer.invoke('get-2fa-codes', accountsWith2FA.map(a => ({ id: a.id, secret: a.auth.secret2FA })));
        codes.forEach(item => {
            const el = document.getElementById(`otp-${item.id}`);
            if (el) el.innerText = item.token;
        });
    } catch (e) { console.error('2FA error', e); }
}

// Exports
window.profilesModule = {
    loadAccounts,
    renderTable,
    saveProfile,
    remove,
    launch,
    editAccount,
    populateAndOpenProfileModal,
    toggleManualProxy,
    toggleManualExt,
    toggleSelectAll,
    onAccountSelect,
    updateSelectedHeader,
    update2FACodes,
    getAccounts: () => accounts
};
