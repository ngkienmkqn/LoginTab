/**
 * Network & External Integration Nodes
 * Based on workflow_spec_v2.md Section 3.3.4 & Section 4
 */

const { CATEGORIES, RISK_LEVELS } = require('../registry');

// ============== HTTP REQUEST ==============
const http_request = {
    id: 'http_request',
    name: 'HTTP Request',
    category: CATEGORIES.NETWORK,
    riskLevel: RISK_LEVELS.HIGH,
    capabilities: ['network:external'],

    inputs: {
        url: { type: 'string', required: true, format: 'url' },
        method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            default: 'GET'
        },
        headers: { type: 'object', default: {} },
        body: { type: 'object', description: 'Request body for POST/PUT/PATCH' },
        timeout: { type: 'number', default: 30000 },
        followRedirects: { type: 'boolean', default: true },
        storeAs: { type: 'string' }
    },

    outputs: {
        statusCode: { type: 'number' },
        responseBody: { type: 'any' },
        headers: { type: 'object' },
        success: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const fetch = require('node-fetch');
        const { url, method, headers, body, timeout, followRedirects, storeAs } = inputs;

        // Replace variables
        let finalUrl = url.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                redirect: followRedirects ? 'follow' : 'manual',
                signal: controller.signal
            };

            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(finalUrl, options);
            clearTimeout(timeoutId);

            let responseBody;
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                responseBody = await response.json();
            } else {
                responseBody = await response.text();
            }

            if (storeAs) {
                context.variables[storeAs] = responseBody;
            }

            return {
                statusCode: response.status,
                responseBody,
                headers: Object.fromEntries(response.headers.entries()),
                success: response.ok
            };
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
};

// ============== SEND WEBHOOK ==============
const send_webhook = {
    id: 'send_webhook',
    name: 'Send Webhook',
    category: CATEGORIES.NETWORK,
    riskLevel: RISK_LEVELS.MEDIUM,
    capabilities: ['network:external'],

    inputs: {
        url: { type: 'string', required: true, format: 'url' },
        method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'], default: 'POST' },
        headers: { type: 'object', default: {} },
        body: { type: 'object', required: true },
        waitForResponse: { type: 'boolean', default: true },
        timeout: { type: 'number', default: 30000 },
        onError: { type: 'string', enum: ['error', 'continue'], default: 'error' }
    },

    outputs: {
        statusCode: { type: 'number' },
        responseBody: { type: 'object' },
        success: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const fetch = require('node-fetch');
        const { url, method, headers, body, waitForResponse, timeout, onError } = inputs;

        // Replace variables in body
        const resolveBody = (obj) => {
            if (typeof obj === 'string') {
                return obj.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');
            }
            if (typeof obj === 'object' && obj !== null) {
                const result = Array.isArray(obj) ? [] : {};
                for (const key in obj) {
                    result[key] = resolveBody(obj[key]);
                }
                return result;
            }
            return obj;
        };

        const finalBody = resolveBody(body);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(finalBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let responseBody = {};
            if (waitForResponse) {
                try {
                    responseBody = await response.json();
                } catch {
                    responseBody = await response.text();
                }
            }

            return {
                statusCode: response.status,
                responseBody,
                success: response.ok
            };
        } catch (error) {
            if (onError === 'continue') {
                return {
                    statusCode: 0,
                    responseBody: { error: error.message },
                    success: false
                };
            }
            throw error;
        }
    }
};

// ============== WAIT FOR WEBHOOK ==============
const wait_for_webhook = {
    id: 'wait_for_webhook',
    name: 'Wait for Webhook',
    category: CATEGORIES.NETWORK,
    riskLevel: RISK_LEVELS.MEDIUM,
    capabilities: ['network:external'],

    inputs: {
        webhookId: { type: 'string', description: 'Custom ID (auto-gen if empty)' },
        timeoutMs: { type: 'number', default: 300000 },
        onTimeout: {
            type: 'string',
            enum: ['error', 'continue', 'skip'],
            default: 'error'
        },
        expectedFields: { type: 'array', default: [] }
    },

    outputs: {
        received: { type: 'boolean' },
        webhookData: { type: 'object' },
        webhookUrl: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { webhookId, timeoutMs, onTimeout, expectedFields } = inputs;
        const { webhookManager, runId } = context;

        // Generate webhook ID if not provided
        const finalId = webhookId || `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Register webhook listener
        const webhookUrl = webhookManager.register(runId, finalId);

        // Store URL in context for display
        context.variables._currentWebhookUrl = webhookUrl;

        // Wait for webhook
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const data = webhookManager.check(runId, finalId);

            if (data) {
                // Validate expected fields
                if (expectedFields.length > 0) {
                    const missing = expectedFields.filter(f => !(f in data));
                    if (missing.length > 0) {
                        throw new Error(`Missing expected fields: ${missing.join(', ')}`);
                    }
                }

                // Store webhook data
                context.variables.webhookData = data;

                return {
                    received: true,
                    webhookData: data,
                    webhookUrl
                };
            }

            await new Promise(r => setTimeout(r, 500)); // Poll every 500ms
        }

        // Timeout handling
        webhookManager.unregister(runId, finalId);

        if (onTimeout === 'error') {
            throw new Error(`Webhook timeout after ${timeoutMs}ms`);
        } else if (onTimeout === 'skip') {
            context._skipNext = true;
        }

        return {
            received: false,
            webhookData: null,
            webhookUrl
        };
    }
};

// ============== WAIT FOR HUMAN ==============
const wait_for_human = {
    id: 'wait_for_human',
    name: 'Wait for Human',
    category: CATEGORIES.ACTION,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        message: { type: 'string', required: true, description: 'Instruction for user' },
        timeoutMs: { type: 'number', default: 600000 },
        showBrowserWindow: { type: 'boolean', default: true }
    },

    outputs: {
        completed: { type: 'boolean' },
        waitTimeMs: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { message, timeoutMs, showBrowserWindow } = inputs;
        const { humanInteractionManager } = context;

        const startTime = Date.now();

        // Show notification
        if (humanInteractionManager) {
            humanInteractionManager.requestHumanAction(context.runId, {
                message,
                showBrowser: showBrowserWindow,
                timeout: timeoutMs
            });
        }

        // Wait for user to click Continue
        while (Date.now() - startTime < timeoutMs) {
            if (humanInteractionManager?.isCompleted(context.runId)) {
                const waitTimeMs = Date.now() - startTime;
                return { completed: true, waitTimeMs };
            }
            await new Promise(r => setTimeout(r, 500));
        }

        throw new Error(`Human interaction timeout after ${timeoutMs}ms`);
    }
};

// Export all network nodes
module.exports = {
    http_request,
    send_webhook,
    wait_for_webhook,
    wait_for_human
};
