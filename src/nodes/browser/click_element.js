const BaseNode = require('../BaseNode');

module.exports = {
    id: 'click_element',
    name: 'Click Element',
    description: 'Click an element on the page.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: false, // Clicking might trigger action
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: {
            type: 'string',
            required: true,
            description: 'CSS Selector or XPath (starts with //)'
        },
        button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left'
        },
        clickCount: {
            type: 'number',
            default: 1
        }
    },

    outputs: {
        clicked: { type: 'boolean' }
    },

    timeoutMs: 30000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        // Support XPath if starts with //
        let selector = safeInputs.selector;
        if (selector.startsWith('//') || selector.startsWith('xpath=')) {
            // Puppeteer handles xpath if passed correctly? 
            // Actually page.click(selector) supports some xpath if using searchForXPath?
            // Standard Puppeteer 22+ click() takes a selector string. 
            // If it's xpath, we might need to find element first.

            if (selector.startsWith('xpath=')) selector = selector.substring(6);

            const [element] = await context.page.$x(selector);
            if (!element) throw new Error(`XPath element not found: ${selector}`);

            await element.click({
                button: safeInputs.button,
                clickCount: safeInputs.clickCount,
                delay: 50 // Human-like delay
            });
        } else {
            // CSS Selector
            await context.page.waitForSelector(selector, { visible: true, timeout: 20000 });
            await context.page.click(selector, {
                button: safeInputs.button,
                clickCount: safeInputs.clickCount,
                delay: 50
            });
        }

        return { clicked: true };
    }
};
