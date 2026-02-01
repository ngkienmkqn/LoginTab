# Master Specification: Workflow Nodes v1.3.2 (Final Engineering Freeze)

## 📘 Overview
This document serves as the **Single Source of Truth** for the Automation/Workflow system.
It defines **80+ nodes** with strict engineering contracts, security policies, and implementation guidelines.

**Version**: 1.3.2
**Last Updated**: 2026-01-18
**Status**: ENGINEERING FROZEN (Do Not Edit Main Body)

---

## 🏗️ 1. Architecture & Standards

### 1.1 Node Contract Schema (Full)
Every node must adhere to this extended JSON schema.

```json
{
  "id": "node_type_id",          // Unique snake_case ID (e.g., 'http_request')
  "name": "Node Name",           // Human readable title
  "version": "1.0.0",            // Semantic versioning
  "category": "Network",         // UI Category
  "description": "Short description for UI tooltip.",
  "riskLevel": "High",           // Low | Medium | High | Critical
  "capabilities": ["network:external"], // Required capabilities (see 1.2)
  "requiredRole": "Admin",       // Optional override: explicitly require a role
  "idempotency": false,          // Is safe to retry?
  "resourceLocks": ["network:global"],  // See 1.2.3 for Scope Enum
  
  "inputs": {                    // Schema for parameters
    "url": { 
      "type": "string", 
      "required": true, 
      "format": "url",
      "pattern": "^https?://",
      "description": "Target URL",
      "sensitive": false
    },
    "method": {
      "type": "string",
      "enum": ["GET", "POST", "PUT", "DELETE"],
      "default": "GET"
    },
    "token": {
      "type": "string",
      "sensitive": true         // Auto-mask in logs, forbid raw output
    }
  },
  
  "outputs": {                   // Schema for return values
    "responseBody": { "type": "object", "sensitive": false },
    "statusCode": { "type": "number" }
  },
  
  "timeoutMs": 30000,            // Hard timeout triggers AbortSignal
  "retryPolicy": {               // Smart retry policy
    "maxAttempts": 3,
    "backoff": 1000,
    "retryableErrors": ["ETIMEDOUT", "ECONNRESET"] // Only retry these codes
  }
}
```

### 1.2 Standards & Logic

#### 1.2.1 Retry Logic Rule
The engine will retry a node IF AND ONLY IF:
1.  `retryPolicy.maxAttempts` > 0
2.  **AND** (`idempotency` == `true` **OR** `error_code` is in `retryableErrors`)
*Note*: `idempotency: false` nodes (e.g. POST requests) will **NEVER** retry on generic errors unless the error is strictly network-level (e.g. connection reset before headers sent).

#### 1.2.2 Sensitive Output Policy
Outputs marked as `sensitive: true` (e.g. session tokens, cookies):
1.  **Must NOT** be mapped to `variables.*` via `saveAs` or `outputMapping`.
2.  **Must ONLY** be mapped to specialized secure contexts (e.g. `context.secrets`).
3.  **Must** be masked `***` in all Run Logs and Audit Logs.

#### 1.2.3 Resource Lock Scopes
Valid `resourceLocks` format: `{resource}:{scope}`.
-   **Resources**: `network`, `filesystem`, `browser`, `db`.
-   **Scopes**:
    -   `global`: Locks across ALL running workflows (e.g. `db:global`).
    -   `run`: Locks within the current workflow run.
    -   `browser`: Locks the entire browser instance.
    -   `tab`: Locks only the specific tab.

### 1.3 Security Policies

#### 🛡️ Network Egress Policy (Fortress)
Applies to all `network:external` nodes:
1.  **Block Internal**: Deny `localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`.
2.  **Block IPv6/Metadata**: Deny `::1`, `fc00::/7`, `fe80::/10`, `169.254.169.254`.
3.  **Redirect Hop Check**: Engine must check IP of *every* redirect hop against Deny List.
4.  **DNS Check**: Resolve domain -> If IP is in Deny List -> Block.
5.  **Protocol**: Only `http:`, `https:`, `imaps:`.

#### 🛡️ File System Sandbox
Applies to `upload_file`, `file_*` nodes:
1.  **Allowed Roots**: `%TEMP%`, `%APPDATA%/AutoLoginApp/artifacts`.
2.  **Normalization**: Strict `path.normalize()`, reject `..`.
3.  **Quotas**: Max 25MB read/write.

#### 🛡️ Database Contract
Applies to `insert_db`, `delete_db`, `update_db`:
1.  **No Raw SQL**: Objects only (`{ table, values }`).
2.  **Safety**: `delete_db` rejects empty `where`.
3.  **Audit**: Full query logging.

---

## 📚 2. Node Catalog (v1.3.2)

### 2.1 Control Flow (Logic)
| ID | Capability | Purity | Description |
|----|------------|--------|-------------|
| `condition` | `logic:*` | Pure | If/Else. **Strict Grammar (filtrex)**. |
| `while_loop` | `logic:*` | **High Risk** | Loop. **Input `maxIterations` mandatory** (Default 1000, Hard Cap 10000). |
| `try_catch` | `logic:*` | Pure | Error handling. |
| `repeat_task` | `logic:*` | Pure | Loop N times. |
| `loop_data` | `logic:*` | Pure | Iterate array. |
| `loop_control`| `logic:*` | Pure | Break/Continue. |

### 2.2 Browser Control
| ID | Capability | Risk | Description |
|----|------------|------|-------------|
| `open_url` | `browser:basic` | Low | Navigate. Support `wait_until`. |
| `switch_tab` | `browser:basic` | Low | Switch by Index/Title/URL. |
| `close_tab` | `browser:basic` | Low | Close tab. |
| `reload_tab` | `browser:basic` | Low | Refresh. |
| `wait_navigation`| `browser:basic` | Low | Wait for load/networkidle. |
| `window_state` | `browser:advanced`| Low | Max/Min/Fullscreen. |
| `cookie_get` | `browser:advanced`| **High**| Get Cookie. **Sensitive Output**. |
| `cookie_set` | `browser:advanced`| Medium| Set Cookie. |
| `save_state` | `browser:advanced`| **High**| Dump Session. **Sensitive Output**. |
| `load_state` | `browser:advanced`| **High**| Restore Session. |

### 2.3 Web Interaction (DOM)
| ID | Capability | Risk | Description |
|----|------------|------|-------------|
| `click_element` | `browser:basic` | Low | Click CSS/XPath/Text. |
| `type_text` | `browser:basic` | Low | Type (Human-like). |
| `select_option` | `browser:basic` | Low | Dropdown select. |
| `upload_file` | `files:read`, `browser:basic` | **High** | Upload file. **Sandboxed**. |
| `hover_element` | `browser:basic` | Low | Mouse over. |
| `scroll_element` | `browser:basic` | Low | Scroll into view. |
| `wait_element` | `browser:basic` | Low | Wait visible/hidden. |
| `get_text` | `browser:basic` | Low | Extract text. |
| `get_attribute` | `browser:basic` | Low | Extract attribute. |
| `set_value_js` | `browser:advanced`| **Medium**| Force value via JS. |
| `evaluate_js` | `browser:js_eval` | **Critical**| Arbitrary JS. **Always-On Audit**. **Log only Hash+Length**. |

### 2.4 Data Operations
| ID | Capability | Description | contract |
|----|------------|-------------|----------|
| `regex_match` | `logic:*` | Match pattern. |
| `json_parse` | `logic:*` | Parse JSON. |
| `json_map` | `logic:*` | Transform object. |
| `sort_data` | `logic:*` | Sort array. |
| `insert_db` | `db:write` | Insert record. | No raw SQL. |
| `delete_db` | `db:delete` | Delete record. | **Critical Risk**. |

### 2.5 System & Files (Split Nodes)
| ID | Capability | Risk | Description |
|----|------------|------|-------------|
| `file_read` | `files:read` | **High** | Read text file (Sandboxed). |
| `file_write` | `files:write` | **High** | Write text file (Sandboxed). |
| `file_delete` | `files:delete`| **Critical** | Delete file (Sandboxed). |
| `exec_cmd` | `system:shell`| **Critical**| Windows Command. |
| `exec_ps` | `system:shell`| **Critical**| PowerShell Script. |

### 2.6 Integrations
| ID | Capability | Risk | Description |
|----|------------|------|-------------|
| `http_request` | `network:external`| **High**| External API. **Egress Filtered**. |
| `request_int` | `network:internal`| Medium| Internal API (Allowlist only). |
| `read_email` | `email:read` | **High**| IMAP/Hotmail. |
| `excel_read` | `files:read` | High | Read .xlsx. |
| `excel_write` | `files:write` | High | Write .xlsx. |
| `gemini_ai` | `ai:generate` | High | AI Generation. |

---

## 📅 3. Implementation Phases
1.  **Core Security**: RB-NAC Middleware, Egress Filter (Redirect/DNS), Sandbox.
2.  **Engine**: Retry Logic, Sensitive Context, Immutable State.
3.  **Browser**: Selectors, Navigation, Interaction nodes.
4.  **Integrations**: High-risk nodes with Audit.

---

## 📝 Appendix A: Errata & Implementation Notes
*These notes override any conflicting information in the main body. They are the strict rules for implementation.*

### A.1 Safe Retry Logic
Constraint: **Idempotency is paramount.**
Implementation Rule:
```javascript
shouldRetry = (node.idempotency === true) && (retryCount < maxAttempts) && isRetryableError(error.code);
```
-   If `idempotency` is `false` (e.g. POST), the engine MUST NOT retry, even on network errors, to avoid side-effects (unless explicit `allowUnsafeRetry` flag is added later).

### A.2 Sandbox Path Validation
**Reject Rule**:
1.  Normalize path: `normPath = path.normalize(inputPath)`.
2.  Check traversal: `if (normPath.includes('..')) throw SecurityError`.
3.  Check Root: `resolved = path.resolve(normPath); if (!allowedRoots.some(root => resolved.startsWith(root))) throw SecurityError`.

### A.3 Critical Validations
1.  **`delete_db`**: Treat as **CRITICAL** risk in RBAC. Must strictly require `db:delete` capability. Empty `where` objects must throw error immediately.
2.  **IMAP**: Support `imaps:` protocol (Standard port 993). Plain `imap:` should generally be blocked or require explicit `unsafe` flag.
3.  **Timeout**: `timeoutMs` must trigger an `AbortSignal`. The engine must ensure the node operation (e.g. fetch, selector wait) actually listens to this signal and aborts resource usage.

**Status**: ENGINEERING FROZEN v1.3.2 (WITH ERRATA)
