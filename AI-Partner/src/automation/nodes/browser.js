/**
 * Browser Control Nodes
 * Based on workflow_spec_v2.md Section 3.3.1
 */

const { CATEGORIES, RISK_LEVELS } = require('../registry');

// ============== CLICK ELEMENT ==============
const click_element = {
    id: 'click_element',
    name: 'Click Element',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: {
            type: 'string',
            required: true,
            description: 'CSS selector or XPath'
        },
        waitForElement: {
            type: 'boolean',
            default: true,
            description: 'Wait until element exists'
        },
        waitTimeout: {
            type: 'number',
            default: 10000,
            description: 'Wait timeout (ms)'
        },
        clickOffset: {
            type: 'object',
            default: { x: 0, y: 0 },
            description: 'Offset from center'
        }
    },

    outputs: {
        clicked: { type: 'boolean' },
        elementFound: { type: 'boolean' }
    },

    timeoutMs: 30000,
    retryCount: 3,
    retryDelayMs: 1000,

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, waitForElement, waitTimeout, clickOffset } = inputs;

        try {
            if (waitForElement) {
                await page.waitForSelector(selector, { timeout: waitTimeout });
            }

            const element = await page.$(selector);
            if (!element) {
                return { clicked: false, elementFound: false };
            }

            if (clickOffset.x || clickOffset.y) {
                const box = await element.boundingBox();
                await page.mouse.click(
                    box.x + box.width / 2 + clickOffset.x,
                    box.y + box.height / 2 + clickOffset.y
                );
            } else {
                await element.click();
            }

            return { clicked: true, elementFound: true };
        } catch (error) {
            return { clicked: false, elementFound: false, error: error.message };
        }
    }
};

// ============== TYPE TEXT ==============
const type_text = {
    id: 'type_text',
    name: 'Type Text',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: {
            type: 'string',
            required: true,
            description: 'Target input selector'
        },
        text: {
            type: 'string',
            required: true,
            description: 'Text to type (supports {{variables}})'
        },
        clearFirst: {
            type: 'boolean',
            default: true,
            description: 'Clear input before typing'
        },
        delay: {
            type: 'number',
            default: 50,
            description: 'Delay between keystrokes (ms)'
        },
        humanLike: {
            type: 'boolean',
            default: true,
            description: 'Random delay variation'
        }
    },

    outputs: {
        typed: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, text, clearFirst, delay, humanLike } = inputs;

        const element = await page.waitForSelector(selector);

        if (clearFirst) {
            await element.click({ clickCount: 3 }); // Select all
            await page.keyboard.press('Backspace');
        }

        // Replace variables in text
        let finalText = text;
        for (const [key, value] of Object.entries(context.variables || {})) {
            finalText = finalText.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        for (const char of finalText) {
            await element.type(char, { delay: humanLike ? delay + Math.random() * 50 : delay });
        }

        return { typed: true };
    }
};

// ============== OPEN URL ==============
const open_url = {
    id: 'open_url',
    name: 'Open URL',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        url: {
            type: 'string',
            required: true,
            format: 'url',
            description: 'URL to navigate (supports {{variables}})'
        },
        waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
            default: 'networkidle2',
            description: 'Wait condition'
        },
        timeout: {
            type: 'number',
            default: 30000
        }
    },

    outputs: {
        success: { type: 'boolean' },
        finalUrl: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        let { url, waitUntil, timeout } = inputs;

        // Replace variables
        for (const [key, value] of Object.entries(context.variables || {})) {
            url = url.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        await page.goto(url, { waitUntil, timeout });

        return { success: true, finalUrl: page.url() };
    }
};

// ============== WAIT NAVIGATION ==============
const wait_navigation = {
    id: 'wait_navigation',
    name: 'Wait for Navigation',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
            default: 'networkidle2'
        },
        timeout: {
            type: 'number',
            default: 30000
        }
    },

    outputs: {
        success: { type: 'boolean' },
        url: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        await page.waitForNavigation({
            waitUntil: inputs.waitUntil,
            timeout: inputs.timeout
        });
        return { success: true, url: page.url() };
    }
};

// ============== SELECT OPTION ==============
const select_option = {
    id: 'select_option',
    name: 'Select Option',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        value: { type: 'string', required: true, description: 'Value to select' },
        by: {
            type: 'string',
            enum: ['value', 'label', 'index'],
            default: 'value'
        }
    },

    outputs: {
        selected: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, value, by } = inputs;

        if (by === 'value') {
            await page.select(selector, value);
        } else if (by === 'label') {
            await page.$eval(selector, (el, label) => {
                const option = Array.from(el.options).find(o => o.text === label);
                if (option) el.value = option.value;
            }, value);
        } else if (by === 'index') {
            await page.$eval(selector, (el, idx) => el.selectedIndex = parseInt(idx), value);
        }

        return { selected: true };
    }
};

// ============== GET TEXT ==============
const get_text = {
    id: 'get_text',
    name: 'Get Text',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        trim: { type: 'boolean', default: true },
        storeAs: { type: 'string', description: 'Variable name to store result' }
    },

    outputs: {
        text: { type: 'string' },
        found: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, trim, storeAs } = inputs;

        const element = await page.$(selector);
        if (!element) {
            return { text: '', found: false };
        }

        let text = await page.$eval(selector, el => el.textContent || el.innerText);
        if (trim) text = text.trim();

        if (storeAs) {
            context.variables[storeAs] = text;
        }

        return { text, found: true };
    }
};

// ============== ELEMENT EXISTS ==============
const element_exists = {
    id: 'element_exists',
    name: 'Element Exists',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        timeout: { type: 'number', default: 0, description: '0 = no wait' },
        storeAs: { type: 'string', description: 'Variable name' }
    },

    outputs: {
        exists: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, timeout, storeAs } = inputs;

        let exists = false;

        if (timeout > 0) {
            try {
                await page.waitForSelector(selector, { timeout });
                exists = true;
            } catch {
                exists = false;
            }
        } else {
            exists = (await page.$(selector)) !== null;
        }

        if (storeAs) {
            context.variables[storeAs] = exists;
        }

        return { exists };
    }
};

// ============== SCROLL TO ELEMENT ==============
const scroll_to_element = {
    id: 'scroll_to_element',
    name: 'Scroll to Element',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        behavior: {
            type: 'string',
            enum: ['smooth', 'instant', 'auto'],
            default: 'smooth'
        },
        block: {
            type: 'string',
            enum: ['start', 'center', 'end', 'nearest'],
            default: 'center'
        }
    },

    outputs: {
        scrolled: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, behavior, block } = inputs;

        await page.$eval(selector, (el, opts) => {
            el.scrollIntoView({ behavior: opts.behavior, block: opts.block });
        }, { behavior, block });

        return { scrolled: true };
    }
};

// ============== HOVER ELEMENT ==============
const hover_element = {
    id: 'hover_element',
    name: 'Hover Element',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        delay: { type: 'number', default: 0, description: 'Hover duration (ms)' }
    },

    outputs: {
        hovered: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, delay } = inputs;

        await page.hover(selector);

        if (delay > 0) {
            await new Promise(r => setTimeout(r, delay));
        }

        return { hovered: true };
    }
};

// ============== GET ATTRIBUTE ==============
const get_attribute = {
    id: 'get_attribute',
    name: 'Get Attribute',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        attribute: { type: 'string', required: true },
        storeAs: { type: 'string' }
    },

    outputs: {
        value: { type: 'string' },
        found: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, attribute, storeAs } = inputs;

        const value = await page.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);

        if (storeAs && value !== null) {
            context.variables[storeAs] = value;
        }

        return { value: value || '', found: value !== null };
    }
};

// ============== CLEAR INPUT ==============
const clear_input = {
    id: 'clear_input',
    name: 'Clear Input',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true }
    },

    outputs: {
        cleared: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        await page.click(inputs.selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        return { cleared: true };
    }
};

// ============== WAIT ELEMENT ==============
const wait_element = {
    id: 'wait_element',
    name: 'Wait for Element',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        selector: { type: 'string', required: true },
        state: {
            type: 'string',
            enum: ['visible', 'hidden', 'attached', 'detached'],
            default: 'visible'
        },
        timeout: { type: 'number', default: 30000 }
    },

    outputs: {
        found: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, state, timeout } = inputs;

        const options = { timeout };

        if (state === 'hidden') {
            await page.waitForSelector(selector, { ...options, hidden: true });
        } else if (state === 'detached') {
            await page.waitForFunction(
                sel => !document.querySelector(sel),
                { timeout },
                selector
            );
        } else {
            await page.waitForSelector(selector, { ...options, visible: state === 'visible' });
        }

        return { found: true };
    }
};

// Export all browser nodes
module.exports = {
    click_element,
    type_text,
    open_url,
    wait_navigation,
    select_option,
    get_text,
    element_exists,
    scroll_to_element,
    hover_element,
    get_attribute,
    clear_input,
    wait_element
};
