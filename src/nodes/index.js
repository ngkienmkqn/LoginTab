const fs = require('fs');
const path = require('path');

// Whitelist categories to scan
const CATEGORIES = ['logic', 'browser', 'data', 'network', 'system', 'action', 'interaction'];

/**
 * Load all nodes from sub-directories and register them
 * @param {object} automationManager - The AutomationManager instance
 */
function loadNodes(automationManager) {
    console.log('[NodeLoader] Scanning for nodes...');
    let count = 0;

    CATEGORIES.forEach(category => {
        const dir = path.join(__dirname, category);
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

            for (const file of files) {
                try {
                    const nodeModule = require(path.join(dir, file));

                    // Validate Minimal Contract
                    if (nodeModule.id && nodeModule.impl) {
                        automationManager.registerNode(nodeModule, nodeModule.impl);
                        count++;
                    } else {
                        console.warn(`[NodeLoader] Skipped invalid node file: ${category}/${file}. Keys: ${Object.keys(nodeModule)}`);
                    }
                } catch (err) {
                    console.error(`[NodeLoader] Failed to load ${category}/${file}:`, err);
                }
            }
        }
    });

    console.log(`[NodeLoader] Loaded ${count} nodes.`);
}

module.exports = { loadNodes };
