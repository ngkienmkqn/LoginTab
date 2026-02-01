const BaseNode = require('../BaseNode');

module.exports = {
    id: 'get_text',
    name: 'Get Text/Content',
    description: 'Extract text or HTML from an element.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: { type: 'string', required: true },
        property: {
            type: 'string',
            enum: ['innerText', 'innerHTML', 'textContent', 'value'],
            default: 'innerText'
        }
    },

    outputs: {
        text: { type: 'string', description: 'Extracted content' }
    },

    timeoutMs: 15000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        await context.page.waitForSelector(safeInputs.selector, { timeout: 10000 });

        // Evaluate in browser context
        const content = await context.page.$eval(safeInputs.selector, (el, prop) => {
            return el[prop] || '';
        }, safeInputs.property);

        return { text: content };
    }
};
