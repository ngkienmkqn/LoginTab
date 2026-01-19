# Release History

## [2.4.0] - 2026-01-19
**"IPHey 5/5 Trustworthy + Complete Storage Sync"**

### Major Features
- ✅ **IPHey 5/5 Green:** Reverted to v2.0.1 Native Hardware Strategy baseline (IPHey Trustworthy)
- ✅ **Complete Storage Sync:** Added LocalStorage + SessionStorage sync from v2.3.x
- ✅ **Best of Both Worlds:** IPHey trust + Tazapay session persistence

### Technical Details
**What Changed:**
1. **Reset to v2.0.1:** Restored IPHey 5/5 trustworthy baseline with 100% native hardware
2. **Added Storage Sync:** Cherry-picked complete storage sync feature from v2.3.1:
   - Database `account_cookies` table with `local_storage`, `session_storage` columns
   - Auto-migration for backward compatibility
   - `SyncManager.uploadStorage()` / `downloadStorage()` methods
   - BrowserManager cookie + localStorage + sessionStorage injection
   - Periodic 30s sync + page load sync

**Why This Approach:**
- v2.3.3 had storage sync BUT broke IPHey (Hardware masking detected)
- v2.0.1 had IPHey 5/5 green BUT no storage sync (Tazapay logout)
- v2.4.0 = v2.0.1 baseline + ONLY storage sync feature

**Result:**
- IPHey: ✅ 5/5 green (Browser, Location, IP, Hardware, Software)
- Tazapay: ✅ Session persists (LocalStorage `unifiedPaySession` synced)
- Google: ✅ Session persists (cookies synced)
- All sites: ✅ Complete portable session

### Migration
- Backup created: `backup/v2.3.3-before-revert` branch
- Seamless upgrade - auto-migration handles database schema

### User Impact
**Before v2.4.0:**
- Had to choose: Either IPHey trust OR Tazapay persistence (couldn't have both)

**After v2.4.0:**
- IPHey: 5/5 green checks ✅
- Tazapay: No re-login required ✅
- Cross-machine: Sessions portable ✅
- Zero trade-offs

---

## [2.0.1] - Previous
**"Native Hardware Strategy (IPHey Trustworthy)"**
- Achieved IPHey 5/5 trustworthy by using 100% real hardware
- No WebGL mocking
- No fingerprint masking
- Manual stealth mode only
