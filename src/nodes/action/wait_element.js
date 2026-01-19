const BaseNode = require('../BaseNode');

module.exports = {
    id: 'wait_element',
    name: 'Wait for Element',
    description: 'Waits for an element to appear (or disappear) on the page.',
    category: 'Action',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: {
            type: 'string',
            description: 'CSS Selector to wait for',
            required: true,
            inputType: 'selector' // Uses Picker
        },
        timeout: {
            type: 'number',
            description: 'Max time to wait (ms)',
            default: 30000
        },
        state: {
            type: 'string',
            description: 'Wait condition',
            default: 'visible',
            options: ['visible', 'hidden', 'attached', 'detached']
        }
    },

    outputs: {
        found: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('WaitElement: Browser page not available');

        const { selector, timeout, state } = safeInputs;

        // Map state to puppeteer options
        const options = { timeout: parseInt(timeout) };
        if (state === 'visible') options.visible = true;
        if (state === 'hidden') options.hidden = true;
        if (state === 'attached') options.visible = false;

        await context.page.waitForSelector(selector, options);

        return { found: true };
    }
};
