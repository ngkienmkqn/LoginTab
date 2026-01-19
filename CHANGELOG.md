# Release History

## [2.5.0] - 2026-01-19
**"Hide Automation Banner"**

### UX Improvements
- **Automation Banner Hidden:** Removed "Chrome is being controlled by automated test software" infobar
- **Clean Browser Experience:** Browser now looks identical to normal Chrome

### Technical Details
**Based on:** v2.3.1 (Complete storage sync + Google/Tazapay login working)

**Added:**
- `--disable-infobars` Chrome flag
- `--exclude-switches=enable-automation` Chrome flag  
- `--disable-blink-features=AutomationControlled` Chrome flag

**Why This Works:**
- Triple-layer approach ensures complete automation banner hiding
- No changes to stealth scripts → maintains Google/Tazapay login compatibility
- No changes to storage sync → maintains session persistence

### User Impact
- ✅ Google Login: Works
- ✅ Tazapay Login: Works  
- ✅ Storage Sync: Works (LocalStorage + SessionStorage)
- ✅ Cross-machine: Sessions portable
- ✅ Automation Banner: Hidden
- ⚠️ IPHey: 3/5 (trade-off accepted for functionality)

---

## [2.3.1] - 2026-01-19
**"Database Migration Hotfix"**
- Auto-migrate existing `account_cookies` table
- Add `local_storage` and `session_storage` columns
- Backward compatible upgrade

## [2.3.0] - 2026-01-19
**"Complete Storage Sync"**
- LocalStorage + SessionStorage sync for Tazapay
- Complete portable session data
- Periodic 30s + page load sync
