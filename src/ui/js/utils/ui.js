const { ipcRenderer } = require('electron');
const jsQR = require('jsqr');
const protobuf = require('protobufjs');
const base32 = require('hi-base32');

// --- Global UI State ---
let selectedTab = 'profiles';

// --- Navigation ---
function navigate(viewName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const navItem = document.getElementById(`nav-${viewName}`);
    if (navItem) navItem.classList.add('active');

    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

    const view = document.getElementById(`view-${viewName}`);
    if (view) view.style.display = 'block';

    selectedTab = viewName;

    // Apply Permissions (ensure this is called or handled globally)
    if (window.currentUser && window.authModule) {
        window.authModule.applyPermissions();
    }

    // Special handlers
    if (viewName === 'database') {
        loadDatabaseStats();
    }
}

function switchTab(tabId, event) {
    // Find parent modal to scope the tab switching
    // This assumes tab structure: .modal-tabs > .tab-btn and .tab-content-area > .tab-pane
    const btn = event.target;
    const modalContent = btn.closest('.modal-content');
    if (!modalContent) return;

    modalContent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    modalContent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// --- Modals ---
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

// --- Filtering ---
function filterTable(input, tbodyId) {
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        let visible = false;
        const cells = rows[i].getElementsByTagName('td');
        for (let j = 0; j < cells.length; j++) {
            if (cells[j]) {
                const txtValue = cells[j].textContent || cells[j].innerText;
                if (txtValue.toLowerCase().indexOf(filter) > -1) {
                    visible = true;
                    break;
                }
            }
        }
        rows[i].style.display = visible ? "" : "none";
    }
}

function filterProfiles() {
    const searchInput = document.getElementById('profileSearchInput');
    const filterSelect = document.getElementById('filterPlatform');
    const searchFilter = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const platformFilter = filterSelect ? filterSelect.value.toLowerCase() : 'all';

    const tbody = document.getElementById('profileTableBody');
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Ensure checking correct cells. 
        // Index 1 is typically Name, Index 3 is Platform (based on renderer.js)
        const nameCell = row.cells[1];
        const platformCell = row.cells[3];

        const nameText = nameCell ? nameCell.textContent.toLowerCase() : '';
        const platformText = platformCell ? platformCell.textContent.toLowerCase().trim() : '';

        const nameMatch = nameText.includes(searchFilter);

        let platformMatch = true;
        if (platformFilter !== 'all') {
            if (!platformText || platformText.includes('--')) {
                platformMatch = false;
            } else {
                // Check exact match or inclusion
                platformMatch = (platformText === platformFilter) || (platformText.indexOf(platformFilter) !== -1);
            }
        }

        if (nameMatch && platformMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
}

// --- Clipboard ---
function copyCode(id) {
    const el = document.getElementById(`otp-${id}`);
    if (el) {
        navigator.clipboard.writeText(el.innerText);
        const originalText = el.innerText;
        el.innerText = "COPIED";
        setTimeout(() => el.innerText = originalText, 1000);
    }
}

// --- Database Stats ---
async function loadDatabaseStats() {
    const configEl = document.getElementById('db-config-content');
    const statsEl = document.getElementById('db-stats-content');
    const tablesEl = document.getElementById('db-tables-content');

    if (!configEl) return;

    configEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    try {
        const data = await ipcRenderer.invoke('get-database-stats');

        configEl.innerHTML = `
            <div><strong>Host:</strong> ${data.config.host}</div>
            <div><strong>Port:</strong> ${data.config.port}</div>
            <div><strong>Database:</strong> ${data.config.database}</div>
            <div><strong>User:</strong> ${data.config.user}</div>
            <div><strong>SSL:</strong> ${data.config.ssl ? 'Enabled' : 'Disabled'}</div>
        `;

        statsEl.innerHTML = `
            <div><strong>Status:</strong> <span style="color:${data.status === 'Connected' ? 'var(--success)' : 'var(--danger)'}">${data.status}</span></div>
            <div><strong>Version:</strong> ${data.version}</div>
            <div><strong>Size:</strong> ${data.sizeMB} MB (approx)</div>
            <div><strong>Connections:</strong> ${data.pool.activeConnections} / ${data.pool.connectionLimit}</div>
        `;

        tablesEl.innerHTML = '';
        if (data.tables) {
            Object.entries(data.tables).forEach(([table, count]) => {
                const card = document.createElement('div');
                card.innerHTML = `
                    <div style="font-size:24px; color:var(--accent); font-weight:bold;">${count}</div>
                    <div style="text-transform:uppercase; font-size:12px; color:var(--text-muted);">${table}</div>
                 `;
                card.style.textAlign = 'center';
                card.style.background = 'var(--bg-body)';
                card.style.padding = '15px';
                card.style.borderRadius = '8px';
                card.style.minWidth = '100px';
                tablesEl.appendChild(card);
            });
        }
    } catch (err) {
        if (configEl) configEl.innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
    }
}

// --- QR Scanning ---
// Protobuf setup
let root = protobuf.Root.fromJSON({
    nested: {
        MigrationPayload: {
            fields: {
                otpParameters: { rule: "repeated", type: "OtpParameters", id: 1 },
                version: { type: "int32", id: 2 },
                batchSize: { type: "int32", id: 3 },
                batchIndex: { type: "int32", id: 4 },
                batchId: { type: "int32", id: 5 }
            }
        },
        OtpParameters: {
            fields: {
                secret: { type: "bytes", id: 1 },
                name: { type: "string", id: 2 },
                issuer: { type: "string", id: 3 },
                algorithm: { type: "int32", id: 4 },
                digits: { type: "int32", id: 5 },
                type: { type: "int32", id: 6 },
                counter: { type: "int64", id: 7 }
            }
        }
    }
});
let MigrationPayload = root.lookupType("MigrationPayload");

function triggerQRScan() {
    const input = document.getElementById('qrInput');
    if (input) input.click();
}

function processQR(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            try {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    console.log('QR Raw:', code.data);
                    let secret = null;

                    if (code.data.startsWith('otpauth://')) {
                        try {
                            const url = new URL(code.data);
                            secret = url.searchParams.get('secret');
                        } catch (e) { }
                    } else if (code.data.startsWith('otpauth-migration://')) {
                        try {
                            const url = new URL(code.data);
                            const dataDetails = url.searchParams.get('data');
                            if (dataDetails) {
                                const buffer = Buffer.from(dataDetails, 'base64');
                                const message = MigrationPayload.decode(buffer);
                                const object = MigrationPayload.toObject(message, { includesDefault: true });

                                if (object.otpParameters && object.otpParameters.length > 0) {
                                    const acc = object.otpParameters[0];
                                    if (acc.secret) {
                                        secret = base32.encode(acc.secret).replace(/=/g, '');
                                        alert(`Found Account: ${acc.name}\nIssuer: ${acc.issuer || 'Unknown'}`);
                                    }
                                }
                            }
                        } catch (e) {
                            alert('Migration Decode Failed: ' + e.message);
                        }
                    } else if (code.data.match(/^[A-Z2-7=]+$/i)) {
                        secret = code.data;
                    }

                    if (secret) {
                        document.getElementById('inpAuth2FA').value = secret;
                        alert('2FA Secret extracted and filled!');
                    } else if (!code.data.startsWith('otpauth-migration://')) {
                        alert('QR found, but not a valid 2FA Secret.\nData: ' + code.data);
                    }
                } else {
                    alert('No QR code detected in this image.');
                }
            } catch (error) {
                alert('Error processing image: ' + error.message);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
}

async function updateFingerprintPreview() {
    const osSelect = document.getElementById('inpOS');
    const os = osSelect ? osSelect.value : 'win';

    // Show loading state
    const fields = ['fpKernel', 'inpUA', 'fpTimezone', 'fpWebRTC', 'fpGeo', 'fpLang', 'inpRes', 'fpFonts', 'fpCanvas', 'fpWebGLImg', 'fpRenderer', 'fpAudio', 'fpMedia', 'fpRects', 'fpSpeech', 'fpHardware', 'fpMemory', 'fpDeviceName', 'fpMac', 'fpDNT', 'fpFlash'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'Generating...';
    });

    try {
        const res = await ipcRenderer.invoke('preview-fingerprint', null, os);
        if (res.success && res.fingerprint) {
            const fp = res.fingerprint;
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val || 'N/A';
            };

            setVal('fpKernel', 'Chrome 120 (Iron)'); // Hardcoded as we are using Iron
            setVal('inpUA', fp.userAgent);
            setVal('fpTimezone', 'Auto (IP-based)');
            setVal('fpWebRTC', 'Public IP / Disabled');
            setVal('fpGeo', 'Prompt');
            setVal('fpLang', fp.language || 'en-US');
            setVal('inpRes', fp.resolution);
            setVal('fpFonts', `${(fp.fonts || []).length} Fonts`);
            setVal('fpCanvas', `Noise: ${fp.canvasNoise?.substring(0, 10)}...`);
            setVal('fpWebGLImg', `Noise: ${fp.webglNoise?.substring(0, 10)}...`);
            setVal('fpRenderer', fp.webglRenderer);
            setVal('fpAudio', `Noise: ${fp.audioNoise?.toFixed(6)}`);
            setVal('fpMedia', `${(fp.audioOutputs || 0) + (fp.audioInputs || 0) + (fp.videoInputs || 0)} Devices`);
            setVal('fpRects', `Noise: ${fp.clientRectsNoise?.toFixed(6)}`);
            setVal('fpSpeech', 'Chrome Default');
            setVal('fpHardware', fp.hardwareConcurrency);
            setVal('fpMemory', fp.deviceMemory);
            setVal('fpDeviceName', 'Randomized');
            setVal('fpMac', '00:00:00:00:00:00 (Masked)');
            setVal('fpDNT', 'Enabled');
            setVal('fpFlash', 'Disabled');

        } else {
            console.error('Fingerprint preview failed', res.error);
        }
    } catch (e) {
        console.error('Fingerprint preview error', e);
    };
}

function getRandomGPU() {
    const gpus = [
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
    ];
    return gpus[Math.floor(Math.random() * gpus.length)];
}

// Exports
window.uiUtils = {
    navigate,
    switchTab,
    closeModal,
    openModal,
    filterTable,
    filterProfiles,
    copyCode,
    loadDatabaseStats,
    triggerQRScan,
    processQR,
    updateFingerprintPreview,
    getRandomGPU
};
