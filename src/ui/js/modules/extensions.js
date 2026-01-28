const { ipcRenderer } = require('electron');

let extensions = [];

async function loadExtensions() {
    try {
        extensions = await ipcRenderer.invoke('get-extensions');
        renderExtensionTable();
    } catch (err) {
        console.error('Failed to load extensions:', err);
    }
}

async function saveNewExtension() {
    const name = document.getElementById('newExtName').value;
    const path = document.getElementById('newExtPath').value;

    if (!name || !path) return alert('Name and Path required');

    try {
        await ipcRenderer.invoke('save-extension', { name, path });
        closeModal('extensionModal');
        loadExtensions();
    } catch (err) {
        alert('Failed to save extension: ' + err.message);
    }
}

async function deleteExtension(id) {
    if (confirm('Delete this extension?')) {
        try {
            await ipcRenderer.invoke('delete-extension', id);
            loadExtensions();
        } catch (err) {
            alert('Failed to delete extension: ' + err.message);
        }
    }
}

function renderExtensionTable() {
    const tbody = document.getElementById('extensionTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = window.currentUser && window.currentUser.role !== 'staff';

    extensions.forEach(e => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            actions = `<button class="btn btn-danger" onclick="window.extensionsModule.deleteExtension('${e.id}')"><i class="fa-solid fa-trash"></i></button>`;
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

function getExtensions() {
    return extensions;
}

// Exports
window.extensionsModule = {
    loadExtensions,
    saveNewExtension,
    deleteExtension,
    renderExtensionTable,
    getExtensions,
    // Expose internal state if needed
    extensions
};
