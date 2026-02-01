/**
 * Automation Engine v2 - Main Entry Point
 * Based on workflow_spec_v2.md
 */

const { WorkflowExecutor } = require('./executor');
const { WebhookManager, HumanInteractionManager } = require('./managers');
const { ALL_NODES, getNode, getNodeCatalog } = require('./nodes');
const {
    CATEGORIES,
    RISK_LEVELS,
    hasCapability,
    canExecuteNode
} = require('./registry');

/**
 * Create automation engine instance
 */
function createAutomationEngine(options = {}) {
    const webhookManager = new WebhookManager({
        baseUrl: options.baseUrl || 'http://localhost:3000'
    });

    const humanInteractionManager = new HumanInteractionManager();

    const executor = new WorkflowExecutor({
        db: options.db,
        browserManager: options.browserManager,
        logger: options.logger,
        webhookManager,
        humanInteractionManager
    });

    return {
        executor,
        webhookManager,
        humanInteractionManager,

        // Execute workflow
        execute: (workflow, opts) => executor.execute(workflow, opts),

        // Get run status
        getRunStatus: (runId) => executor.getRunStatus(runId),

        // Cancel run
        cancelRun: (runId) => executor.cancelRun(runId),

        // Handle incoming webhook
        handleWebhook: (runId, webhookId, data) => webhookManager.receive(runId, webhookId, data),

        // Complete human interaction
        completeHumanAction: (runId) => humanInteractionManager.complete(runId),

        // Get node catalog for UI
        getNodeCatalog
    };
}

// Export
module.exports = {
    createAutomationEngine,
    WorkflowExecutor,
    WebhookManager,
    HumanInteractionManager,
    ALL_NODES,
    getNode,
    getNodeCatalog,
    CATEGORIES,
    RISK_LEVELS,
    hasCapability,
    canExecuteNode
};
