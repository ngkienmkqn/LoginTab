# Spec Anti-Drift Rules

**Effective Date:** 2026-01-18  
**Applies To:** All AI Partners working on Login Tab project  
**Enforcement:** MANDATORY

---

## 🚨 RULE 1: APPROVED Specs Are Immutable

### What
Once a spec is marked **APPROVED**, its behavior and decisions CANNOT be modified.

### Examples

**✅ ALLOWED:**
- Add new sections (e.g., "Future Enhancements")
- Fix typos or clarify wording (no behavior change)
- Add code evidence to existing claims
- Update status (e.g., DRAFT → APPROVED)

**❌ FORBIDDEN:**
- Change core decisions (e.g., 1:1 → many-to-many)
- Remove non-negotiables
- Weaken security requirements
- Add "legacy mode" or compatibility flags

### Enforcement

**To change an APPROVED spec:**
1. Create `SPEC_CHANGE_PROPOSAL.md` in same directory
2. Document:
   - Rationale (why change is needed)
   - Breaking changes (what breaks)
   - Migration path (how to upgrade)
   - Security impact (new attack vectors)
   - Alternatives considered
3. Get explicit user approval
4. Bump version (minor for additions, major for breaking changes)
5. Archive old spec as `SPEC_v{old}.md`

**Example:**
```
AI-Partner/specs/rbac-v2/
├── README.md (v2.0.0 - APPROVED)
├── SPEC_CHANGE_PROPOSAL.md (proposes v2.1.0)
└── archives/
    └── README_v2.0.0.md (archived when v2.1.0 approved)
```

---

## 🔗 RULE 2: Declare Dependencies and Non-Negotiables

### What
Every new spec MUST declare:
1. **DependsOn:** List of specs this depends on
2. **Non-Negotiables:** What CANNOT be changed

### Template
```markdown
---
**DependsOn:**
- `specs/rbac-v2/README.md` (v2.0.0)
- `specs/input-focus-fix/README.md` (v1.0.0)

**Non-Negotiables:**
1. Must use `global.currentAuthUser` for caller identity
2. Must call `auditLog()` for all mutations
3. Cannot bypass scope checks
---
```

### Why
- **Prevents conflicts:** AI knows what constraints to respect
- **Explicit dependencies:** Clear impact areaduring changes
- **Verifiable:** Can programmatically check compliance

---

## ⚠️ RULE 3: Spec Conflict Detection

### What
Before implementing ANY new feature, run "Spec Compliance Check":

1. List all specs affected by the feature
2. For each spec, verify:
   - ✅ No violation of non-negotiables
   - ✅ No conflict with decisions
   - ✅ No weakening of security

### Example

**Feature:** Add "Bulk User Import" API

**Compliance Check:**
```markdown
## Affected Specs
- `specs/rbac-v2/DECISIONS.md` (Decision 1, 4)

## Compliance Verification

### Decision 1: Session-based auth
✅ PASS - Will use `global.currentAuthUser`, not trust renderer param

### Decision 4: Create-only assignment
⚠️ POTENTIAL CONFLICT
- Bulk import might need to set `managed_by_admin_id`
- Current: Auto-assign to caller (Admin → Staff)
- Proposal: Allow explicit assignment in import JSON

**CONFLICT DETECTED:**
- Violates "Admin cannot set managed_by_admin_id"
- Options:
  1. Restrict to Super Admin only (RECOMMENDED)
  2. Create SPEC_CHANGE_PROPOSAL for Decision 4
```

### Enforcement
**If conflict detected → STOP and raise to user.**

**Do NOT:**
- ❌ Implement anyway and hope user doesn't notice
- ❌ Silently change spec to match implementation
- ❌ Add undocumented flags or workarounds

---

## 📊 RULE 4: No False Production-Ready Claims

### What
Status labels MUST reflect actual implementation coverage.

### Status Definitions

| Label | Criteria |
|:---|:---|
| **DRAFT** | Spec not finalized, subject to change |
| **APPROVED** | Spec frozen, can only change via proposal |
| **PARTIAL** | < 100% implementation coverage |
| **ALPHA** | < 50% coverage OR critical gaps |
| **BETA** | ≥ 50% coverage, no catastrophic gaps |
| **COMPLETE** | 100% coverage, all tests pass |
| **PRODUCTION-READY** | COMPLETE + security hardening + automated tests |

### Evidence Required

**To claim PRODUCTION-READY:**
- [ ] 100% handler coverage (e.g., 41/41 for RBAC v2)
- [ ] All mutation handlers have audit logs
- [ ] Password hashing implemented
- [ ] Session timeout implemented
- [ ] Automated tests written (unit + integration)
- [ ] No critical/catastrophic security gaps
- [ ] Documentation complete

**Current RBAC v2 Status:**
- ❌ Handler coverage: 14/41 (34%)
- ❌ Audit log coverage: 6/41 (15%)
- ❌ No password hashing
- ❌ No session timeout
- ❌ No automated tests

**Label:** ⚠️ **PARTIAL / ALPHA** (NOT production-ready)

---

## 🛡️ RULE 5: Enforcement Checklist

**Before every implementation:**
- [ ] Read all `DependsOn` specs
- [ ] Verify no conflict with non-negotiables
- [ ] Run spec compliance check
- [ ] Update affected spec docs (evidence, coverage)
- [ ] Do NOT claim higher status without evidence

**Before every PR/commit:**
- [ ] Update `IPC_SECURITY_AUDIT.md` if handlers changed
- [ ] Update status labels if coverage changed
- [ ] No TODO/FIXME comments (create issues instead)
- [ ] All claims have code evidence (line numbers)

**Before claiming "DONE":**
- [ ] All spec docs updated
- [ ] No false production-ready claims
- [ ] Test plan executed (manual or automated)
- [ ] Evidence attached (screenshots, logs, test results)

---

## 📜 Spec Hierarchy

```
### Level 1: Core Specs (IMMUTABLE unless v3.0.0)
AI-Partner/specs/rbac-v2/
├── README.md (APPROVED)
├── DECISIONS.md (APPROVED)
└── Non-negotiables defined

### Level 2: Implementation Specs (Can update for bug fixes)
AI-Partner/specs/rbac-v2/
├── IPC_SECURITY_AUDIT.md (Coverage stats)
├── DB_MIGRATIONS.md (Schema changes)
└── TEST_PLAN.md (Test scenarios)

### Level 3: Feature Specs (Can add freely if compliant)
AI-Partner/specs/workflow-automation/
└── README.md (DependsOn: rbac-v2)
```

**Rule:** Higher-level specs constrain lower-level specs.

---

## 🔄 Version Bumping

**When to bump:**
- **Patch (v2.0.0 → v2.0.1):** Bug fixes, security patches, no behavior change
- **Minor (v2.0.0 → v2.1.0):** New features, backward compatible
- **Major (v2.0.0 → v3.0.0):** Breaking changes, changes to APPROVED decisions

**Example:**
- Add password hashing → v2.1.0 (new feature, no breaking change)
- Change 1:1 to many-to-many → v3.0.0 (breaks Decision 3)

---

## 📞 For AI Partners

**"I found a bug in the spec" →** Fix typos/clarifications without version bump  
**"I need to change a decision" →** Create SPEC_CHANGE_PROPOSAL.md  
**"I added a new feature" →** Update coverage stats + DependsOn list  
**"Can I skip this rule?" →** ❌ NO. Escalate to user if blocked.

**Spec drift = tech debt. These rules prevent drift.**

---

## Example Violations

### ❌ Violation 1: Silent Spec Change
```markdown
# OLD SPEC (APPROVED)
Admin can create Staff users (auto-assigned)

# NEW IMPLEMENTATION (without proposal)
Admin can create OR claim existing Staff users

# PROBLEM: Violates Decision 4 (create-only)
```

**Correct Action:** Create SPEC_CHANGE_PROPOSAL.md or revert implementation

---

### ❌ Violation 2: False Production-Ready
```markdown
# SPEC CLAIM
Status: PRODUCTION-READY

# ACTUAL STATUS
- 14/41 handlers secured (34%)
- No password hashing
- No automated tests

# PROBLEM: Misleading status label
```

**Correct Action:** Change to `PARTIAL / ALPHA` + document gaps

---

### ❌ Violation 3: Undeclared Dependency
```markdown
# NEW SPEC: Bulk Account Import
(No DependsOn declared)

# IMPLEMENTATION VIOLATES
- RBAC v2: Scope-first-then-permission
- RBAC v2: Session-based auth

# PROBLEM: Conflict not detected
```

**Correct Action:** Add `DependsOn: rbac-v2` + run compliance check

---

## Enforcement Summary

| Rule | Violation | Action |
|:---|:---|:---|
| APPROVED specs immutable | Silent change | Revert + create proposal |
| Declare dependencies | Missing DependsOn | Add + run compliance check |
| Conflict detection | Implement despite conflict | STOP + escalate |
| No false claims | Wrong status label | Correct to match evidence |
| Checklist enforcement | Skip steps | Block PR/deploy |

**These rules are MANDATORY. No exceptions.**
