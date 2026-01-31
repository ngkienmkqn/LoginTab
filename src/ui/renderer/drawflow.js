/**
 * Drawflow Editor Module
 * Extracted from renderer.js for modularity
 */

// Editor state
var editor = null;
var selectedNodeId = null;
var backendNodes = [];
var NODE_TEMPLATES = {};

// Category colors for node styling
const CATEGORY_COLORS = {
    'logic': '#1976d2',    // Blue
    'browser': '#f57f17',  // Orange
    'network': '#7b1fa2',  // Purple
    'data': '#0097a7',     // Teal
    'system': '#455a64'    // Blue Grey
};

/**
 * Show/hide editor panel
 * @param {boolean} show - Whether to show editor
 */
function showEditor(show) {
    const listView = document.getElementById('automation-list-view');
    const editorView = document.getElementById('automation-editor-view');

    if (show) {
        listView.style.display = 'none';
        editorView.style.display = 'flex';
    } else {
        listView.style.display = 'flex';
        editorView.style.display = 'none';
        if (typeof refreshWorkflowList === 'function') {
            refreshWorkflowList();
        }
    }
}

/**
 * Initialize Drawflow editor
 */
function initDrawflow() {
    if (editor) return; // Already initialized

    const container = document.getElementById('drawflow');
    if (!container) return;

    editor = new Drawflow(container);
    editor.reroute = true;
    editor.editor_mode = 'edit';
    editor.start();

    // Zoom settings
    editor.zoom = 1;
    editor.zoom_max = 1.6;
    editor.zoom_min = 0.5;
    editor.zoom_last_value = 1;

    // Event handlers
    editor.on('nodeSelected', (id) => showNodeProperties(id));
    editor.on('nodeUnselected', (id) => closePropertyPanel());
    editor.on('nodeRemoved', (id) => {
        if (selectedNodeId == id) closePropertyPanel();
    });

    // Performance: Add drag class during movement
    let isDragging = false;
    editor.on('mouseMove', (event) => {
        if (editor.drag && !isDragging) {
            isDragging = true;
            container.classList.add('drag');
        }
    });

    editor.on('mouseUp', (event) => {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('drag');
            setTimeout(() => editor.updateConnectionNodes('node-' + editor.ele_selected?.id), 10);
        }
    });

    // Register start node
    editor.registerNode('start', NODE_TEMPLATES.start || '<div class="node-start">▶ Start</div>', {}, {});

    // Register dynamic nodes from backend
    backendNodes.forEach(node => {
        const defaultData = {};
        if (node.inputs) {
            Object.entries(node.inputs).forEach(([key, def]) => {
                defaultData[key] = def.default !== undefined ? def.default : '';
                if (def.type === 'boolean' && def.default === undefined) defaultData[key] = false;
                if (def.type === 'number' && def.default === undefined) defaultData[key] = 0;
            });
        }
        editor.registerNode(node.id, NODE_TEMPLATES[node.id], defaultData, {}, 1, 1);
    });

    // Legacy aliases
    if (!backendNodes.find(n => n.id === 'click')) {
        editor.registerNode('click', NODE_TEMPLATES['click_element'] || 'Click', { selector: '' }, {}, 1, 1);
    }
    if (!backendNodes.find(n => n.id === 'type')) {
        editor.registerNode('type', NODE_TEMPLATES['type_text'] || 'Type', { selector: '', text: '' }, {}, 1, 1);
    }
}

/**
 * Add a node to the editor
 * @param {string} type - Node type
 */
function addNode(type) {
    if (!editor) {
        console.error('Editor is null in addNode');
        alert('Internal Error: Editor not ready');
        return;
    }

    try {
        console.log('Adding node type:', type);

        const posX = Number(editor.pos_x || 0);
        const posY = Number(editor.pos_y || 0);
        const offset = Math.floor(Math.random() * 50);
        const x = -posX + 200 + offset;
        const y = -posY + 200 + offset;

        if (type === 'start') {
            editor.addNode('start', 0, 1, 100, 100, 'start', {}, NODE_TEMPLATES.start);
        } else if (NODE_TEMPLATES[type]) {
            editor.addNode(type, 1, 1, x, y, type, {}, NODE_TEMPLATES[type]);
        } else {
            console.warn('Unknown node type:', type);
            return;
        }

        console.log('✓ Node added successfully:', type);
        if (typeof toggleNodeMenu === 'function') toggleNodeMenu();
        if (typeof markWorkflowChanged === 'function') markWorkflowChanged();
    } catch (e) {
        console.error('Add Node Error:', e);
        alert('Failed to add node: ' + e.message);
    }
}

/**
 * Show node properties panel
 * @param {number} nodeId - Node ID
 */
function showNodeProperties(nodeId) {
    selectedNodeId = nodeId;
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData) return;

    const panel = document.getElementById('property-panel');
    const title = document.getElementById('property-panel-title');
    const content = document.getElementById('property-panel-content');

    if (!panel || !content) return;

    title.textContent = nodeData.class || nodeData.name || 'Node Properties';
    content.innerHTML = '';

    // Generate input fields for node data
    if (nodeData.data) {
        Object.entries(nodeData.data).forEach(([key, value]) => {
            const input = createPropertyInput(key, value, nodeId);
            content.appendChild(input);
        });
    }

    panel.style.display = 'block';
}

/**
 * Create property input element
 */
function createPropertyInput(key, value, nodeId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'property-input-wrapper';

    const label = document.createElement('label');
    label.textContent = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

    const input = document.createElement('input');
    input.type = typeof value === 'number' ? 'number' : 'text';
    input.value = value;
    input.dataset.key = key;
    input.dataset.nodeId = nodeId;

    input.addEventListener('change', () => {
        updateNodeData(nodeId, key, input.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
}

/**
 * Update node data
 * @param {number} nodeId - Node ID
 * @param {string} key - Data key
 * @param {*} value - New value
 */
function updateNodeData(nodeId, key, value) {
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData) return;

    nodeData.data[key] = value;
    editor.updateNodeDataFromId(nodeId, nodeData.data);
    if (typeof markWorkflowChanged === 'function') markWorkflowChanged();
}

/**
 * Close property panel
 */
function closePropertyPanel() {
    const panel = document.getElementById('property-panel');
    if (panel) panel.style.display = 'none';
    selectedNodeId = null;
}

/**
 * Toggle node menu visibility
 */
function toggleNodeMenu() {
    const menu = document.getElementById('node-menu');
    const fab = document.getElementById('fab-add-node');

    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        fab.style.transform = 'rotate(0deg)';
    } else {
        menu.style.display = 'block';
        fab.style.transform = 'rotate(45deg)';
    }
}

/**
 * Zoom controls
 */
function zoomIn() {
    if (editor) editor.zoom_in();
}

function zoomOut() {
    if (editor) editor.zoom_out();
}

function zoomReset() {
    if (editor) editor.zoom_reset();
}

/**
 * Center workflow in viewport
 */
function centerWorkflow() {
    if (!editor) return;

    const drawflowEl = document.getElementById('drawflow');
    const precanvas = drawflowEl?.querySelector('.drawflow');
    if (!precanvas) return;

    const nodes = precanvas.querySelectorAll('.drawflow-node');
    if (nodes.length === 0) return;

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const y = parseInt(node.style.top) || 0;
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const viewportWidth = drawflowEl.offsetWidth;
    const viewportHeight = drawflowEl.offsetHeight;

    editor.canvas_x = viewportWidth / 2 - centerX;
    editor.canvas_y = viewportHeight / 2 - centerY;
    editor.zoom = 1;

    precanvas.style.transform = `translate(${editor.canvas_x}px, ${editor.canvas_y}px) scale(1)`;
}

/**
 * Get editor instance
 */
function getEditor() {
    return editor;
}

/**
 * Set backend nodes
 * @param {Array} nodes - Backend nodes from automation registry
 */
function setBackendNodes(nodes) {
    backendNodes = nodes;
}

/**
 * Set node templates
 * @param {Object} templates - Node HTML templates
 */
function setNodeTemplates(templates) {
    NODE_TEMPLATES = templates;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showEditor,
        initDrawflow,
        addNode,
        showNodeProperties,
        updateNodeData,
        closePropertyPanel,
        toggleNodeMenu,
        zoomIn,
        zoomOut,
        zoomReset,
        centerWorkflow,
        getEditor,
        setBackendNodes,
        setNodeTemplates,
        CATEGORY_COLORS,
        NODE_TEMPLATES,
        backendNodes
    };
}
