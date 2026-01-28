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
            throw error; // Rethrow to notify caller
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
            throw error; // Rethrow
        }
    }


    // Upload all storage data (cookies + localStorage + sessionStorage) to MySQL
    async uploadStorage(accountId, storageData) {
        try {
            const pool = await getPool();
            const { cookies = [], localStorage = {}, sessionStorage = {} } = storageData;

            await pool.query(
                `INSERT INTO account_cookies 
                 (account_id, cookies, local_storage, session_storage) 
                 VALUES (?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 cookies = VALUES(cookies),
                 local_storage = VALUES(local_storage),
                 session_storage = VALUES(session_storage)`,
                [
                    accountId,
                    JSON.stringify(cookies),
                    JSON.stringify(localStorage),
                    JSON.stringify(sessionStorage)
                ]
            );

            console.log(`[Sync] Storage uploaded for ${accountId} (${cookies.length} cookies, ${Object.keys(localStorage).length} localStorage, ${Object.keys(sessionStorage).length} sessionStorage)`);
        } catch (error) {
            console.error(`[Sync] Failed to upload storage for ${accountId}:`, error);
            throw error; // Rethrow
        }
    }

    // Download all storage data from MySQL
    async downloadStorage(accountId) {
        try {
            const pool = await getPool();
            const [rows] = await pool.query(
                'SELECT cookies, local_storage, session_storage FROM account_cookies WHERE account_id = ?',
                [accountId]
            );

            if (rows.length > 0) {
                const result = {
                    cookies: rows[0].cookies ? JSON.parse(rows[0].cookies) : [],
                    localStorage: rows[0].local_storage ? JSON.parse(rows[0].local_storage) : {},
                    sessionStorage: rows[0].session_storage ? JSON.parse(rows[0].session_storage) : {}
                };

                console.log(`[Sync] Storage downloaded for ${accountId} (${result.cookies.length} cookies, ${Object.keys(result.localStorage).length} localStorage, ${Object.keys(result.sessionStorage).length} sessionStorage)`);
                return result;
            }
            return null;
        } catch (error) {
            console.error(`[Sync] Failed to download storage for ${accountId}:`, error);
            return null;
        }
    }

    // Legacy method for backward compatibility (wraps uploadStorage)
    async uploadCookies(accountId, cookies) {
        await this.uploadStorage(accountId, { cookies });
    }

    // Legacy method for backward compatibility (wraps downloadStorage)
    async downloadCookies(accountId) {
        const storage = await this.downloadStorage(accountId);
        return storage ? storage.cookies : null;
    }
}

module.exports = new SyncManager();
