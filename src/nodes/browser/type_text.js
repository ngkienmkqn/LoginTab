const BaseNode = require('../BaseNode');

module.exports = {
    id: 'type_text',
    name: 'Type Text',
    description: 'Type text into an input field.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: false,
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: { type: 'string', required: true },
        text: { type: 'string', required: true, sensitive: true }, // Marked sensitive!
        clear: { type: 'boolean', default: true },
        delay: { type: 'number', default: 50, description: 'Delay between keys (ms)' }
    },

    outputs: {
        success: { type: 'boolean' }
    },

    timeoutMs: 30000,

    impl: async (inputs, context) => {
        const resolvedInputs = BaseNode.resolveVariables(inputs, context);
        const safeInputs = BaseNode.validateInputs(resolvedInputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        await context.page.waitForSelector(safeInputs.selector, { visible: true, timeout: 20000 });

        if (safeInputs.clear) {
            // Clear input: select all -> backspace
            await context.page.click(safeInputs.selector, { clickCount: 3 });
            await context.page.keyboard.press('Backspace');
        }

        // Type with delay
        await context.page.type(safeInputs.selector, safeInputs.text, { delay: safeInputs.delay });

        return { success: true };
    }
};
