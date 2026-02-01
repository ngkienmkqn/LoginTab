/**
 * Proxy Management UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// Editing state
var editingProxyId = null;
var proxyHealthMap = {};

/**
 * Open proxy modal for add/edit
 * @param {Object} proxyToEdit - Proxy object to edit (null for new)
 */
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

/**
 * Save new/edited proxy
 */
async function saveNewProxy() {
    const type = document.getElementById('newProxyType').value;
    const host = document.getElementById('newProxyHost').value;
    const port = document.getElementById('newProxyPort').value;
    const user = document.getElementById('newProxyUser').value;
    const pass = document.getElementById('newProxyPass').value;

    if (!host || !port) {
        alert('Host/Port required');
        return;
    }

    const payload = { type, host, port, user, pass };
    if (editingProxyId) payload.id = editingProxyId;

    await ipcRenderer.invoke('save-proxy', payload);
    if (typeof closeModal === 'function') closeModal('proxyModal');
    if (typeof loadAllData === 'function') loadAllData();
}

/**
 * Delete a proxy
 * @param {string} id - Proxy ID
 */
async function deleteProxy(id) {
    if (confirm('Delete Proxy?')) {
        await ipcRenderer.invoke('delete-proxy', id);
        if (typeof loadAllData === 'function') loadAllData();
    }
}

/**
 * Render proxy table
 * @param {Array} proxies - List of proxies
 */
function renderProxyTable(proxies) {
    const tbody = document.getElementById('proxyBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    proxies.forEach(p => {
        const health = proxyHealthMap[p.id];
        const healthHtml = health
            ? `<span class="health-badge" style="color:${health.color}">${health.label} (${health.score}%)</span>`
            : '<span class="health-badge">Unknown</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.type || 'http'}</td>
            <td>${p.host}:${p.port}</td>
            <td>${p.user || '-'}</td>
            <td>${healthHtml}</td>
            <td>
                <button class="btn btn-sm" onclick="testProxyHealth('${p.id}', '${p.type}', '${p.host}', '${p.port}', '${p.user || ''}', '${p.pass || ''}')">Test</button>
                <button class="btn btn-sm" onclick="openProxyModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProxy('${p.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Test proxy health
 */
async function testProxyHealth(id, type, host, port, user, pass) {
    try {
        if (typeof showToast === 'function') {
            showToast('Testing proxy...', 'info', 2000);
        }

        const result = await ipcRenderer.invoke('test-proxy-health', { type, host, port, user, pass });

        proxyHealthMap[id] = {
            score: result.score,
            label: result.label,
            color: result.color
        };

        // Re-render table with updated health
        if (typeof loadAllData === 'function') {
            loadAllData();
        }

        if (typeof showToast === 'function') {
            showToast(`Proxy health: ${result.label} (${result.score}%)`, result.score > 70 ? 'success' : 'warning');
        }
    } catch (error) {
        console.error('[Proxy] Health check failed:', error);
        if (typeof showToast === 'function') {
            showToast('Proxy health check failed', 'error');
        }
    }
}

/**
 * Get proxy health data
 * @returns {Object}
 */
function getProxyHealthMap() {
    return proxyHealthMap;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openProxyModal,
        saveNewProxy,
        deleteProxy,
        renderProxyTable,
        testProxyHealth,
        getProxyHealthMap,
        proxyHealthMap
    };
}
