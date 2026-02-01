/**
 * Platform Management UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// Editing state
var editingPlatformId = null;

/**
 * Open platform modal for add/edit
 * @param {Object} platformToEdit - Platform object to edit (null for new)
 */
function openPlatformModal(platformToEdit = null) {
    const modal = document.getElementById('platformModal');
    const title = modal.querySelector('h3');
    const btn = modal.querySelector('.modal-footer .btn:last-child');

    if (platformToEdit) {
        editingPlatformId = platformToEdit.id;
        title.innerText = 'Edit Platform';
        btn.innerText = 'Save Changes';
        document.getElementById('newPlatName').value = platformToEdit.name;
        document.getElementById('newPlatUrl').value = platformToEdit.url || '';
    } else {
        editingPlatformId = null;
        title.innerText = 'Add New Platform';
        btn.innerText = 'Save Platform';
        document.getElementById('newPlatName').value = '';
        document.getElementById('newPlatUrl').value = '';
    }
    modal.classList.add('active');
}

/**
 * Save new/edited platform
 */
async function savePlatform() {
    const name = document.getElementById('newPlatName').value;
    const url = document.getElementById('newPlatUrl').value;

    if (!name) {
        alert('Name required');
        return;
    }

    if (editingPlatformId) {
        await ipcRenderer.invoke('update-platform', { id: editingPlatformId, name, url });
    } else {
        await ipcRenderer.invoke('save-platform', { name, url });
    }

    if (typeof closeModal === 'function') closeModal('platformModal');
    if (typeof loadAllData === 'function') loadAllData();
}

/**
 * Delete a platform
 * @param {string} id - Platform ID
 */
async function deletePlatform(id) {
    if (confirm('Delete Platform?')) {
        await ipcRenderer.invoke('delete-platform', id);
        if (typeof loadAllData === 'function') loadAllData();
    }
}

/**
 * Edit a platform
 * @param {string} id - Platform ID
 */
async function editPlatform(id) {
    const platforms = await ipcRenderer.invoke('get-platforms');
    const platform = platforms.find(p => p.id === id);
    if (platform) {
        openPlatformModal(platform);
    }
}

/**
 * Render platforms table
 * @param {Array} platforms - List of platforms
 */
function renderPlatformTable(platforms) {
    const tbody = document.getElementById('platformBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    platforms.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.name}</td>
            <td>${p.url || '-'}</td>
            <td>
                <button class="btn btn-sm" onclick="editPlatform('${p.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deletePlatform('${p.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openPlatformModal,
        savePlatform,
        deletePlatform,
        editPlatform,
        renderPlatformTable
    };
}
