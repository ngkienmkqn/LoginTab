const BaseNode = require('../BaseNode');
const https = require('https');
const http = require('http');

module.exports = {
    id: 'http_request',
    name: 'HTTP Request',
    description: 'Make an HTTP request.',
    version: '1.0.0',
    category: 'Network',
    riskLevel: 'Medium', // Network Access
    capabilities: ['network:external'],
    idempotency: false, // POST is not idempotent
    resourceLocks: [],

    inputs: {
        url: { type: 'string', required: true, format: 'url' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
        headers: { type: 'json', default: {} },
        body: { type: 'json', default: {} },
        timeout: { type: 'number', default: 30000 }
    },

    outputs: {
        status: { type: 'number' },
        data: { type: 'any' },
        headers: { type: 'json' }
    },

    timeoutMs: 60000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        // 1. Security: Egress Check
        if (context.security) {
            await context.security.checkNetworkEgress(safeInputs.url);
        }

        // 2. Perform Request (using built-in fetch if Node 18+ or generic https)
        // We'll use global fetch if available, or basic logic. 
        // Assuming Node 18+ (Electron usually is).

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), safeInputs.timeout);

            const options = {
                method: safeInputs.method,
                headers: safeInputs.headers,
                signal: controller.signal
            };

            if (safeInputs.method !== 'GET' && safeInputs.method !== 'HEAD') {
                options.body = JSON.stringify(safeInputs.body);
                if (!options.headers['Content-Type']) {
                    options.headers['Content-Type'] = 'application/json';
                }
            }

            const response = await fetch(safeInputs.url, options);
            clearTimeout(timeoutId);

            // Parse Body
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            return {
                status: response.status,
                data: data,
                headers: Object.fromEntries(response.headers.entries())
            };

        } catch (err) {
            throw new Error(`HTTP Request Failed: ${err.message}`);
        }
    }
};
