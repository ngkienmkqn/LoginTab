const { ipcRenderer } = require('electron');

let proxies = [];
let proxyHealthMap = {};
let proxyHealthInterval = null;

// Global flag to indicate if we are editing
let editingProxyId = null;

async function loadProxies() {
    try {
        proxies = await ipcRenderer.invoke('get-proxies');
        renderProxyTable();
    } catch (err) {
        console.error('Failed to load proxies:', err);
    }
}

function openProxyModal(proxyToEdit = null) {
    if (proxyToEdit) {
        editingProxyId = proxyToEdit.id;
        document.getElementById('inpProxyHostModal').value = proxyToEdit.host;
        document.getElementById('inpProxyPortModal').value = proxyToEdit.port;
        document.getElementById('inpProxyUserModal').value = proxyToEdit.user || '';
        document.getElementById('inpProxyPassModal').value = proxyToEdit.pass || '';
        document.getElementById('inpProxyTypeModal').value = proxyToEdit.type || 'http';
        document.getElementById('proxyModalTitle').innerText = 'Edit Proxy';
    } else {
        editingProxyId = null;
        document.getElementById('inpProxyHostModal').value = '';
        document.getElementById('inpProxyPortModal').value = '';
        document.getElementById('inpProxyUserModal').value = '';
        document.getElementById('inpProxyPassModal').value = '';
        document.getElementById('inpProxyTypeModal').value = 'http';
        document.getElementById('proxyModalTitle').innerText = 'Add Proxy';
    }
    document.getElementById('proxyModal').classList.add('active');
}

async function saveNewProxy() {
    const host = document.getElementById('inpProxyHostModal').value;
    const port = document.getElementById('inpProxyPortModal').value;
    const user = document.getElementById('inpProxyUserModal').value;
    const pass = document.getElementById('inpProxyPassModal').value;
    const type = document.getElementById('inpProxyTypeModal').value;

    if (!host || !port) return alert('Host and Port required');

    const payload = { host, port, user, pass, type };

    if (editingProxyId) {
        payload.id = editingProxyId;
        await ipcRenderer.invoke('update-proxy', payload);
    } else {
        await ipcRenderer.invoke('create-proxy', payload);
    }

    closeModal('proxyModal');
    loadProxies();
}

async function deleteProxy(id) {
    if (confirm('Delete this proxy?')) {
        await ipcRenderer.invoke('delete-proxy', id);
        loadProxies();
    }
}

function renderProxyTable() {
    const tbody = document.getElementById('proxyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = window.currentUser && window.currentUser.role !== 'staff';

    proxies.forEach(p => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            // Using JSON.stringify(p) carefully, might be safer to pass ID and lookup
            actions = `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick='window.proxiesModule.openProxyModal(window.proxiesModule.getProxyById("${p.id}"))'><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="window.proxiesModule.deleteProxy('${p.id}')"><i class="fa-solid fa-trash"></i></button>
            `;
        } else {
            actions = '<span style="color:#666">ReadOnly</span>';
        }

        const healthId = `proxy-health-${p.id}`;

        tr.innerHTML = `
            <td>
                <div>${p.host}:${p.port}</div>
                <div style="font-size:12px; color:#555">${p.type.toUpperCase()}</div>
            </td>
            <td>${p.user || '--'}</td>
            <td>${p.pass ? '******' : '--'}</td>
            <td>
                <div id="${healthId}" style="display:flex; gap:3px; align-items:flex-end; height:16px; width:24px; cursor:pointer;" title="Click to Test" onclick="window.proxiesModule.testProxyHealth('${p.id}', '${p.type}', '${p.host}', '${p.port}', '${p.user}', '${p.pass}')">
                    <div style="width:4px; height:25%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:50%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:75%; background:#444; border-radius:1px;"></div>
                    <div style="width:4px; height:100%; background:#444; border-radius:1px;"></div>
                </div>
            </td>
            <td>${actions}</td>
        `;
        tbody.appendChild(tr);

        // Initial check
        setTimeout(() => testProxyHealth(p.id, p.type, p.host, p.port, p.user, p.pass), 500);
    });

    // Setup interval
    if (proxyHealthInterval) clearInterval(proxyHealthInterval);
    proxyHealthInterval = setInterval(() => {
        proxies.forEach(p => {
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

async function testProxyHealth(id, type, host, port, user, pass) {
    const el = document.getElementById(`proxy-health-${id}`);
    if (!el) return;

    // Reset indicator
    const bars = el.querySelectorAll('div');
    bars.forEach(b => b.style.background = '#666');

    const proxy = { type, host, port: parseInt(port), user: user === 'undefined' ? '' : user, pass: pass === 'undefined' ? '' : pass };
    const res = await ipcRenderer.invoke('check-proxy-health', proxy);

    if (res.success) {
        const score = res.score;
        const color = res.color;

        proxyHealthMap[id] = { score, label: res.label, color };

        bars.forEach((b, index) => {
            if (index < score) {
                b.style.background = color;
            } else {
                b.style.background = '#444';
            }
        });
        el.title = `Status: ${res.label}`;

        // Sync to Profile Table
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
        proxyHealthMap[id] = { score: 0, label: 'Offline', color: '#e74c3c' };
        bars.forEach(b => b.style.background = '#e74c3c');
        el.title = 'Connection Failed';

        const profileBars = document.querySelectorAll(`.live-proxy-health[data-host="${host}"][data-port="${port}"]`);
        profileBars.forEach(wrapper => {
            const divs = wrapper.querySelectorAll('div');
            divs.forEach(d => d.style.background = '#e74c3c');
            wrapper.title = 'Connection Failed';
        });
    }
}

function getProxies() {
    return proxies;
}

function getProxyById(id) {
    return proxies.find(p => p.id === id);
}

// Exports
window.proxiesModule = {
    loadProxies,
    openProxyModal,
    saveNewProxy,
    deleteProxy,
    renderProxyTable,
    testProxyHealth,
    getProxies,
    getProxyById,
    // Expose internal state for binding/debugging if necessary
    proxies,
    proxyHealthMap
};

// Also expose global functions if legacy code requires, or for onclick handlers
// Ideally we should namespace these, but for onclicks in generated HTML it's easier to have them on window or window.proxiesModule
