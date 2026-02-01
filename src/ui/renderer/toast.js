/**
 * Toast Notifications Module
 * Extracted from renderer.js for modularity
 */

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type: 'info', 'success', 'warning', 'error', 'sync'
 * @param {number} duration - Duration in ms (0 = no auto-hide)
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        info: '💡',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        sync: '🔄'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '💡'}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

/**
 * Create toast container if it doesn't exist
 */
function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast, createToastContainer };
}
