const { ipcRenderer } = require('electron');

let platforms = [];
let editingPlatformId = null;

async function loadPlatforms() {
    try {
        platforms = await ipcRenderer.invoke('get-platforms');
        renderPlatformTable();
    } catch (err) {
        console.error('Failed to load platforms:', err);
    }
}

function openPlatformModal(platformToEdit = null) {
    if (platformToEdit) {
        editingPlatformId = platformToEdit.id;
        document.getElementById('newPlatName').value = platformToEdit.name;
        document.getElementById('newPlatUrl').value = platformToEdit.url;
        document.getElementById('platformModalTitle').innerText = 'Edit Platform';
    } else {
        editingPlatformId = null;
        document.getElementById('newPlatName').value = '';
        document.getElementById('newPlatUrl').value = '';
        document.getElementById('platformModalTitle').innerText = 'Add Platform';
    }
    document.getElementById('platformModal').classList.add('active');
}

async function savePlatform() {
    const name = document.getElementById('newPlatName').value;
    const url = document.getElementById('newPlatUrl').value;

    if (!name) return alert('Name required');

    const payload = { name, url };

    try {
        if (editingPlatformId) {
            payload.id = editingPlatformId;
            await ipcRenderer.invoke('update-platform', payload);
        } else {
            await ipcRenderer.invoke('save-platform', payload);
        }
        closeModal('platformModal');
        loadPlatforms();
    } catch (err) {
        alert('Failed to save platform: ' + err.message);
    }
}

async function deletePlatform(id) {
    if (confirm('Delete platform?')) {
        try {
            await ipcRenderer.invoke('delete-platform', id);
            loadPlatforms();
        } catch (err) {
            alert('Failed to delete platform: ' + err.message);
        }
    }
}

function renderPlatformTable() {
    const tbody = document.getElementById('platformTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const canEdit = window.currentUser && window.currentUser.role !== 'staff';

    platforms.forEach(p => {
        const tr = document.createElement('tr');
        let actions = '';
        if (canEdit) {
            // Passing ID instead of object to avoid JSON stringify issues in HTML
            actions = `
                <button class="btn btn-secondary" style="padding:6px 10px;" onclick="window.platformsModule.openPlatformModal(window.platformsModule.getPlatformById('${p.id}'))"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger" style="padding:6px 10px;" onclick="window.platformsModule.deletePlatform('${p.id}')"><i class="fa-solid fa-trash"></i></button>
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

function getPlatforms() {
    return platforms;
}

function getPlatformById(id) {
    return platforms.find(p => p.id === id);
}

// Exports
window.platformsModule = {
    loadPlatforms,
    openPlatformModal,
    savePlatform,
    deletePlatform,
    renderPlatformTable,
    getPlatforms,
    getPlatformById,
    platforms
};
