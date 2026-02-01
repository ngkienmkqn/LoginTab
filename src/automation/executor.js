/**
 * Workflow Executor Engine v2
 * Based on workflow_spec_v2.md
 */

const { getNode, ALL_NODES } = require('./nodes');
const { canExecuteNode, RISK_AUDIT } = require('./registry');
const { v4: uuidv4 } = require('uuid');

/**
 * Workflow Executor - Runs workflow definitions
 */
class WorkflowExecutor {
    constructor(options = {}) {
        this.db = options.db;
        this.browserManager = options.browserManager;
        this.logger = options.logger || console;
        this.webhookManager = options.webhookManager;
        this.humanInteractionManager = options.humanInteractionManager;

        this.runs = new Map(); // Active runs
    }

    /**
     * Execute a workflow
     */
    async execute(workflow, options = {}) {
        const runId = uuidv4();
        const { profile, caller, variables = {} } = options;

        // Initialize run context
        const context = {
            runId,
            workflowId: workflow.id,
            caller,
            profile,
            variables: { ...variables },
            globalVariables: {},
            page: null,
            browser: null,
            db: this.db,
            logger: this.logger,
            webhookManager: this.webhookManager,
            humanInteractionManager: this.humanInteractionManager,
            startTime: Date.now(),
            status: 'running',
            currentNodeId: null,
            executedNodes: [],
            errors: []
        };

        this.runs.set(runId, context);

        try {
            // Parse workflow data
            const nodes = this._parseNodes(workflow.data);
            const edges = this._parseEdges(workflow.data);

            // Find start node
            const startNode = nodes.find(n => n.type === 'start') || nodes[0];
            if (!startNode) {
                throw new Error('Workflow has no start node');
            }

            // Get browser page if profile provided
            if (profile && this.browserManager) {
                const browserData = await this.browserManager.getBrowserForProfile(profile.id);
                context.browser = browserData.browser;
                context.page = browserData.page;
            }

            // Execute from start node
            await this._executeNode(startNode, nodes, edges, context);

            // Complete
            context.status = context._stopStatus || 'completed';
            context.endTime = Date.now();

            return {
                runId,
                status: context.status,
                duration: context.endTime - context.startTime,
                variables: context.variables,
                executedNodes: context.executedNodes,
                errors: context.errors
            };

        } catch (error) {
            context.status = 'error';
            context.error = error.message;
            context.endTime = Date.now();

            this.logger.error({
                runId,
                error: error.message,
                stack: error.stack
            });

            return {
                runId,
                status: 'error',
                error: error.message,
                duration: context.endTime - context.startTime,
                executedNodes: context.executedNodes,
                errors: [...context.errors, error.message]
            };

        } finally {
            this.runs.delete(runId);
        }
    }

    /**
     * Execute a single node
     */
    async _executeNode(node, allNodes, edges, context) {
        // Check for stop/break signals
        if (context._stopWorkflow || context._breakLoop) {
            return;
        }

        context.currentNodeId = node.id;
        const nodeDef = getNode(node.type);

        if (!nodeDef) {
            throw new Error(`Unknown node type: ${node.type}`);
        }

        // Check permissions
        if (!canExecuteNode(context.caller?.role || 'staff', nodeDef)) {
            throw new Error(`Permission denied for node: ${node.type}`);
        }

        // Audit logging for risky nodes
        const riskConfig = RISK_AUDIT[nodeDef.riskLevel];
        if (riskConfig?.audit) {
            this.logger.info({
                event: 'node_execution',
                runId: context.runId,
                nodeId: node.id,
                nodeType: node.type,
                riskLevel: nodeDef.riskLevel,
                caller: context.caller?.id
            });
        }

        // Prepare inputs
        const inputs = this._resolveInputs(node.data || {}, nodeDef.inputs, context);

        // Execute with retry logic
        let result;
        let lastError;
        const retryCount = nodeDef.retryCount || 0;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = nodeDef.retryDelayMs || 1000;
                    await new Promise(r => setTimeout(r, delay * attempt));
                }

                result = await nodeDef.impl(inputs, context);
                break;

            } catch (error) {
                lastError = error;
                if (attempt === retryCount) {
                    throw error;
                }
            }
        }

        // Track execution
        context.executedNodes.push({
            id: node.id,
            type: node.type,
            inputs,
            outputs: result,
            timestamp: Date.now()
        });

        // Handle loop nodes
        if (nodeDef.isLoopStart && result._loopData) {
            await this._executeLoop(node, allNodes, edges, context, result);
            return;
        }

        // Handle condition nodes (2 output ports)
        if (nodeDef.outputPorts === 2) {
            const outputPort = result.outputPort || (result.result ? 1 : 2);
            const nextEdges = edges.filter(e =>
                e.sourceId === node.id &&
                (e.sourceOutput === `output_${outputPort}` || e.sourceOutput === outputPort.toString())
            );

            for (const edge of nextEdges) {
                const nextNode = allNodes.find(n => n.id === edge.targetId);
                if (nextNode) {
                    await this._executeNode(nextNode, allNodes, edges, context);
                }
            }
            return;
        }

        // Execute next nodes
        const nextEdges = edges.filter(e => e.sourceId === node.id);
        for (const edge of nextEdges) {
            const nextNode = allNodes.find(n => n.id === edge.targetId);
            if (nextNode) {
                await this._executeNode(nextNode, allNodes, edges, context);
            }
        }
    }

    /**
     * Execute loop
     */
    async _executeLoop(loopNode, allNodes, edges, context, loopConfig) {
        const { _loopData, _itemVar, _indexVar } = loopConfig;

        // Find nodes inside loop (connected after loop start)
        const loopBodyEdges = edges.filter(e => e.sourceId === loopNode.id);

        for (let i = 0; i < _loopData.length; i++) {
            // Check break
            if (context._breakLoop) {
                context._breakLoop = false;
                break;
            }

            // Set loop variables
            context.variables[_itemVar] = _loopData[i];
            context.variables[_indexVar] = i;

            // Execute loop body
            for (const edge of loopBodyEdges) {
                // Check continue
                if (context._continueLoop) {
                    context._continueLoop = false;
                    break;
                }

                const nextNode = allNodes.find(n => n.id === edge.targetId);
                if (nextNode) {
                    await this._executeNode(nextNode, allNodes, edges, context);
                }
            }
        }
    }

    /**
     * Parse nodes from workflow data
     */
    _parseNodes(workflowData) {
        if (!workflowData) return [];

        // Handle Drawflow format
        if (workflowData.drawflow) {
            const nodes = [];
            const homeData = workflowData.drawflow.Home?.data || {};

            for (const [id, node] of Object.entries(homeData)) {
                nodes.push({
                    id,
                    type: node.name || node.class,
                    data: node.data || {},
                    pos: { x: node.pos_x, y: node.pos_y }
                });
            }

            return nodes;
        }

        // Direct array format
        return workflowData.nodes || [];
    }

    /**
     * Parse edges from workflow data
     */
    _parseEdges(workflowData) {
        if (!workflowData) return [];

        // Handle Drawflow format
        if (workflowData.drawflow) {
            const edges = [];
            const homeData = workflowData.drawflow.Home?.data || {};

            for (const [nodeId, node] of Object.entries(homeData)) {
                const outputs = node.outputs || {};

                for (const [outputName, output] of Object.entries(outputs)) {
                    for (const conn of output.connections || []) {
                        edges.push({
                            sourceId: nodeId,
                            sourceOutput: outputName,
                            targetId: conn.node,
                            targetInput: conn.output
                        });
                    }
                }
            }

            return edges;
        }

        // Direct array format
        return workflowData.edges || [];
    }

    /**
     * Resolve input values with variable substitution
     */
    _resolveInputs(nodeData, inputDefs, context) {
        const resolved = {};

        for (const [key, def] of Object.entries(inputDefs || {})) {
            let value = nodeData[key];

            // Use default if not provided
            if (value === undefined && def.default !== undefined) {
                value = def.default;
            }

            // Substitute variables
            if (typeof value === 'string') {
                value = value.replace(/\{\{(\w+)\}\}/g, (m, varName) => {
                    // Check workflow variables
                    if (context.variables[varName] !== undefined) {
                        return context.variables[varName];
                    }
                    // Check profile data
                    if (context.profile && context.profile[varName] !== undefined) {
                        return context.profile[varName];
                    }
                    // Check global variables
                    if (context.globalVariables[varName] !== undefined) {
                        return context.globalVariables[varName];
                    }
                    return '';
                });
            }

            resolved[key] = value;
        }

        return resolved;
    }

    /**
     * Get status of a run
     */
    getRunStatus(runId) {
        const run = this.runs.get(runId);
        if (!run) return null;

        return {
            runId,
            status: run.status,
            currentNodeId: run.currentNodeId,
            executedNodes: run.executedNodes.length,
            duration: Date.now() - run.startTime,
            errors: run.errors
        };
    }

    /**
     * Cancel a running workflow
     */
    cancelRun(runId) {
        const run = this.runs.get(runId);
        if (run) {
            run._stopWorkflow = true;
            run._stopReason = 'Cancelled by user';
            run._stopStatus = 'cancelled';
            return true;
        }
        return false;
    }
}

module.exports = { WorkflowExecutor };
