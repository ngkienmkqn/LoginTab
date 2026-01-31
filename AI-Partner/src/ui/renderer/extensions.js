/**
 * Extension Management UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

/**
 * Open extension modal
 */
function openExtensionModal() {
    document.getElementById('newExtName').value = '';
    document.getElementById('newExtPath').value = '';
    document.getElementById('extensionModal').classList.add('active');
}

/**
 * Save new extension
 */
async function saveNewExtension() {
    const name = document.getElementById('newExtName').value;
    const path = document.getElementById('newExtPath').value;

    if (!name || !path) {
        alert('Name and Path are required');
        return;
    }

    await ipcRenderer.invoke('save-extension', { name, path });
    if (typeof closeModal === 'function') closeModal('extensionModal');
    if (typeof loadAllData === 'function') loadAllData();
}

/**
 * Delete an extension
 * @param {string} id - Extension ID
 */
async function deleteExtension(id) {
    if (confirm('Delete Extension?')) {
        await ipcRenderer.invoke('delete-extension', id);
        if (typeof loadAllData === 'function') loadAllData();
    }
}

/**
 * Render extensions table
 * @param {Array} extensions - List of extensions
 */
function renderExtensionTable(extensions) {
    const tbody = document.getElementById('extensionBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    extensions.forEach(ext => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${ext.name}</td>
            <td><code title="${ext.path}">${ext.path.length > 50 ? ext.path.substring(0, 50) + '...' : ext.path}</code></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteExtension('${ext.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openExtensionModal,
        saveNewExtension,
        deleteExtension,
        renderExtensionTable
    };
}
