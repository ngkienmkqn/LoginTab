/**
 * Node Index - Central export for all automation nodes
 */

const browser = require('./browser');
const logic = require('./logic');
const data = require('./data');
const network = require('./network');
const special = require('./special');

// Combine all nodes
const ALL_NODES = {
    ...browser,
    ...logic,
    ...data,
    ...network,
    ...special
};

/**
 * Get node definition by ID
 */
function getNode(nodeId) {
    return ALL_NODES[nodeId] || null;
}

/**
 * Get all nodes in a category
 */
function getNodesByCategory(category) {
    return Object.values(ALL_NODES).filter(n => n.category === category);
}

/**
 * Get node catalog for UI
 */
function getNodeCatalog() {
    const catalog = {};

    for (const node of Object.values(ALL_NODES)) {
        if (!catalog[node.category]) {
            catalog[node.category] = [];
        }

        catalog[node.category].push({
            id: node.id,
            name: node.name,
            riskLevel: node.riskLevel,
            inputs: Object.keys(node.inputs || {}),
            outputs: Object.keys(node.outputs || {})
        });
    }

    return catalog;
}

// Export
module.exports = {
    ALL_NODES,
    getNode,
    getNodesByCategory,
    getNodeCatalog,
    // Re-export categories
    browser,
    logic,
    data,
    network,
    special
};
