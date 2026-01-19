const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { getPool } = require('../database/mysql');

class SyncManager {
    constructor() {
        // Local temporary zip path
        this.tempDir = path.join(app.getPath('userData'), 'temp_sync');
        fs.ensureDirSync(this.tempDir);
    }

    // Pack session folder -> zip record in MySQL
    async uploadSession(accountId) {
        let tempCopyPath = null;
        try {
            const sessionPath = path.join(app.getPath('userData'), 'sessions', accountId);
            if (!fs.existsSync(sessionPath)) {
                console.log(`[Sync] No local session found for ${accountId}, skipping upload.`);
                return;
            }

            // Small delay to allow Chrome to release files
            await new Promise(r => setTimeout(r, 1000));

            console.log(`[Sync] Preparing session for upload: ${accountId}...`);
            tempCopyPath = path.join(this.tempDir, `copy_${accountId}_${Date.now()}`);
            await fs.ensureDir(tempCopyPath);

            // Copy but ignore temp files and locks that cause ENOENT
            await fs.copy(sessionPath, tempCopyPath, {
                filter: (src) => {
                    const base = path.basename(src).toLowerCase();
                    return !base.endsWith('.tmp') &&
                        !base.includes('singleton') &&
                        !base.includes('lock');
                }
            });

            const zip = new AdmZip();
            zip.addLocalFolder(tempCopyPath);
            const buffer = zip.toBuffer();

            console.log(`[Sync] Uploading ${buffer.length} bytes to MySQL...`);
            const pool = await getPool();
            await pool.query(
                'INSERT INTO session_backups (account_id, zip_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE zip_data = VALUES(zip_data)',
                [accountId, buffer]
            );

            console.log(`[Sync] Session uploaded successfully for ${accountId}`);
        } catch (error) {
            console.error(`[Sync] Upload failed for ${accountId}:`, error);
        } finally {
            if (tempCopyPath && fs.existsSync(tempCopyPath)) {
                await fs.remove(tempCopyPath).catch(() => { });
            }
        }
    }

    // Download zip record -> session folder
    async downloadSession(accountId) {
        console.log(`[Sync] DEBUG: Starting downloadSession for ${accountId}`);
        try {
            const pool = await getPool();
            console.log(`[Sync] DEBUG: Pool acquired, executing query...`);
            const [rows] = await pool.query('SELECT zip_data FROM session_backups WHERE account_id = ?', [accountId]);
            console.log(`[Sync] DEBUG: Query returned ${rows.length} rows`);

            if (rows.length === 0) {
                console.log(`[Sync] No remote session found for ${accountId}.`);
                return false;
            }

            console.log(`[Sync] Downloading session for ${accountId}...`);
            const zipBuffer = rows[0].zip_data;
            const sessionPath = path.join(app.getPath('userData'), 'sessions', accountId);

            // Clean existing local session to avoid conflicts
            await fs.emptyDir(sessionPath);

            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(sessionPath, true);

            console.log(`[Sync] Session restored to ${sessionPath}`);
            return true;
        } catch (error) {
            console.error(`[Sync] Download failed for ${accountId}:`, error);
            return false;
        }
    }

    /**
     * Upload complete storage (cookies + localStorage + sessionStorage) to MySQL
     * v2.4.0 - Complete portable session sync
     */
    async uploadStorage(accountId, storageData) {
        try {
            const { cookies = [], localStorage = {}, sessionStorage = {} } = storageData;

            const cookiesJson = JSON.stringify(cookies);
            const localStorageJson = JSON.stringify(localStorage);
            const sessionStorageJson = JSON.stringify(sessionStorage);

            await pool.query(
                `INSERT INTO account_cookies (account_id, cookies, local_storage, session_storage, updated_at)
                 VALUES (?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                    cookies = VALUES(cookies),
                    local_storage = VALUES(local_storage),
                    session_storage = VALUES(session_storage),
                    updated_at = NOW()`,
                [accountId, cookiesJson, localStorageJson, sessionStorageJson]
            );

            console.log(`[Sync] Storage uploaded for ${accountId} (${cookies.length} cookies, ${Object.keys(localStorage).length} localStorage, ${Object.keys(sessionStorage).length} sessionStorage)`);
            return true;
        } catch (error) {
            console.error(`[Sync] Storage upload failed for ${accountId}:`, error);
            return false;
        }
    }

    /**
     * Download complete storage (cookies + localStorage + sessionStorage) from MySQL
     * v2.4.0 - Complete portable session sync
     */
    async downloadStorage(accountId) {
        try {
            const [rows] = await pool.query(
                'SELECT cookies, local_storage, session_storage FROM account_cookies WHERE account_id = ?',
                [accountId]
            );

            if (rows.length === 0) {
                console.log(`[Sync] No storage data found in DB for ${accountId}`);
                return { cookies: [], localStorage: {}, sessionStorage: {} };
            }

            const row = rows[0];
            const cookies = row.cookies ? JSON.parse(row.cookies) : [];
            const localStorage = row.local_storage ? JSON.parse(row.local_storage) : {};
            const sessionStorage = row.session_storage ? JSON.parse(row.session_storage) : {};

            console.log(`[Sync] ✓ Downloaded storage for ${accountId}: ${cookies.length} cookies, ${Object.keys(localStorage).length} localStorage, ${Object.keys(sessionStorage).length} sessionStorage`);

            return { cookies, localStorage, sessionStorage };
        } catch (error) {
            console.error(`[Sync] Storage download failed for ${accountId}:`, error);
            return { cookies: [], localStorage: {}, sessionStorage: {} };
        }
    }

    // Legacy wrapper for backward compatibility
    async uploadCookies(accountId, cookies) {
        return this.uploadStorage(accountId, { cookies, localStorage: {}, sessionStorage: {} });
    }

    // Legacy wrapper for backward compatibility
    async downloadCookies(accountId) {
        const { cookies } = await this.downloadStorage(accountId);
        return cookies;
    }
}

module.exports = new SyncManager();
