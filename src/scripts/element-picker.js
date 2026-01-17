/**
 * Element Picker Client Script
 * Injected into demo page to allow visual element selection
 */

(function () {
    let overlay = null;
    let infoBox = null;
    let selectedElement = null;

    // Create overlay div for highlighting
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = '__element-picker-overlay';
        overlay.style.cssText = `
            position: absolute;
            border: 3px solid #2196F3;
            background: rgba(33, 150, 243, 0.1);
            pointer-events: none;
            z-index: 999999;
            transition: all 0.1s ease;
        `;
        document.body.appendChild(overlay);

        // Info box showing selector
        infoBox = document.createElement('div');
        infoBox.id = '__element-picker-info';
        infoBox.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #2196F3;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            word-break: break-all;
        `;
        infoBox.innerHTML = '🎯 Click on any element to select it';
        document.body.appendChild(infoBox);
    }

    // Generate optimal CSS selector for element
    function getSelector(element) {
        // Priority 1: ID
        if (element.id) {
            return `#${element.id}`;
        }

        // Priority 2: data-* attributes
        const dataAttrs = Array.from(element.attributes).filter(attr => attr.name.startsWith('data-'));
        if (dataAttrs.length > 0) {
            return `[${dataAttrs[0].name}="${dataAttrs[0].value}"]`;
        }

        // Priority 3: Unique class
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            for (let cls of classes) {
                const selector = `.${cls}`;
                if (document.querySelectorAll(selector).length === 1) {
                    return selector;
                }
            }
        }

        // Priority 4: Tag with unique attributes
        if (element.name) {
            const selector = `${element.tagName.toLowerCase()}[name="${element.name}"]`;
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }

        // Priority 5: nth-child path
        let path = [];
        let current = element;
        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            if (current.id) {
                selector += `#${current.id}`;
                path.unshift(selector);
                break;
            } else {
                let sibling = current;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.tagName === current.tagName) nth++;
                }
                if (nth > 1) {
                    selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
            }
            current = current.parentElement;
        }
        return path.join(' > ');
    }

    // Highlight element on hover
    function highlightElement(e) {
        if (e.target.id === '__element-picker-overlay' || e.target.id === '__element-picker-info') {
            return;
        }

        const rect = e.target.getBoundingClientRect();
        overlay.style.top = `${rect.top + window.scrollY}px`;
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        const selector = getSelector(e.target);
        infoBox.innerHTML = `
            🎯 <strong>Hover:</strong><br/>
            ${selector}
        `;
    }

    // Capture element on click
    function captureElement(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.target.id === '__element-picker-overlay' || e.target.id === '__element-picker-info') {
            return;
        }

        selectedElement = e.target;
        const selector = getSelector(selectedElement);

        // Flash green to show selection
        overlay.style.border = '3px solid #4CAF50';
        overlay.style.background = 'rgba(76, 175, 80, 0.2)';
        infoBox.style.background = '#4CAF50';
        infoBox.innerHTML = `✅ <strong>Selected!</strong><br/>${selector}`;

        // Send selector back to Electron
        setTimeout(() => {
            window.__pickedSelector = selector;

            // Dispatch event for Electron to capture
            const event = new CustomEvent('element-selected', {
                detail: { selector }
            });
            window.dispatchEvent(event);

            console.log('[Element Picker] Selected:', selector);
        }, 300);
    }

    // Initialize picker
    function init() {
        createOverlay();
        document.addEventListener('mousemove', highlightElement, true);
        document.addEventListener('click', captureElement, true);
        console.log('[Element Picker] Initialized');
    }

    // Cleanup
    window.__cleanupElementPicker = function () {
        document.removeEventListener('mousemove', highlightElement, true);
        document.removeEventListener('click', captureElement, true);
        if (overlay) overlay.remove();
        if (infoBox) infoBox.remove();
    };

    init();
})();
