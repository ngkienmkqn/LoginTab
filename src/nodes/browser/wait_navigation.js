const BaseNode = require('../BaseNode');

module.exports = {
    id: 'wait_navigation',
    name: 'Wait Navigation',
    description: 'Wait for page load or network idle.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
            default: 'networkidle2',
            description: 'Wait condition'
        },
        timeout: {
            type: 'number',
            default: 30000,
            description: 'Max wait time (ms)'
        }
    },

    outputs: {
        success: { type: 'boolean' }
    },

    timeoutMs: 60000, // Node timeout > Browser timeout

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        // Puppeteer Wait
        // Note: waitForNavigation only works if a navigation event triggers.
        // Sometimes users just want to wait for network idle without nav.
        // But this node ID is explicit 'wait_navigation'. 

        // If we want generic wait, we might use 'wait' node (Logic).
        // But specifically for 'wait for url change or load', we use this.
        // However, Puppeteer check: if we are already idle, does it resolve? 
        // waitForNavigation waits for a *new* navigation.

        // Safest implementation for "Ensure page is loaded":
        // If we just clicked, we use waitForNavigation. 
        // BUT usually this is paired with an action.
        // Standalone Node: It waits for the NEXT event.

        try {
            await context.page.waitForNavigation({
                waitUntil: safeInputs.waitUntil,
                timeout: safeInputs.timeout
            });
            return { success: true };
        } catch (err) {
            throw new Error(`Navigation Wait Failed: ${err.message}`);
        }
    }
};
