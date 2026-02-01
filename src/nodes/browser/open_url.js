const BaseNode = require('../BaseNode');

module.exports = {
    id: 'open_url',
    name: 'Open URL',
    description: 'Navigate the active tab to a URL.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low', // But implicitly does network
    capabilities: ['browser:basic'], // Access to browser
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        url: {
            type: 'string',
            required: true,
            format: 'url',
            description: 'Target URL'
        },
        wait: {
            type: 'boolean',
            default: true,
            description: 'Wait for load?'
        }
    },

    outputs: {
        url: { type: 'string' },
        status: { type: 'number' }
    },

    timeoutMs: 60000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        // SECURITY: Egress Check
        // Even though it's a browser, we shouldn't let it browse localhost/internal
        // unless 'network:internal' is granted? Spec says "Network Egress Policy... applies to network:external nodes".
        // open_url doesn't explicitly list network:external. 
        // BUT common sense: Browser should respect Egress Fortress too.
        if (context.security) {
            await context.security.checkNetworkEgress(safeInputs.url);
        }

        const response = await context.page.goto(safeInputs.url, {
            waitUntil: safeInputs.wait ? 'networkidle2' : 'domcontentloaded',
            timeout: 45000
        });

        return {
            url: context.page.url(),
            status: response ? response.status() : 0 // 0 if cache/error
        };
    }
};
