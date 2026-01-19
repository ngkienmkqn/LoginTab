const BaseNode = require('../BaseNode');

module.exports = {
    id: 'keyboard_action',
    name: 'Keyboard Action',
    description: 'Simulate keyboard key presses (Enter, Tab, Esc, etc.)',
    category: 'Interaction',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        key: {
            type: 'string',
            description: 'Key to press',
            required: true,
            enum: [
                'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
                'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
                'Space', 'Home', 'End', 'PageUp', 'PageDown'
            ]
        },
        delay: {
            type: 'number',
            description: 'Delay after press (ms)',
            default: 100
        }
    },

    outputs: {
        executed: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('KeyboardAction: Browser page not available');

        const { key, delay } = safeInputs;

        await context.page.keyboard.press(key);

        if (delay > 0) {
            await new Promise(r => setTimeout(r, parseInt(delay)));
        }

        return { executed: true, key };
    }
};
