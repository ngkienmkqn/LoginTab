const { ipcMain } = require('electron');
const { SecurityManager, ERRORS } = require('./SecurityManager');
const { loadNodes } = require('../nodes');

class AutomationManager {
    constructor(browserManager) {
        this.browserManager = browserManager;
        this.security = new SecurityManager();
        this.nodeRegistry = new Map();

        // Register core nodes
        this.registerNode(require('../nodes/browser/type_text'));
        this.registerNode(require('../nodes/browser/upload_file'));
        this.registerNode(require('../nodes/browser/wait_navigation'));

        // Interaction
        this.registerNode(require('../nodes/interaction/keyboard_action'));

        // Action
        this.registerNode(require('../nodes/action/wait_element'));

        // Data
        this.registerNode(require('../nodes/data/db_select'));
        this.registerNode(require('../nodes/data/db_write'));
        this.registerNode(require('../nodes/data/db_delete'));

        this.runningContexts = new Map(); // runId -> context

        console.log('[AutomationManager] Initialized with Security Core v1.3.2');

        // Auto-load Nodes
        loadNodes(this);
    }

    /**
     * Get all registered nodes as JSON-serializable array
     * @returns {Array} List of node definitions
     */
    getRegistryJson() {
        return Array.from(this.nodeRegistry.values()).map(v => {
            const s = v.schema;
            // Deep copy inputs to scrub
            const safeInputs = {};
            if (s.inputs) {
                for (const [key, def] of Object.entries(s.inputs)) {
                    safeInputs[key] = { ...def };
                    if (def.sensitive) delete safeInputs[key].default; // Scrub secret defaults
                }
            }
            return {
                id: s.id,
                name: s.name,
                description: s.description,
                category: s.category,
                riskLevel: s.riskLevel,
                inputs: safeInputs, // Use scrubbed inputs
                outputs: s.outputs,
                capabilities: s.capabilities // Useful for UI hints
            };
        });
    }

    /**
     * Register a node type with the engine
     * @param {object} nodeSchema 
     * @param {function} implementation 
     */
    registerNode(nodeSchema, implementation) {
        if (!nodeSchema.id || !nodeSchema.capabilities) {
            console.error(`[Automation] Invalid schema for node: ${nodeSchema?.id}`);
            return;
        }
        this.nodeRegistry.set(nodeSchema.id, { schema: nodeSchema, impl: implementation });
        console.log(`[Automation] Registered node: ${nodeSchema.id} [${nodeSchema.riskLevel}]`);
    }

    /**
     * Main entry point for workflow execution
     * @param {object} workflowData 
     * @param {object} page (Puppeteer Page)
     * @param {object} userProfile (Role, Context)
     * @param {object} profileContext (Runtime Profile Data: username, password, etc)
     */
    async runWorkflow(workflowData, page, userProfile = {}, profileContext = {}) {
        const runId = Date.now().toString();
        console.log(`[Automation] Starting Run ${runId}...`);

        // Mock Context Initialization
        const context = {
            runId,
            variables: {},
            secrets: {},
            lastResult: null,
            role: userProfile.role || 'staff', // Default to low privilege
            page: page,
            profile: profileContext // Inject Profile Data
        };
        this.runningContexts.set(runId, context);
        console.log(`[Automation] Context Initialized. Profile Keys:`, Object.keys(context.profile));
        console.log(`[Automation] Profile Username:`, context.profile.username ? '***' : 'UNDEFINED/EMPTY');

        try {
            // Legacy Adapter: specific to current Drawflow structure
            // We assume the structure is still the same for Phase 0 tests
            if (workflowData?.drawflow?.Home?.data) {
                const nodes = workflowData.drawflow.Home.data;
                // Find start
                let startNodeId = Object.keys(nodes).find(id => nodes[id].name === 'start');
                if (startNodeId) {
                    await this.executeNodeLegacy(startNodeId, nodes, context);
                }
            }
        } catch (err) {
            console.error(`[Automation] Run ${runId} Failed:`, err);
        } finally {
            this.runningContexts.delete(runId);
        }
    }

    /**
     * Legacy Executor (Adapter) - Refactored to use Security Checks
     * This bridges the old data format to the new Security Engine
     */
    async executeNodeLegacy(nodeId, allNodes, context) {
        const nodeData = allNodes[nodeId];
        if (!nodeData) return;

        // Map old node names to new Spec IDs (Temporary Mapping for Phase 0)
        // 'click' -> 'click_element'
        // 'type' -> 'type_text'
        // 'wait' -> 'wait_navigation' (approx)
        const specId = this.mapLegacyToSpec(nodeData.name);

        console.log(`[Automation] Executing ${nodeData.name} -> Spec: ${specId}`);

        // 1. SECURITY CHECK (The Core of Phase 0)
        // If we have a registered spec, we enforce it.
        // If not, we block execution if it's high risk, or allow if "Legacy Mode" (Staff role).

        // For Phase 0, we simulate a check on a "system:shell" node to prove RBAC works
        if (specId === 'exec_cmd') {
            // This needs 'system:shell'
            if (!this.security.checkCapability(context.role, ['system:shell'])) {
                throw new Error(`${ERRORS.ERR_ACCESS_DENIED}: Role ${context.role} cannot execute ${specId}`);
            }
        }

        // 2. SANDBOX CHECK (Simulated for file nodes)
        if (specId === 'upload_file' && nodeData.data.filePath) {
            this.security.validatePath(nodeData.data.filePath);
        }

        // 3. EXECUTION
        const nodeDef = this.nodeRegistry.get(specId);
        if (nodeDef && nodeDef.impl) {
            try {
                // Execute the node
                const result = await nodeDef.impl(nodeData.data, context);

                // Store result (optional, for future nodes to use)
                if (result) {
                    context.lastResult = result;
                    // TODO: Map outputs to context variables if configured
                }
            } catch (err) {
                console.error(`[Automation] Node ${specId} Failed:`, err);
                // Stop workflow on error? For now, yes.
                throw err;
            }
        } else {
            console.warn(`[Automation] No implementation found for ${specId}`);
        }

        // Find outputs
        const outputs = nodeData.outputs;
        if (outputs && outputs.output_1 && outputs.output_1.connections) {
            for (const conn of outputs.output_1.connections) {
                await this.executeNodeLegacy(conn.node, allNodes, context);
            }
        }
    }

    mapLegacyToSpec(legacyName) {
        const map = {
            'start': 'start',
            'click': 'click_element',
            'type': 'type_text',
            'wait': 'wait_navigation',
            'find': 'wait_element'
        };
        return map[legacyName] || legacyName;
    }
}

module.exports = AutomationManager;
