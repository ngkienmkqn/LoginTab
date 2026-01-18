## RBAC v2 Compliance Checklist

### Documentation (Required if applicable)
- [ ] **IPC_CONTRACT.md** updated for new/modified handlers
- [ ] **RBAC_MATRIX.md** updated for new permission keys
- [ ] **DB_SCHEMA.md** updated for schema changes
- [ ] **SPEC.md** updated if core rules changed
- [ ] **CHANGELOG.md** entry added

### Security (Required for all PRs)
- [ ] No renderer-trusted `userId`/`callerId`/`adminId` parameters
- [ ] All mutation handlers call `auditLog()`
- [ ] Scope checked BEFORE permission (if applicable)
- [ ] `authorize()` used for actions (not just `check-permission`)
- [ ] No bypass of `global.currentAuthUser` session

### Database (Required if schema changes)
- [ ] Migration is idempotent (checks existence)
- [ ] Rollback script provided in `rollback-rbac-v2.sql`
- [ ] FK constraints have ON DELETE behavior
- [ ] Indexes added for frequently queried columns

### Testing (Required)
- [ ] Manual test performed (login/logout cycle)
- [ ] Security test: renderer spoof attempt FAILS
- [ ] Migration tested: restart without errors
- [ ] Audit log checked: records present for actions

### Code Quality
- [ ] No hardcoded secrets/credentials
- [ ] Error messages don't leak sensitive info
- [ ] Console logs don't contain PII
- [ ] No TODO/FIXME comments (create issues instead)

## Evidence

**Screenshot/logs proving:**
1. Feature works as intended
2. Security checks enforced (if applicable)
3. Migration successful (if applicable)
4. Audit logs present (if applicable)

(Attach screenshots or paste logs below)

## Breaking Changes

- [ ] No breaking changes
- [ ] Breaking changes documented in CHANGELOG.md with migration guide

## Reviewer Notes

(Any special instructions for reviewers)

---

**See:** `docs/ai-partner/DRIFT_GUARD.md` for full compliance rules
