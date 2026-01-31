/**
 * Workflow Management UI Module
 * Extracted from renderer.js for modularity
 */

const { ipcRenderer } = require('electron');

// State
var currentWorkflowId = null;
var workflowHasChanges = false;
var allWorkflows = [];

/**
 * Create a new workflow
 */
async function createNewWorkflow() {
    if (typeof showEditor === 'function') {
        showEditor(true);
    }
    if (typeof initDrawflow === 'function') {
        initDrawflow();
    }

    currentWorkflowId = null;
    workflowHasChanges = false;

    // Reset form
    const nameInput = document.getElementById('workflowNameInput');
    if (nameInput) nameInput.value = '';

    const platformInput = document.getElementById('workflowPlatformInput');
    if (platformInput) platformInput.value = 'all';

    // Clear editor and add start node
    setTimeout(() => {
        if (typeof editor !== 'undefined' && editor) {
            editor.clear();
            if (typeof NODE_TEMPLATES !== 'undefined' && NODE_TEMPLATES.start) {
                editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
            }
        }
    }, 50);
}

/**
 * Refresh workflow list in table
 */
async function refreshWorkflowList() {
    if (typeof populateWorkflowPlatformSelects === 'function') {
        await populateWorkflowPlatformSelects();
    }

    const tbody = document.getElementById('automationTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    const workflows = await ipcRenderer.invoke('get-workflows');
    allWorkflows = workflows;

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

    filterWorkflows();
}

/**
 * Load a workflow for editing
 * @param {string} workflowId - Workflow ID
 */
async function loadWorkflow(workflowId) {
    if (!workflowId) return;
    console.log('Loading workflow ID:', workflowId);

    if (typeof showEditor === 'function') showEditor(true);
    if (typeof initDrawflow === 'function') initDrawflow();

    const res = await ipcRenderer.invoke('load-workflow', workflowId);
    if (res.success) {
        currentWorkflowId = workflowId;

        const importData = {
            drawflow: {
                Home: {
                    data: res.workflow.graph_data || {},
                    version: '0.1'
                }
            }
        };

        // Repair missing HTML
        if (importData.drawflow.Home.data) {
            Object.values(importData.drawflow.Home.data).forEach(node => {
                if (node.typenode === undefined) {
                    node.typenode = false;
                }
                if (!node.html || node.html.length < 50) {
                    const type = node.class || node.name;
                    if (typeof NODE_TEMPLATES !== 'undefined' && NODE_TEMPLATES[type]) {
                        node.html = NODE_TEMPLATES[type];
                    }
                }
            });
        }

        // Set Name & Platform
        const nameInput = document.getElementById('workflowNameInput');
        if (nameInput) nameInput.value = res.workflow.name;

        if (typeof populateWorkflowPlatformSelects === 'function') {
            await populateWorkflowPlatformSelects();
        }
        const platformInput = document.getElementById('workflowPlatformInput');
        if (platformInput) platformInput.value = res.workflow.platform || 'all';

        setTimeout(() => {
            if (typeof editor !== 'undefined' && editor) {
                editor.clear();
                if (!res.workflow.graph_data || Object.keys(res.workflow.graph_data).length === 0) {
                    if (typeof NODE_TEMPLATES !== 'undefined' && NODE_TEMPLATES.start) {
                        editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
                    }
                } else {
                    try {
                        editor.import(importData);
                    } catch (e) {
                        console.error("Import Failed:", e);
                        alert("Workflow data corrupted, resetting.");
                        editor.clear();
                        if (typeof NODE_TEMPLATES !== 'undefined' && NODE_TEMPLATES.start) {
                            editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
                        }
                    }
                }
            }
        }, 50);
    } else {
        alert('Error loading: ' + res.error);
        if (typeof showEditor === 'function') showEditor(false);
    }
}

/**
 * Delete a workflow
 * @param {string} id - Workflow ID
 */
async function deleteWorkflow(id) {
    if (!confirm("Are you sure you want to delete this workflow?")) return;

    const res = await ipcRenderer.invoke('delete-workflow', id);
    if (res.success) {
        if (typeof showToast === 'function') {
            showToast('Workflow deleted', 'success');
        }
        refreshWorkflowList();
    } else {
        alert('Delete failed: ' + res.error);
    }
}

/**
 * Save current workflow
 */
async function saveWorkflow() {
    const nameInput = document.getElementById('workflowNameInput');
    const platformInput = document.getElementById('workflowPlatformInput');

    const name = nameInput?.value?.trim();
    if (!name) {
        alert('Please enter a workflow name');
        return;
    }

    if (typeof editor === 'undefined' || !editor) {
        alert('Editor not initialized');
        return;
    }

    const exportData = editor.export();
    const graphData = exportData?.drawflow?.Home?.data || {};

    const payload = {
        id: currentWorkflowId,
        name,
        platform: platformInput?.value || 'all',
        graph_data: graphData,
        createdBy: global.currentAuthUser?.username || 'system'
    };

    const res = await ipcRenderer.invoke('save-workflow', payload);
    if (res.success) {
        currentWorkflowId = res.id;
        workflowHasChanges = false;

        if (typeof showToast === 'function') {
            showToast('Workflow saved!', 'success');
        }

        refreshWorkflowList();
    } else {
        alert('Save failed: ' + res.error);
    }
}

/**
 * Filter workflows by platform
 */
function filterWorkflows() {
    const platformFilter = document.getElementById('workflowPlatformFilter')?.value || '';
    const searchTerm = document.getElementById('workflowSearch')?.value?.toLowerCase() || '';

    const tbody = document.getElementById('automationTableBody');
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');

    for (let row of rows) {
        const name = row.children[0]?.textContent?.toLowerCase() || '';
        const platform = row.getAttribute('data-platform') || 'all';

        let show = true;

        if (searchTerm && !name.includes(searchTerm)) show = false;
        if (platformFilter && platformFilter !== '' && platform !== platformFilter) show = false;

        row.style.display = show ? '' : 'none';
    }
}

/**
 * Run automation on a specific profile
 * @param {string} profileId - Profile/Account ID
 */
async function runAutomation(profileId) {
    const workflowSelect = document.getElementById('workflowSelect');
    const workflowId = workflowSelect?.value;

    if (!workflowId) {
        alert('Please select a workflow');
        return;
    }

    if (typeof showToast === 'function') {
        showToast('Starting automation...', 'info');
    }

    const res = await ipcRenderer.invoke('run-automation-on-profile', {
        profileId,
        workflowId
    });

    if (res.success) {
        if (typeof showToast === 'function') {
            showToast('Automation started successfully!', 'success');
        }
    } else {
        alert('Automation failed: ' + res.error);
    }
}

/**
 * Mark workflow as changed (unsaved)
 */
function markWorkflowChanged() {
    workflowHasChanges = true;
    const saveBtn = document.getElementById('saveWorkflowBtn');
    if (saveBtn) {
        saveBtn.classList.add('btn-unsaved');
    }
}

/**
 * Close workflow editor
 */
function closeEditor() {
    if (workflowHasChanges) {
        if (!confirm('You have unsaved changes. Close anyway?')) {
            return;
        }
    }
    if (typeof showEditor === 'function') showEditor(false);
    currentWorkflowId = null;
    workflowHasChanges = false;
}

/**
 * Clear all workflows (with confirmation)
 */
async function clearAllWorkflows() {
    if (!confirm('Delete ALL workflows? This cannot be undone.')) return;

    const res = await ipcRenderer.invoke('clear-all-workflows');
    if (res.success) {
        if (typeof showToast === 'function') {
            showToast('All workflows cleared', 'success');
        }
        refreshWorkflowList();
    } else {
        alert('Failed: ' + res.error);
    }
}

/**
 * Get current workflow ID
 */
function getCurrentWorkflowId() {
    return currentWorkflowId;
}

/**
 * Get all workflows
 */
function getAllWorkflows() {
    return allWorkflows;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createNewWorkflow,
        refreshWorkflowList,
        loadWorkflow,
        deleteWorkflow,
        saveWorkflow,
        filterWorkflows,
        runAutomation,
        markWorkflowChanged,
        closeEditor,
        clearAllWorkflows,
        getCurrentWorkflowId,
        getAllWorkflows,
        allWorkflows
    };
}
