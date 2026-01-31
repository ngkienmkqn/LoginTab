/**
 * Navigation Module
 * Extracted from renderer.js for modularity
 */

// Current view state
var currentView = 'profiles';

/**
 * Navigate to a different view
 * @param {string} viewName - View name: profiles, automations, settings
 */
function navigate(viewName) {
    currentView = viewName;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });

    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(viewName + 'View');
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // View-specific initialization
    if (viewName === 'automations') {
        if (typeof initDrawflow === 'function') {
            initDrawflow();
        }
        if (typeof refreshWorkflowList === 'function') {
            refreshWorkflowList();
        }
        if (typeof populateWorkflowPlatformSelects === 'function') {
            populateWorkflowPlatformSelects();
        }
    } else if (viewName === 'settings') {
        if (typeof loadDatabaseStats === 'function') {
            loadDatabaseStats();
        }
    }
}

/**
 * Switch between tabs within a view
 * @param {string} tabId - Tab identifier
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');
}

/**
 * Initialize navigation event listeners
 */
function initNavigation() {
    // Nav item clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.dataset.view;
            if (viewName) {
                navigate(viewName);
            }
        });
    });

    // Tab button clicks
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            if (tabId) {
                switchTab(tabId);
            }
        });
    });
}

/**
 * Get current view
 */
function getCurrentView() {
    return currentView;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        navigate,
        switchTab,
        initNavigation,
        getCurrentView
    };
}
