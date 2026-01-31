/**
 * Webhook Manager - Handle incoming/outgoing webhooks for workflows
 */

const { v4: uuidv4 } = require('uuid');

class WebhookManager {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:3000';
        this.webhooks = new Map(); // runId:webhookId -> data
        this.pending = new Map();  // Waiting webhooks
    }

    /**
     * Register a webhook listener
     */
    register(runId, webhookId) {
        const key = `${runId}:${webhookId}`;
        this.pending.set(key, {
            registered: Date.now(),
            received: false,
            data: null
        });

        return `${this.baseUrl}/api/workflow-webhook/${runId}/${webhookId}`;
    }

    /**
     * Unregister a webhook
     */
    unregister(runId, webhookId) {
        const key = `${runId}:${webhookId}`;
        this.pending.delete(key);
        this.webhooks.delete(key);
    }

    /**
     * Handle incoming webhook
     */
    receive(runId, webhookId, data) {
        const key = `${runId}:${webhookId}`;

        // Check if waiting
        if (this.pending.has(key)) {
            const pending = this.pending.get(key);
            pending.received = true;
            pending.data = data;
            pending.receivedAt = Date.now();

            this.webhooks.set(key, data);
            return { success: true };
        }

        // Queue for later
        this.webhooks.set(key, data);
        return { success: true, queued: true };
    }

    /**
     * Check if webhook data is available
     */
    check(runId, webhookId) {
        const key = `${runId}:${webhookId}`;
        return this.webhooks.get(key) || null;
    }

    /**
     * Clear all webhooks for a run
     */
    clearRun(runId) {
        for (const key of this.webhooks.keys()) {
            if (key.startsWith(`${runId}:`)) {
                this.webhooks.delete(key);
            }
        }
        for (const key of this.pending.keys()) {
            if (key.startsWith(`${runId}:`)) {
                this.pending.delete(key);
            }
        }
    }
}

/**
 * Human Interaction Manager - Handle pause/continue for manual tasks
 */
class HumanInteractionManager {
    constructor() {
        this.requests = new Map(); // runId -> request data
        this.completed = new Set(); // Completed runIds
    }

    /**
     * Request human action
     */
    requestHumanAction(runId, options) {
        this.requests.set(runId, {
            message: options.message,
            showBrowser: options.showBrowser,
            timeout: options.timeout,
            requestedAt: Date.now()
        });

        // Emit event for UI (to be connected to main process)
        if (global.mainWindow) {
            global.mainWindow.webContents.send('workflow-human-action-required', {
                runId,
                ...options
            });
        }
    }

    /**
     * Mark action as completed
     */
    complete(runId) {
        this.completed.add(runId);
        this.requests.delete(runId);
    }

    /**
     * Check if action is completed
     */
    isCompleted(runId) {
        return this.completed.has(runId);
    }

    /**
     * Get pending request
     */
    getPending(runId) {
        return this.requests.get(runId);
    }

    /**
     * Clear run data
     */
    clearRun(runId) {
        this.requests.delete(runId);
        this.completed.delete(runId);
    }
}

module.exports = { WebhookManager, HumanInteractionManager };
