/**
 * Utility Functions Module
 * Extracted from renderer.js for modularity
 */

// Anti-duplicate click protection
var pendingActions = new Set();

/**
 * Wrapper to prevent duplicate button clicks
 * @param {string} actionKey - Unique key for the action
 * @param {Function} fn - Async function to execute
 */
async function withDebounce(actionKey, fn) {
    if (pendingActions.has(actionKey)) {
        console.log('[Debounce] Blocked duplicate:', actionKey);
        return;
    }
    pendingActions.add(actionKey);
    try {
        await fn();
    } finally {
        pendingActions.delete(actionKey);
    }
}

/**
 * Filter table rows by search input
 * @param {HTMLInputElement} input - Search input element
 * @param {string} tbodyId - ID of the tbody to filter
 */
function filterTable(input, tbodyId) {
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        let found = false;
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].textContent.toLowerCase().includes(filter)) {
                found = true;
                break;
            }
        }
        rows[i].style.display = found ? '' : 'none';
    }
}

/**
 * Copy text to clipboard
 * @param {string} id - Element ID containing text to copy
 */
function copyCode(id) {
    const el = document.getElementById(id);
    if (!el) return;

    const text = el.textContent || el.value;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') {
            showToast('Copied to clipboard!', 'success', 2000);
        }
    });
}

/**
 * Toggle dark/light theme
 */
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

/**
 * Initialize theme from localStorage
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        withDebounce,
        filterTable,
        copyCode,
        toggleTheme,
        initTheme,
        pendingActions
    };
}
