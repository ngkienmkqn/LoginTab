/**
 * Modal Management Module
 * Extracted from renderer.js for modularity
 */

/**
 * Show a generic modal with custom content
 * @param {string} title - Modal title
 * @param {string} htmlContent - HTML content for modal body
 */
function showModal(title, htmlContent) {
    // Remove existing generic modal if any
    const existingModal = document.getElementById('genericModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'genericModal';
    modal.className = 'modal active';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="close-btn" onclick="closeModal('genericModal')">×</button>
            </div>
            <div class="modal-body">
                ${htmlContent}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('genericModal');
        }
    });
}

/**
 * Close a modal by ID
 * @param {string} id - Modal element ID
 */
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        // For generic modals, remove from DOM
        if (id === 'genericModal') {
            modal.remove();
        }
    }
}

/**
 * Open a modal by ID
 * @param {string} id - Modal element ID
 */
function openModalById(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Initialize modal event listeners
 */
function initModalListeners() {
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                closeModal(activeModal.id);
            }
        }
    });

    // Close modals on backdrop click (for static modals)
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showModal,
        closeModal,
        openModalById,
        initModalListeners
    };
}
