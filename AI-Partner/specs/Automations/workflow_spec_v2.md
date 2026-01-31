# Automation Engine Specification v2.0 (COMPREHENSIVE REVIEW)

**Version**: 2.0.9  
**Last Updated**: 2026-02-01  
**Status**: UNDER COMPREHENSIVE REVIEW  
**Spec State**: DRAFT (pending USER approval → APPROVED)

---

## � Spec Metadata

**DependsOn:**
- `AI-Partner/specs/RBACv2/README.md` (v2.0.0) - Authorization & permissions
- `AI-Partner/specs/Automations/workflow_nodes_master_spec.md` (v1.3.2) - Node contracts
- `AI-Partner/SPEC_ANTI_DRIFT_RULES.md` - Governance rules

**Non-Negotiables:**
1. **MUST use `global.currentAuthUser`** for caller identity (no renderer params)
2. **MUST call `auditLog()`** for all workflow mutations
3. **MUST enforce RBAC scope-first-then-permission** pattern
4. **MUST respect node `capabilities`** from master spec
5. **MUST mask sensitive outputs** in logs (passwords, tokens, cookies)
6. **MUST enforce network egress filtering** on external nodes
7. **MUST limit loop iterations** (max 10000)
8. **MUST validate workflow before run**

**Compliance:**
- Aligns with `workflow_nodes_master_spec.md` v1.3.2 node contracts
- Extends RBAC v2 with workflow-specific permissions
- Follows Anti-Drift enforcement rules

---

## �📘 1. Overview

### 1.1 Purpose
Hệ thống Workflow Automation cho Login Tab, cho phép:
- Tự động hóa browser interactions (click, type, navigate)
- Data processing và transformations
- Profile-aware automation (inject credentials, 2FA)
- Visual node-based editor cho non-developers
- **External data exchange** (webhook in/out, API calls)

### 1.2 Scope v2
**In Scope:**
- Visual workflow editor (Drawflow-based)
- 80+ nodes (aligned with master spec)
- RBAC security model (integrated with RBAC v2)
- Profile context injection (username, password, 2FA)
- Real-time execution logging
- **Webhook integration** (receive & send)
- **External API calls**
- **Error handling & recovery**
- **Workflow validation before run**
- **Enterprise features** (versioning, governance, secrets)

**Out of Scope (Future):**
- Scheduled execution (cron)
- Multi-profile parallel runs
- AI-assisted workflow generation

---

## 🎯 2. Use Case Analysis

### 2.1 Login Automation Scenarios

| Scenario | Nodes Required | Complexity | Notes |
|----------|---------------|------------|-------|
| Simple login (user/pass) | `open_url`, `type_text` x2, `click_element` | Low | Most common |
| Login + TOTP 2FA | + `generate_2fa`, `type_text` | Low | Use `{{profile.twofa}}` |
| Login + Email OTP | + `wait_for_webhook`, `type_text` | Medium | External service sends OTP |
| Login + SMS OTP | + `wait_for_webhook`, `type_text` | Medium | SMS gateway webhook |
| Login + CAPTCHA | + `wait_for_human`, `type_text` | High | Manual intervention |
| Login + Security Questions | + `condition`, multiple `type_text` | Medium | Need Q&A mapping |
| OAuth popup login | + `switch_tab`, `click_element` | High | Handle popup window |
| Multi-step wizard login | Multiple conditional paths | High | Need branching |

### 2.2 Data Extraction Scenarios

| Scenario | Nodes Required | Output |
|----------|---------------|--------|
| Get text from element | `get_text` | `{{variables.text}}` |
| Get attribute (href, src) | `get_attribute` | `{{variables.attr}}` |
| Extract table data | `extract_table` | Array of objects |
| Scrape multiple items | `loop_data` + extraction | Array |
| Check element existence | `element_exists` | Boolean |
| Screenshot evidence | `screenshot` | File path |

### 2.3 External Integration Scenarios

| Scenario | Direction | Nodes | Use Case |
|----------|-----------|-------|----------|
| Wait for OTP | Inbound | `wait_for_webhook` | Email/SMS service calls webhook |
| Send scraped data | Outbound | `send_webhook` | Push data to external API |
| Call API mid-flow | Outbound | `http_request` | Validate data, get tokens |
| Receive dynamic input | Inbound | `wait_for_webhook` | User provides data via external app |
| Report completion | Outbound | `send_webhook` | Notify external system |

### 2.4 Error & Recovery Scenarios

| Error Type | Current Handling | Required Handling |
|------------|-----------------|-------------------|
| Element not found | Throw, stop | Retry N times, then fallback |
| Page timeout | Throw, stop | Wait longer or navigate away |
| Network error | Throw, stop | Retry with backoff |
| Unexpected popup | Ignore | Auto-dismiss or handle |
| Session expired | Throw, stop | Re-login and resume |
| CAPTCHA detected | Throw, stop | `wait_for_human` node |
| Anti-bot block | Throw, stop | Random delays, stealth mode |

---

## 📦 3. Node System (Comprehensive)

### 3.1 Node Contract Schema
```javascript
// File: src/nodes/{category}/{node_id}.js
module.exports = {
  // === REQUIRED ===
  id: 'node_id',
  name: 'Display Name',
  description: 'What this node does',
  version: '1.0.0',
  category: 'Browser|Logic|Data|Network|Action|System',
  riskLevel: 'Low|Medium|High|Critical',
  capabilities: ['browser:basic'],
  
  // === INPUTS ===
  inputs: {
    fieldName: {
      type: 'string|number|boolean|array|object',
      required: true,
      default: 'value',
      description: 'Help text',
      sensitive: false,
      enum: ['opt1', 'opt2'],
      pattern: '^https?://',
      format: 'url|selector|expression'
    }
  },
  
  // === OUTPUTS ===
  outputs: {
    resultName: { type: 'string', sensitive: false }
  },
  
  // === EXECUTION ===
  timeoutMs: 30000,
  retryCount: 0,           // NEW: Auto-retry on failure
  retryDelayMs: 1000,      // NEW: Delay between retries
  
  impl: async (inputs, context) => {
    return { resultName: value };
  }
};
```

### 3.1.1 Alignment with Master Spec (v1.3.2)

This spec **MUST** align with `workflow_nodes_master_spec.md` v1.3.2. Key requirements:

**Capability System:**
```javascript
// Node capabilities define what permissions a node requires
const CAPABILITIES = {
  'logic:*': 'Basic logic operations (all roles)',
  'browser:basic': 'Standard browser interactions',
  'browser:advanced': 'Session/cookie manipulation (admin+)',
  'browser:js_eval': 'Arbitrary JS execution (super_admin only)',
  'files:read': 'Read files from sandbox',
  'files:write': 'Write files to sandbox',
  'files:delete': 'Delete files (admin+)',
  'db:read': 'Read database',
  'db:write': 'Write database (staff+)',
  'db:delete': 'Delete database records (admin+)',
  'network:internal': 'Internal API calls',
  'network:external': 'External API calls (egress filtered)',
  'system:shell': 'Shell command execution (super_admin only)'
};

// Capability → Role mapping
const CAPABILITY_ROLES = {
  'logic:*': ['staff', 'admin', 'super_admin'],
  'browser:basic': ['staff', 'admin', 'super_admin'],
  'browser:advanced': ['admin', 'super_admin'],
  'browser:js_eval': ['super_admin'],
  'files:read': ['staff', 'admin', 'super_admin'],
  'files:write': ['admin', 'super_admin'],
  'files:delete': ['admin', 'super_admin'],
  'db:read': ['staff', 'admin', 'super_admin'],
  'db:write': ['staff', 'admin', 'super_admin'],
  'db:delete': ['admin', 'super_admin'],
  'network:internal': ['staff', 'admin', 'super_admin'],
  'network:external': ['admin', 'super_admin'],
  'system:shell': ['super_admin']
};
```

**Risk Level Enforcement:**
```javascript
// Risk levels from master spec
const RISK_LEVELS = {
  'Low': { audit: false, confirmation: false },
  'Medium': { audit: true, confirmation: false },
  'High': { audit: true, confirmation: true },
  'Critical': { audit: true, confirmation: true, adminOnly: true }
};

// Risk-based validations
function validateNodeByRisk(node, caller) {
  const risk = NODE_REGISTRY[node.type].riskLevel;
  
  if (risk === 'Critical') {
    // Critical nodes require Super Admin or explicit permission
    if (caller.role !== 'super_admin') {
      if (!hasExplicitPermission(caller.id, `node.${node.type}.execute`)) {
        throw new SecurityError(`Node ${node.type} requires Super Admin`);
      }
    }
    // Log all critical node executions
    auditLog('critical_node_execution', caller.id, { nodeType: node.type });
  }
  
  if (risk === 'High' || risk === 'Critical') {
    // High/Critical: Show confirmation in UI before run
    context.requiresConfirmation = true;
  }
}
```

**Sensitive Output Policy (from master spec):**
```javascript
// Outputs marked sensitive: true MUST be masked
const SENSITIVE_OUTPUTS = {
  'cookie_get': ['cookie'],
  'save_state': ['sessionData'],
  'http_request': ['response.headers.set-cookie', 'response.headers.authorization']
};

// Auto-mask in logs
function maskSensitiveOutputs(nodeType, outputs) {
  const sensitiveFields = SENSITIVE_OUTPUTS[nodeType] || [];
  const masked = JSON.parse(JSON.stringify(outputs));
  
  for (const path of sensitiveFields) {
    setPath(masked, path, '***MASKED***');
  }
  
  return masked;
}
```

**Resource Lock System (from master spec):**
```javascript
// Resource locks prevent concurrent access
const RESOURCE_LOCKS = {
  'db:global': 'Locks all database operations',
  'browser:tab': 'Locks specific tab',
  'network:global': 'Locks all network operations'
};

// Acquire lock before node execution
async function executeWithLock(node, context) {
  const locks = NODE_REGISTRY[node.type].resourceLocks || [];
  
  for (const lock of locks) {
    await context.lockManager.acquire(lock, context.runId);
  }
  
  try {
    return await executeNode(node, context);
  } finally {
    for (const lock of locks) {
      await context.lockManager.release(lock, context.runId);
    }
  }
}
```

### 3.2 Current Nodes (16 implemented)

| Category | ID | Risk | Status |
|----------|-----|------|--------|
| Browser | `click_element` | Low | ✅ |
| Browser | `type_text` | Low | ✅ |
| Browser | `open_url` | Low | ✅ |
| Browser | `wait_navigation` | Low | ✅ |
| Browser | `select_option` | Low | ✅ |
| Browser | `upload_file` | High | ✅ |
| Browser | `get_text` | Low | ✅ |
| Browser | `element_exists` | Low | ✅ |
| Logic | `condition` | Low | ✅ |
| Logic | `loop_data` | Low | ✅ |
| Data | `db_select` | Medium | ✅ |
| Data | `db_write` | High | ✅ |
| Data | `db_delete` | Critical | ✅ |
| Network | `http_request` | High | ✅ |
| Action | `wait_element` | Low | ✅ |
| Interaction | `keyboard_action` | Low | ✅ |

### 3.3 Complete Node Catalog (Target: 35+ nodes)

#### 3.3.1 Browser Control (12 nodes)
| ID | Priority | Risk | Description | Edge Cases |
|----|----------|------|-------------|------------|
| `click_element` | ✅ | Low | Click element | Multiple matches, invisible element |
| `type_text` | ✅ | Low | Type text | Clear first?, human-like delay |
| `open_url` | ✅ | Low | Navigate | Wait until? Timeout? |
| `wait_navigation` | ✅ | Low | Wait for page load | Partial load, SPA |
| `select_option` | ✅ | Low | Dropdown select | Dynamic options |
| `upload_file` | ✅ | High | Upload file | File not found, size limit |
| `get_text` | ✅ | Low | Extract text | Empty, whitespace |
| `element_exists` | ✅ | Low | Check existence | Hidden vs non-existent |
| `scroll_to_element` | **P0** | Low | Scroll into view | Lazy-loaded content |
| `hover_element` | **P0** | Low | Mouse hover | Dropdown timing |
| `get_attribute` | **P0** | Low | Get attribute | Attribute not found |
| `screenshot` | **P1** | Medium | Capture page | Path, format |
| `switch_tab` | **P1** | Low | Switch tab | Tab closed, wrong index |
| `close_tab` | **P1** | Low | Close tab | Last tab? |
| `switch_to_iframe` | **P1** | Low | Enter iframe | Nested iframes |
| `exit_iframe` | **P1** | Low | Exit to main | Already in main |
| `handle_dialog` | **P1** | Low | Alert/Confirm | Dismiss vs accept |
| `wait_for_url` | **P1** | Low | Wait URL matches | Regex pattern |
| `clear_input` | **P0** | Low | Clear text field | Select all + delete |
| `double_click` | **P2** | Low | Double click | Timing |
| `right_click` | **P2** | Low | Context menu | Menu handling |

#### 3.3.2 Logic & Control Flow (8 nodes)
| ID | Priority | Risk | Description | Edge Cases |
|----|----------|------|-------------|------------|
| `condition` | ✅ | Low | If/else branch | Invalid expression |
| `loop_data` | ✅ | Low | Loop over array | Empty array, break |
| `set_variable` | **P0** | Low | Store value | Overwrite existing |
| `delay` | **P0** | Low | Wait N ms | Max limit |
| `random_delay` | **P1** | Low | Random wait | Min/max range |
| `try_catch` | **P2** | Low | Error handling | Nested try-catch |
| `loop_count` | **P2** | Low | Loop N times | Max iterations |
| `break_loop` | **P2** | Low | Exit loop | Not in loop |
| `continue_loop` | **P2** | Low | Skip iteration | Not in loop |
| `stop_workflow` | **P1** | Low | End execution | Cleanup needed? |

#### 3.3.3 Data Operations (6 nodes)
| ID | Priority | Risk | Description | Edge Cases |
|----|----------|------|-------------|------------|
| `db_select` | ✅ | Medium | Query database | No results |
| `db_write` | ✅ | High | Insert/Update | Duplicate key |
| `db_delete` | ✅ | Critical | Delete records | Empty WHERE |
| `extract_table` | **P1** | Low | Scrape HTML table | Irregular structure |
| `json_parse` | **P1** | Low | Parse JSON string | Invalid JSON |
| `regex_extract` | **P1** | Low | Extract via regex | No match |
| `math_operation` | **P2** | Low | Calculate | Division by zero |
| `string_format` | **P2** | Low | Format/concat | Missing variables |

#### 3.3.4 Network & External (6 nodes)
| ID | Priority | Risk | Description | Edge Cases |
|----|----------|------|-------------|------------|
| `http_request` | ✅ | High | API call | Timeout, auth |
| `wait_for_webhook` | **P0** | Medium | Wait for callback | Timeout, abort |
| `send_webhook` | **P0** | Medium | Send data out | Network error, response |
| `read_email_otp` | **P2** | High | IMAP extract OTP | Auth, format |

#### 3.3.5 Special & Debug (5 nodes)
| ID | Priority | Risk | Description | Edge Cases |
|----|----------|------|-------------|------------|
| `keyboard_action` | ✅ | Low | Key press | Modifier keys |
| `wait_element` | ✅ | Low | Wait for element | Timeout |
| `log_debug` | **P0** | Low | Console log | Sensitive data |
| `generate_2fa` | **P2** | Medium | TOTP code | Invalid secret |
| `wait_for_human` | **P1** | Low | Pause for manual | Timeout, UI |
| `evaluate_js` | **P2** | Critical | Run JS on page | Security risk |

---

## 🔌 4. External Integration Specifications

### 4.1 `wait_for_webhook` Node (Inbound)

**Purpose:** Pause workflow and wait for external system to call webhook with data.

**Schema:**
```javascript
{
  id: 'wait_for_webhook',
  name: 'Wait for Webhook',
  category: 'Network',
  riskLevel: 'Medium',
  capabilities: ['network:external'],
  
  inputs: {
    webhookId: {
      type: 'string',
      required: false,
      description: 'Custom ID (auto-generated if empty)'
    },
    timeoutMs: {
      type: 'number',
      default: 300000,  // 5 minutes
      description: 'Max wait time (ms)'
    },
    onTimeout: {
      type: 'string',
      enum: ['error', 'continue', 'skip'],
      default: 'error',
      description: 'Timeout action'
    },
    expectedFields: {
      type: 'array',
      default: [],
      description: 'Required fields in webhook data (validation)'
    }
  },
  
  outputs: {
    received: { type: 'boolean' },
    webhookData: { type: 'object' },
    webhookUrl: { type: 'string' }
  }
}
```

**Webhook Endpoint:**
```
POST /api/workflow-webhook/:runId/:webhookId
Headers: 
  X-Webhook-Secret: <optional secret>
Body: {
  action: 'continue' | 'abort',
  data: { 
    otp: '123456',
    anyField: 'anyValue'
  }
}
Response: { success: true } or { error: 'message' }
```

**Implementation Notes:**
1. Generate unique URL khi node executes
2. Display URL in Execution Log
3. Poll internal state every 500ms for webhook receipt
4. Validate `expectedFields` if provided
5. Map `data` fields to `context.variables.webhookData`

**Edge Cases:**
| Case | Handling |
|------|----------|
| Webhook called before node executes | Queue and deliver when ready |
| Multiple webhooks same ID | Use latest, log warning |
| Invalid webhook data | Return error to caller |
| Workflow cancelled while waiting | Clean up webhook listener |
| Network timeout | Retry poll, not webhook |

### 4.2 `send_webhook` Node (Outbound)

**Purpose:** Send data to external URL and optionally wait for response.

**Schema:**
```javascript
{
  id: 'send_webhook',
  name: 'Send Webhook',
  category: 'Network',
  riskLevel: 'Medium',
  capabilities: ['network:external'],
  
  inputs: {
    url: {
      type: 'string',
      required: true,
      format: 'url',
      description: 'Webhook URL'
    },
    method: {
      type: 'string',
      enum: ['POST', 'PUT', 'PATCH'],
      default: 'POST'
    },
    headers: {
      type: 'object',
      default: {},
      description: 'Custom headers (JSON)'
    },
    body: {
      type: 'object',
      required: true,
      description: 'Data to send'
    },
    waitForResponse: {
      type: 'boolean',
      default: true,
      description: 'Wait for HTTP response'
    },
    timeoutMs: {
      type: 'number',
      default: 30000
    },
    onError: {
      type: 'string',
      enum: ['error', 'continue'],
      default: 'error'
    }
  },
  
  outputs: {
    statusCode: { type: 'number' },
    responseBody: { type: 'object' },
    success: { type: 'boolean' }
  }
}
```

**Edge Cases:**
| Case | Handling |
|------|----------|
| Invalid URL | Throw validation error |
| Network timeout | Follow `onError` setting |
| Non-2xx response | Set `success: false`, follow `onError` |
| Large response body | Truncate at 1MB |
| Redirect | Follow up to 5 redirects |
| SSL error | Throw error (no insecure allowed) |

### 4.3 `wait_for_human` Node

**Purpose:** Pause workflow for manual user intervention (CAPTCHA, verification, etc.)

**Schema:**
```javascript
{
  id: 'wait_for_human',
  name: 'Wait for Human',
  category: 'Action',
  riskLevel: 'Low',
  capabilities: ['browser:basic'],
  
  inputs: {
    message: {
      type: 'string',
      required: true,
      description: 'Instruction for user'
    },
    timeoutMs: {
      type: 'number',
      default: 600000,  // 10 minutes
      description: 'Max wait time'
    },
    showBrowserWindow: {
      type: 'boolean',
      default: true,
      description: 'Bring browser to front'
    }
  },
  
  outputs: {
    completed: { type: 'boolean' },
    waitTimeMs: { type: 'number' }
  }
}
```

**UI Integration:**
1. Show notification in app with message
2. Flash browser window
3. Add "Continue" button in Execution Log
4. User clicks "Continue" when done with manual task

---

## 🛡️ 5. Error Handling & Recovery

### 5.1 Node-Level Error Handling

**Current:** Node throws → Workflow stops

**Target v2:**
```javascript
// Each node can have retry logic
{
  retryCount: 3,
  retryDelayMs: 1000,
  retryBackoff: 'exponential', // linear | exponential | fixed
  retryOn: ['timeout', 'network', 'element_not_found'],
  
  onError: 'throw' | 'continue' | 'skip_next' | 'goto_node'
}
```

### 5.2 `try_catch` Node

**Purpose:** Wrap nodes in error handling block

**Schema:**
```javascript
{
  id: 'try_catch',
  name: 'Try-Catch',
  category: 'Logic',
  
  // Special: This node has 2 output ports
  // output_1: Success path
  // output_2: Error path
  
  outputs: {
    success: { type: 'boolean' },
    error: { type: 'object' }  // { message, nodeId, nodeName }
  }
}
```

**Visual:**
```
                    ┌─────────────┐
                    │  try_catch  │
                    ├─────────────┤
           ┌────────┤ ✓ Success   │────────┐
           │        │ ✗ Error     │        │
           │        └──────┬──────┘        │
           ▼               │               ▼
    [Next Nodes...]        │       [Error Handler Nodes]
                           ▼
                   (Error path connects
                    to recovery nodes)
```

### 5.3 Common Error Scenarios & Solutions

| Scenario | Detection | Solution |
|----------|-----------|----------|
| Element not found | Selector returns null | Retry with wait, try alternate selector |
| Page not loaded | Navigation timeout | Increase timeout, check network |
| Session expired | Detect login page | Navigate to login, re-auth, resume |
| CAPTCHA appeared | Detect CAPTCHA element | `wait_for_human` node |
| Rate limited | HTTP 429 response | Exponential backoff delay |
| Anti-bot detected | Detect block page | Random delays, stealth mode |
| Popup/Modal blocking | Overlay detected | Dismiss modal, wait |
| iFrame content | Element in iframe | `switch_to_iframe` first |
| Dynamic content | Element changes | Wait for stable state |

---

## 🔒 6. Security Model

### 6.1 Role-Based Capability Access Control

| Capability | staff | admin | super_admin |
|------------|-------|-------|-------------|
| `browser:basic` | ✅ | ✅ | ✅ |
| `logic:*` | ✅ | ✅ | ✅ |
| `browser:advanced` | ❌ | ✅ | ✅ |
| `network:external` | ❌ | ✅ | ✅ |
| `network:webhook` | ❌ | ✅ | ✅ |
| `db:read` | ❌ | ✅ | ✅ |
| `db:write` | ❌ | ✅ | ✅ |
| `db:delete` | ❌ | ❌ | ✅ |
| `files:read` | ❌ | ✅ | ✅ |
| `files:write` | ❌ | ❌ | ✅ |
| `system:shell` | ❌ | ❌ | ✅ |
| `js:eval` | ❌ | ❌ | ✅ |

### 6.2 Sensitive Data Protection

**Log Masking:**
```javascript
// Fields marked sensitive: true are masked in logs
{
  password: { type: 'string', sensitive: true }
}
// Log output: "password: ***"
```

**Variable Protection:**
- `profile.password` → Always masked
- `profile.twofa` → Always masked
- `webhookData.secret` → Mask if contains certain keywords

### 6.3 Network Security

**Egress Filtering:**
```javascript
const BLOCKED_RANGES = [
  '127.0.0.0/8',      // Localhost
  '10.0.0.0/8',       // Private
  '172.16.0.0/12',    // Private
  '192.168.0.0/16',   // Private
  '169.254.0.0/16',   // Link-local
  '169.254.169.254',  // Cloud metadata
];
```

**Webhook Security:**
- Rate limit: 10 calls/minute per workflow
- Max body size: 1MB
- Optional secret header validation
- HTTPS only for outbound

### 6.4 RBAC v2 Integration

**Compliance:** This spec integrates with RBAC v2 following the scope-first-then-permission pattern.

**Workflow Permissions:**
```javascript
// Extend RBAC v2 permission registry
const WORKFLOW_PERMISSIONS = {
  // Workflow CRUD
  'workflows.view': 'View Workflows',
  'workflows.create': 'Create Workflows',
  'workflows.edit': 'Edit Workflows',
  'workflows.delete': 'Delete Workflows',
  
  // Execution
  'workflows.execute': 'Execute Workflows',
  'workflows.execute_own': 'Execute Own Workflows',  // For staff
  
  // Advanced
  'workflows.publish': 'Publish Workflows (make available to others)',
  'workflows.assign': 'Assign Workflows to profiles/users',
  
  // Node-level
  'nodes.db_delete': 'Use db_delete node',
  'nodes.evaluate_js': 'Use evaluate_js node',
  'nodes.system_shell': 'Use shell execution nodes',
  'nodes.external_network': 'Use external API nodes'
};

// Default permissions by role
const WORKFLOW_ROLE_DEFAULTS = {
  super_admin: {
    'workflows.*': true,
    'nodes.*': true
  },
  admin: {
    'workflows.view': true,
    'workflows.create': true,
    'workflows.edit': true,
    'workflows.execute': true,
    'workflows.publish': true,
    'nodes.db_delete': false,  // Require explicit grant
    'nodes.evaluate_js': false,
    'nodes.system_shell': false,
    'nodes.external_network': true
  },
  staff: {
    'workflows.view': true,
    'workflows.execute_own': true,
    'nodes.*': false  // By default, staff uses only basic nodes
  }
};
```

**Scope Enforcement for Workflows:**
```javascript
// Workflow also has scope via managed_by / owner
async function canAccessWorkflow(callerId, workflowId, action) {
  const caller = await getUser(callerId);
  const workflow = await getWorkflow(workflowId);
  
  // Super Admin: full access
  if (caller.role === 'super_admin') return true;
  
  // Admin: own workflows + workflows of managed staff
  if (caller.role === 'admin') {
    if (workflow.created_by === callerId) return true;
    
    // Check if workflow creator is managed by this admin
    const creator = await getUser(workflow.created_by);
    if (creator.managed_by_admin_id === callerId) return true;
    
    return false;
  }
  
  // Staff: own workflows only
  if (caller.role === 'staff') {
    if (workflow.created_by === callerId) return true;
    
    // Check if workflow is assigned to them
    const assignment = await getWorkflowAssignment(callerId, workflowId);
    if (assignment && action === 'execute') return true;
    
    return false;
  }
  
  return false;
}
```

**Authorization for Workflow Actions:**
```javascript
async function authorizeWorkflowAction(callerId, workflowId, action) {
  // Step 1: Scope gate
  const hasScope = await canAccessWorkflow(callerId, workflowId, action);
  if (!hasScope) {
    throw new AuthorizationError('Workflow out of scope');
  }
  
  // Step 2: Permission check
  const hasPermission = await checkPermission(callerId, `workflows.${action}`);
  if (!hasPermission) {
    throw new AuthorizationError(`Missing permission: workflows.${action}`);
  }
  
  // Step 3: Node-level permission check (for execution)
  if (action === 'execute') {
    const workflow = await getWorkflow(workflowId);
    const restrictedNodes = await checkRestrictedNodesInWorkflow(callerId, workflow);
    if (restrictedNodes.length > 0) {
      throw new AuthorizationError(
        `Cannot execute: Missing permissions for nodes: ${restrictedNodes.join(', ')}`
      );
    }
  }
  
  return true;
}

// Check if workflow contains nodes the user cannot use
async function checkRestrictedNodesInWorkflow(callerId, workflow) {
  const nodesInWorkflow = extractAllNodeTypes(workflow.graph_data);
  const restrictedNodes = [];
  
  for (const nodeType of nodesInWorkflow) {
    const nodeSpec = NODE_REGISTRY[nodeType];
    const capabilities = nodeSpec.capabilities || [];
    
    for (const capability of capabilities) {
      const hasCapability = await checkCapabilityPermission(callerId, capability);
      if (!hasCapability) {
        restrictedNodes.push(nodeType);
        break;
      }
    }
  }
  
  return restrictedNodes;
}
```

**Audit Logging for Workflows:**
```javascript
// All workflow mutations MUST be logged
const WORKFLOW_AUDIT_ACTIONS = [
  'workflow_created',
  'workflow_updated',
  'workflow_deleted',
  'workflow_published',
  'workflow_executed',
  'workflow_execution_failed',
  'workflow_assigned',
  'critical_node_executed'
];

async function auditWorkflowAction(action, callerId, details) {
  await db.insert('audit_log', {
    id: uuid(),
    action,
    user_id: callerId,
    target_type: 'workflow',
    target_id: details.workflowId,
    details: JSON.stringify({
      ...details,
      // Mask sensitive data
      password: undefined,
      twofa: undefined
    }),
    created_at: new Date()
  });
}
```

---

## 🎨 7. UI Specifications

### 7.0 Known UI Bugs to Fix (P0)

| Bug | Description | Fix |
|-----|-------------|-----|
| **Node appears off-screen** | New nodes added via menu appear at random position, not in visible viewport | Calculate center of current viewport and place node there |
| Node stacking | Multiple nodes added at same position | Add random offset (already partially implemented) |
| No feedback on add | User unsure if node was added | Flash/highlight new node briefly |
| **Element Picker broken** | Click "Pick" but: 1) No highlight overlay on hovered elements 2) No confirm button to select element | Fix picker overlay injection & add click-to-select |

**Fix Implementation:**
```javascript
function addNode(type) {
    // Get current viewport center
    const container = document.getElementById('drawflow');
    const rect = container.getBoundingClientRect();
    const scrollX = container.scrollLeft || 0;
    const scrollY = container.scrollTop || 0;
    
    // Calculate center position in canvas coordinates
    const centerX = (scrollX + rect.width / 2) / editor.zoom;
    const centerY = (scrollY + rect.height / 2) / editor.zoom;
    
    // Add with small random offset to prevent stacking
    const offsetX = Math.floor(Math.random() * 50) - 25;
    const offsetY = Math.floor(Math.random() * 50) - 25;
    
    editor.addNode(type, 1, 1, centerX + offsetX, centerY + offsetY, ...);
}
```

**Element Picker Fix Spec:**

Expected Behavior:
1. User clicks "🎯 Pick" button in node properties
2. Browser window opens/focuses on target URL
3. **Overlay appears** showing hover highlight on elements
4. Mouse moves → highlight follows, showing selector preview
5. **User clicks element** → selector captured
6. Picker closes, selector fills into input field

Current Issues:
- ❌ No overlay/highlight visible
- ❌ No click-to-select working
- ❌ No cancel button/ESC key support

Fix Requirements:
```javascript
// Inject into page via page.evaluate()
const PICKER_OVERLAY = `
<div id="lt-picker-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;pointer-events:none;">
  <div id="lt-picker-highlight" style="position:absolute;border:2px solid #00aaff;background:rgba(0,170,255,0.1);pointer-events:none;"></div>
  <div id="lt-picker-info" style="position:fixed;bottom:10px;left:10px;background:#000;color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;z-index:1000000;">
    Hover to select element. Click to capture. ESC to cancel.
  </div>
</div>
`;

// On mouseover: update highlight position & size
// On click: capture selector, return to main process
// On ESC: cancel and return
```

### 7.1 Execution Log Panel (P0)

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Execution Log                      [⏸ Pause] [⏹ Stop]   │
├─────────────────────────────────────────────────────────────┤
│ 04:15:32 ▶ START                                            │
│ 04:15:32 ▶ open_url: Navigating to https://example.com      │
│ 04:15:34 ✓ open_url: Completed (2.1s)                       │
│ 04:15:34 ▶ type_text: Typing into #username                 │
│ 04:15:35 ✓ type_text: Completed                             │
│ 04:15:35 ▶ wait_for_webhook: Waiting...                     │
│           │ 🔗 Webhook URL: https://app/webhook/abc123      │
│           │    (Click to copy)                              │
│ 04:16:05 ✓ wait_for_webhook: Received OTP                   │
│ 04:16:05 ▶ type_text: Typing OTP {{webhookData.otp}}        │
│ 04:16:06 ✓ type_text: Completed                             │
│ 04:16:06 ▶ click_element: Clicking #submit                  │
│ 04:16:07 ✓ WORKFLOW COMPLETED (35.2s)                       │
├─────────────────────────────────────────────────────────────┤
│ Variables: { otp: "123456", result: "success" }    [Expand] │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Wait for Human UI

```
┌─────────────────────────────────────────────────────────────┐
│ ⏸ PAUSED - Waiting for Human Action                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   🖐️ Please complete the CAPTCHA in the browser window     │
│                                                             │
│   Time remaining: 8:45                                      │
│                                                             │
│   [✓ Continue Workflow]    [✗ Cancel Workflow]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Node Visual States

| State | Border Color | Icon | Description |
|-------|-------------|------|-------------|
| Idle | Gray | None | Not executed yet |
| Running | Blue pulse | ⏳ | Currently executing |
| Success | Green | ✓ | Completed successfully |
| Error | Red | ✗ | Failed |
| Skipped | Orange | ⊘ | Skipped due to condition |
| Waiting | Yellow | ⏸ | Waiting for input/webhook |

---

## 🏗️ 7.5 Backend Architecture Design

### 7.5.1 Module Structure

```
backend/
├── workflow/
│   ├── WorkflowService.js        # CRUD operations
│   ├── WorkflowRunner.js         # Execution engine
│   ├── WorkflowValidator.js      # Pre-run validation
│   ├── WorkflowEventEmitter.js   # Event stream
│   └── index.js                  # Export facade
├── nodes/
│   ├── registry.js               # Node type registry
│   ├── browser/                  # Browser nodes
│   │   ├── click_element.js
│   │   ├── type_text.js
│   │   ├── open_url.js
│   │   └── ...
│   ├── logic/                    # Logic nodes
│   │   ├── condition.js
│   │   ├── loop_data.js
│   │   └── ...
│   ├── network/                  # Network nodes
│   │   ├── http_request.js
│   │   ├── wait_for_webhook.js
│   │   └── send_webhook.js
│   └── data/                     # Data nodes
│       ├── db_select.js
│       └── ...
├── context/
│   ├── ExecutionContext.js       # Runtime context
│   ├── VariableResolver.js       # {{variable}} resolution
│   ├── SecretManager.js          # Encrypted secrets
│   └── LockManager.js            # Resource locks
├── webhook/
│   ├── WebhookServer.js          # Express server
│   ├── WebhookRegistry.js        # Active webhooks
│   └── WebhookAuth.js            # Secret validation
└── ipc/
    ├── workflow-handlers.js      # IPC handlers
    └── middleware/
        ├── auth.js               # Auth middleware
        ├── audit.js              # Audit logging
        └── rateLimit.js          # Rate limiting
```

### 7.5.2 Core Services

**WorkflowService.js:**
```javascript
class WorkflowService {
  // CRUD Operations
  async create(data, callerId);      // Create new workflow
  async update(id, data, callerId);  // Update workflow
  async delete(id, callerId);        // Delete workflow
  async getById(id, callerId);       // Get single workflow
  async list(filters, callerId);     // List workflows (scoped)
  
  // Version Control
  async publish(id, callerId);       // Publish workflow
  async createVersion(id, callerId); // Create version snapshot
  async listVersions(id);            // Get version history
  async restoreVersion(id, versionId, callerId);
  
  // Assignment
  async assignToUser(workflowId, userId, permissions, callerId);
  async revokeFromUser(workflowId, userId, callerId);
  async getAssignments(workflowId, callerId);
}
```

**WorkflowRunner.js:**
```javascript
class WorkflowRunner extends EventEmitter {
  constructor(workflow, context) {
    this.workflow = workflow;
    this.context = context;
    this.status = 'idle';
    this.currentNodeId = null;
  }
  
  // Execution Control
  async start();                     // Start execution
  async pause();                     // Pause at current node
  async resume();                    // Resume from pause
  async stop();                      // Stop execution
  
  // Node Execution
  async executeNode(node);           // Execute single node
  async executeNodeWithRetry(node);  // With retry logic
  
  // Events emitted:
  // - 'started', 'completed', 'failed', 'paused', 'resumed'
  // - 'node:started', 'node:completed', 'node:failed', 'node:skipped'
  // - 'variable:set', 'webhook:waiting', 'human:waiting'
  // - 'heartbeat', 'progress'
}
```

**WorkflowValidator.js:**
```javascript
class WorkflowValidator {
  async validate(workflowData, callerId) {
    const errors = [];
    const warnings = [];
    
    // Structure checks
    this.checkStartNode(workflowData, errors);
    this.checkOrphanNodes(workflowData, warnings);
    this.checkConnections(workflowData, errors);
    
    // Node-specific checks
    for (const node of this.getAllNodes(workflowData)) {
      this.validateNode(node, errors, warnings);
    }
    
    // Permission checks
    await this.checkNodePermissions(workflowData, callerId, errors);
    
    // External dependency warnings
    this.checkExternalDependencies(workflowData, warnings);
    
    return { valid: errors.length === 0, errors, warnings };
  }
}
```

### 7.5.3 IPC Handlers

```javascript
// workflow-handlers.js
const handlers = {
  // CRUD
  'workflow:create': authMiddleware(async (event, data) => {
    const callerId = global.currentAuthUser.id;
    await authorize(callerId, 'workflows.create');
    const workflow = await workflowService.create(data, callerId);
    await auditLog('workflow_created', callerId, { workflowId: workflow.id });
    return workflow;
  }),
  
  'workflow:update': authMiddleware(async (event, { id, data }) => {
    const callerId = global.currentAuthUser.id;
    await authorizeWorkflowAction(callerId, id, 'edit');
    const workflow = await workflowService.update(id, data, callerId);
    await auditLog('workflow_updated', callerId, { workflowId: id });
    return workflow;
  }),
  
  'workflow:delete': authMiddleware(async (event, id) => {
    const callerId = global.currentAuthUser.id;
    await authorizeWorkflowAction(callerId, id, 'delete');
    await workflowService.delete(id, callerId);
    await auditLog('workflow_deleted', callerId, { workflowId: id });
    return { success: true };
  }),
  
  'workflow:list': authMiddleware(async (event, filters) => {
    const callerId = global.currentAuthUser.id;
    return workflowService.list(filters, callerId);  // Auto-scoped
  }),
  
  // Execution
  'workflow:run': authMiddleware(async (event, { workflowId, profileId }) => {
    const callerId = global.currentAuthUser.id;
    await authorizeWorkflowAction(callerId, workflowId, 'execute');
    
    // Validate before run
    const workflow = await workflowService.getById(workflowId, callerId);
    const validation = await workflowValidator.validate(workflow.graph_data, callerId);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    
    // Create run record
    const runId = uuid();
    await db.insert('workflow_runs', { 
      id: runId, 
      workflow_id: workflowId,
      profile_id: profileId,
      started_by: callerId
    });
    
    // Start runner in background
    const runner = new WorkflowRunner(workflow, { runId, profileId, callerId });
    activeRuns.set(runId, runner);
    runner.start();  // Non-blocking
    
    return { success: true, runId };
  }),
  
  'workflow:stop': authMiddleware(async (event, runId) => {
    const runner = activeRuns.get(runId);
    if (runner) {
      await runner.stop();
      return { success: true };
    }
    return { success: false, error: 'Run not found' };
  }),
  
  'workflow:validate': authMiddleware(async (event, workflowData) => {
    const callerId = global.currentAuthUser.id;
    return workflowValidator.validate(workflowData, callerId);
  })
};
```

### 7.5.4 Webhook Server

```javascript
// webhook/WebhookServer.js
const express = require('express');

class WebhookServer {
  constructor(port = 3847) {
    this.app = express();
    this.registry = new WebhookRegistry();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  setupMiddleware() {
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(this.rateLimit);
    this.app.use(this.validateSecret);
  }
  
  setupRoutes() {
    // Webhook endpoint
    this.app.post('/api/workflow-webhook/:runId/:webhookId', async (req, res) => {
      const { runId, webhookId } = req.params;
      const { action, data } = req.body;
      
      // Find waiting webhook
      const webhook = this.registry.get(runId, webhookId);
      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found or expired' });
      }
      
      // Resolve the waiting promise
      webhook.resolve({ action, data });
      this.registry.remove(runId, webhookId);
      
      res.json({ success: true });
    });
    
    // Health check
    this.app.get('/health', (req, res) => res.json({ status: 'ok' }));
  }
  
  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`Webhook server listening on port ${this.port}`);
    });
  }
}
```

---

## 🎨 7.6 Frontend UI/UX Design

### 7.6.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🔧 Login Tab  │  Workflows  │  [+ New Workflow]  │  [User ▼]    ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────┬───────────────────────────────────────────────────────┤
│  SIDEBAR    │  MAIN CONTENT                                         │
│  ┌─────────┐│  ┌─────────────────────────────────────────────────┐  │
│  │ 📂 All  ││  │  WORKFLOW EDITOR                                │  │
│  │ ⭐ Fav  ││  │  ┌─────────────┐                                │  │
│  │ 📝 Draft││  │  │ NODE PALETTE│  CANVAS                        │  │
│  │ ✅ Pub  ││  │  │ ───────────│  ┌────────────────────────────┐│  │
│  │         ││  │  │ 🌐 Browser │  │  [Start] ─────► [Node 1]   ││  │
│  │ ─────── ││  │  │ 🔀 Logic   │  │     │                       ││  │
│  │ Recent: ││  │  │ 📊 Data    │  │     ▼                       ││  │
│  │ - Login ││  │  │ 🌍 Network │  │  [Node 2] ──► [End]         ││  │
│  │ - Test  ││  │  │ ⚙️ Debug   │  │                             ││  │
│  └─────────┘│  │  └─────────────┘  └────────────────────────────┘│  │
│             │  │                                                   │  │
│             │  ├───────────────────────────────────────────────────┤  │
│             │  │  PROPERTIES PANEL (when node selected)            │  │
│             │  │  ┌─────────────────────────────────────────────┐  │  │
│             │  │  │ click_element                 [🎯 Pick] [?] │  │  │
│             │  │  │ ─────────────────────────────────────────── │  │  │
│             │  │  │ Selector:  [#login-button               ]   │  │  │
│             │  │  │ Timeout:   [5000] ms                        │  │  │
│             │  │  │ ☑ Wait for visible  ☐ Force click           │  │  │
│             │  │  └─────────────────────────────────────────────┘  │  │
│             │  │                                                   │  │
│             │  ├───────────────────────────────────────────────────┤  │
│             │  │  EXECUTION LOG PANEL                              │  │
│             │  │  ┌─────────────────────────────────────────────┐  │  │
│             │  │  │ 04:15:32 ✓ open_url: Completed (2.1s)       │  │  │
│             │  │  │ 04:15:34 ▶ type_text: Typing into #user     │  │  │
│             │  │  └─────────────────────────────────────────────┘  │  │
│             │  └─────────────────────────────────────────────────────┘  │
└─────────────┴───────────────────────────────────────────────────────┘
```

### 7.6.2 Component Hierarchy

```
WorkflowPage/
├── WorkflowHeader/
│   ├── WorkflowTitle (editable)
│   ├── WorkflowStatus (badge: draft/published)
│   ├── SaveButton
│   ├── RunButton
│   └── SettingsDropdown
├── WorkflowSidebar/
│   ├── WorkflowList
│   │   ├── FilterTabs (All/Favorites/Draft/Published)
│   │   ├── SearchInput
│   │   └── WorkflowListItem[] (with context menu)
│   └── RecentWorkflows
├── WorkflowEditor/
│   ├── NodePalette/
│   │   ├── CategoryAccordion[]
│   │   │   └── NodeItem[] (draggable)
│   │   └── SearchInput
│   ├── Canvas/ (Drawflow)
│   │   ├── Node[] (draggable, connectable)
│   │   └── Connection[]
│   └── MiniMap (optional)
├── PropertiesPanel/
│   ├── NodeHeader (icon, name, help)
│   ├── NodeInputs/ (dynamic based on node type)
│   │   ├── TextInput
│   │   ├── SelectInput
│   │   ├── CheckboxInput
│   │   ├── SelectorPicker (🎯 Pick button)
│   │   └── VariableSelector ({{}} helper)
│   ├── OutputMapping
│   └── RetrySettings (collapsible)
├── ExecutionLogPanel/
│   ├── LogHeader (Run status, duration)
│   ├── LogList (virtualized)
│   │   └── LogEntry[]
│   └── LogControls (Pause/Stop/Clear)
└── Modals/
    ├── WorkflowSettingsModal
    ├── ValidationErrorModal
    ├── ConfirmRunModal (for High-risk workflows)
    └── ElementPickerOverlay
```

### 7.6.3 UI States

**Workflow List States:**
```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  📝 Empty      │  │  🔄 Loading    │  │  ✅ Loaded     │
│                │  │                │  │                │
│  No workflows  │  │  ●●●           │  │  Workflow 1    │
│  yet. Create   │  │  Loading...    │  │  Workflow 2    │
│  your first!   │  │                │  │  Workflow 3    │
│                │  │                │  │                │
│  [+ Create]    │  │                │  │  [+ Create]    │
└────────────────┘  └────────────────┘  └────────────────┘
```

**Node States:**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  ○ Idle      │  │  ◉ Selected  │  │  ⚠ Error     │
│  ──────────  │  │  ══════════  │  │  ──────────  │
│  click_elem  │  │  click_elem  │  │  click_elem  │
│              │  │  ────────    │  │  ⚠ Missing   │
│  Gray border │  │  Blue border │  │  Red border  │
│  No badge    │  │  Props open  │  │  Error badge │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Execution States:**
```
┌──────────────────────────────────────────────────────────┐
│  RUN BUTTON STATES                                        │
│                                                          │
│  [▶ Run]     - Ready to run                              │
│  [● Running] - Execution in progress (spinner)           │
│  [⏸ Pause]   - Click to pause                            │
│  [■ Stop]    - Click to stop                             │
│  [▶ Resume]  - Paused, click to resume                   │
│  [⚠ Failed]  - Last run failed (click to retry)          │
└──────────────────────────────────────────────────────────┘
```

### 7.6.4 Interactions & Animations

**Node Addition:**
```javascript
// When user clicks node in palette or drags to canvas
function addNodeWithAnimation(type, position) {
  const node = createNode(type, position);
  
  // Entry animation
  node.style.transform = 'scale(0.5)';
  node.style.opacity = '0';
  
  requestAnimationFrame(() => {
    node.style.transition = 'transform 0.2s ease-out, opacity 0.2s';
    node.style.transform = 'scale(1)';
    node.style.opacity = '1';
  });
  
  // Flash highlight
  setTimeout(() => {
    node.classList.add('highlight-pulse');
    setTimeout(() => node.classList.remove('highlight-pulse'), 500);
  }, 200);
  
  // Auto-select new node
  selectNode(node.id);
  openPropertiesPanel(node.id);
}
```

**Node Execution Animation:**
```javascript
// During workflow execution
function animateNodeExecution(nodeId, status) {
  const nodeEl = getNodeElement(nodeId);
  
  switch (status) {
    case 'running':
      nodeEl.classList.add('node-running');
      // Pulsing blue border animation
      break;
    case 'success':
      nodeEl.classList.remove('node-running');
      nodeEl.classList.add('node-success');
      // Green flash + checkmark icon
      break;
    case 'error':
      nodeEl.classList.remove('node-running');
      nodeEl.classList.add('node-error');
      // Red flash + X icon + shake animation
      break;
  }
}
```

**Element Picker Flow:**
```
1. User clicks "🎯 Pick" button
   │
   ▼
2. Browser window comes to front
   │
   ▼
3. Overlay injected with instructions
   ┌──────────────────────────────────────┐
   │ Hover to select. Click to capture.  │
   │ Press ESC to cancel.                │
   └──────────────────────────────────────┘
   │
   ▼
4. User hovers → element highlighted with blue border
   │
   ▼
5. User clicks → selector captured
   │
   ▼
6. Main window comes back, selector filled in input
```

### 7.6.5 Responsive Design

```css
/* Breakpoints */
@media (max-width: 1200px) {
  /* Collapse sidebar */
  .workflow-sidebar { width: 60px; }
  .workflow-sidebar .label { display: none; }
}

@media (max-width: 992px) {
  /* Stack properties panel below canvas */
  .editor-layout { flex-direction: column; }
  .properties-panel { height: 300px; }
}

@media (max-width: 768px) {
  /* Mobile: Full-screen panels */
  .node-palette { position: fixed; bottom: 0; }
  .properties-panel { position: fixed; bottom: 0; }
}
```

### 7.6.6 Accessibility

```javascript
// Keyboard navigation
const KEYBOARD_SHORTCUTS = {
  'Ctrl+S': 'saveWorkflow',
  'Ctrl+Z': 'undo',
  'Ctrl+Y': 'redo',
  'Ctrl+Shift+Z': 'redo',
  'Delete': 'deleteSelectedNode',
  'Backspace': 'deleteSelectedNode',
  'Escape': 'deselectAll',
  'Ctrl+D': 'duplicateNode',
  'Ctrl+A': 'selectAllNodes',
  'F5': 'runWorkflow',
  'Shift+F5': 'stopWorkflow',
  'Tab': 'focusNextNode',
  'Shift+Tab': 'focusPrevNode',
};

// ARIA labels
const NODE_ARIA = {
  role: 'button',
  'aria-label': `${node.name} node. Press Enter to edit properties.`,
  'aria-describedby': `node-${node.id}-description`,
  tabindex: 0
};
```

---

## 📋 8. Implementation Phases (Updated)

### Phase 1: Foundation ⬅️ CURRENT
**Backend (7 nodes):**
- [ ] `scroll_to_element`
- [ ] `hover_element`
- [ ] `get_attribute`
- [ ] `delay`
- [ ] `set_variable`
- [ ] `log_debug`
- [ ] `wait_for_webhook` + Webhook endpoint

**Frontend:**
- [ ] Execution Log Panel
- [ ] Node search
- [ ] Workflow log IPC listener
- [ ] **FIX: Add node in visible viewport** (currently adds off-screen)

**Effort:** 3-4 days

### Phase 2: Data Flow
**Backend (5 nodes):**
- [ ] `send_webhook`
- [ ] `clear_input`
- [ ] `random_delay`
- [ ] `stop_workflow`
- [ ] `wait_for_url`

**Engine:**
- [ ] Output → Variable mapping
- [ ] `{{variable}}` resolution improvements

**Effort:** 2-3 days

### Phase 3: Advanced Control
**Backend (6 nodes):**
- [ ] `wait_for_human`
- [ ] `try_catch`
- [ ] `switch_to_iframe`
- [ ] `exit_iframe`
- [ ] `handle_dialog`
- [ ] `screenshot`

**Engine:**
- [ ] Retry logic per node
- [ ] Pause/Resume workflow

**Effort:** 3-4 days

### Phase 4: Polish & Pro
- [ ] `switch_tab`, `close_tab`
- [ ] `extract_table`
- [ ] `generate_2fa`
- [ ] Node copy/paste
- [ ] Undo/redo
- [ ] Step debugging

**Effort:** 4-5 days

---

## 💾 8.5 Database Schema for Workflows

### 8.5.1 Tables

**workflows:**
```sql
CREATE TABLE workflows (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0.0',
    status ENUM('draft', 'published', 'deprecated', 'archived') DEFAULT 'draft',
    
    -- Graph data (Drawflow JSON)
    graph_data JSON NOT NULL,
    
    -- Ownership (aligned with RBAC v2)
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Governance
    approved_by VARCHAR(36),
    approved_at TIMESTAMP,
    
    -- Targeting
    platform_id VARCHAR(36),
    
    -- Execution stats
    last_run_at TIMESTAMP,
    run_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    avg_duration_ms INT DEFAULT 0,
    
    -- Execution settings
    execution_config JSON,  -- timeout, heartbeat, etc.
    
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE SET NULL,
    INDEX idx_created_by (created_by),
    INDEX idx_status (status),
    INDEX idx_platform (platform_id)
);
```

**workflow_versions:**
```sql
CREATE TABLE workflow_versions (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    version VARCHAR(20) NOT NULL,
    graph_data JSON NOT NULL,
    saved_by VARCHAR(36) NOT NULL,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_workflow_version (workflow_id, version)
);
```

**workflow_runs:**
```sql
CREATE TABLE workflow_runs (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    workflow_version VARCHAR(20),
    profile_id VARCHAR(36),
    
    started_by VARCHAR(36) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    status ENUM('running', 'completed', 'failed', 'cancelled', 'timeout') DEFAULT 'running',
    current_node_id VARCHAR(100),
    progress TINYINT DEFAULT 0,  -- 0-100
    
    error_message TEXT,
    error_node_id VARCHAR(100),
    
    -- Stats
    duration_ms INT,
    nodes_executed INT DEFAULT 0,
    retries_used INT DEFAULT 0,
    
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_workflow (workflow_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
);
```

**workflow_run_logs:**
```sql
CREATE TABLE workflow_run_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    node_id VARCHAR(100),
    node_type VARCHAR(50),
    
    message TEXT,
    data JSON,
    
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),  -- Millisecond precision
    
    FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    INDEX idx_run (run_id),
    INDEX idx_event (event_type),
    INDEX idx_created (created_at)
);
```

**workflow_assignments:**
```sql
CREATE TABLE workflow_assignments (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    can_execute BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    assigned_by VARCHAR(36) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_assignment (workflow_id, user_id)
);
```

**workflow_secrets:**
```sql
CREATE TABLE workflow_secrets (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    secret_name VARCHAR(100) NOT NULL,
    encrypted_value BLOB NOT NULL,  -- AES-256 encrypted
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    UNIQUE KEY unique_secret (workflow_id, secret_name)
);
```

**secrets (global):**
```sql
CREATE TABLE secrets (
    id VARCHAR(36) PRIMARY KEY,
    category ENUM('profile', 'workflow', 'global') NOT NULL,
    name VARCHAR(100) NOT NULL,
    encrypted_value BLOB NOT NULL,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_secret (category, name),
    INDEX idx_category (category)
);
```

### 8.5.2 Indexes for Performance

```sql
-- For workflow listing by user
CREATE INDEX idx_workflows_created_by_status ON workflows(created_by, status);

-- For run history
CREATE INDEX idx_runs_workflow_started ON workflow_runs(workflow_id, started_at DESC);

-- For log retrieval
CREATE INDEX idx_logs_run_created ON workflow_run_logs(run_id, created_at);

-- For assignment lookup
CREATE INDEX idx_assignments_user ON workflow_assignments(user_id);
```

### 8.5.3 Migration Script

```sql
-- Migration: create_workflow_tables
-- Version: 1.0.0
-- Idempotency: Uses IF NOT EXISTS

-- Check and create tables
-- (Full SQL as shown above)

-- Verify migration
SELECT 
    'workflows' as tbl, COUNT(*) as cnt FROM information_schema.tables WHERE table_name = 'workflows'
UNION ALL SELECT 
    'workflow_runs', COUNT(*) FROM information_schema.tables WHERE table_name = 'workflow_runs'
UNION ALL SELECT 
    'workflow_run_logs', COUNT(*) FROM information_schema.tables WHERE table_name = 'workflow_run_logs';
```

---

## 🧪 9. Test Scenarios

### 9.1 Unit Tests (Per Node)

| Node | Test Cases |
|------|------------|
| `click_element` | Found, not found, timeout, invisible, multiple matches |
| `type_text` | Normal, special chars, variable injection, empty |
| `wait_for_webhook` | Received, timeout-error, timeout-continue, abort |
| `send_webhook` | Success, network error, non-2xx, timeout |

### 9.2 Integration Tests (Workflows)

| Workflow | Description |
|----------|-------------|
| Simple Login | open_url → type × 2 → click |
| Login + 2FA | Above + generate_2fa + type |
| Login + OTP | Above + wait_for_webhook + type |
| Data Scrape | open_url → loop → get_text → db_write |
| Error Recovery | try_catch → fail node → recovery path |

### 9.3 Edge Case Tests

| Test | Expected |
|------|----------|
| Empty workflow (no nodes) | Error: No start node |
| Disconnected nodes | Warning, skip orphans |
| Infinite loop | Max iteration limit (10000) |
| Very long workflow (100+ nodes) | Complete within memory |
| Concurrent workflows same profile | Queue or reject |
| Browser crash mid-workflow | Detect and cleanup |

---

## 🏛️ 10. Enterprise Features

### 10.1 Workflow Metadata & Governance (P0 for Scale)

**Workflow Entity:**
```javascript
{
  id: 'uuid',
  name: 'Login Automation',
  description: 'Automates login for Platform X',
  version: '1.2.0',           // Semver
  versionHistory: [...],      // Previous versions
  
  // Ownership
  createdBy: 'user_id',
  createdAt: timestamp,
  updatedBy: 'user_id',
  updatedAt: timestamp,
  
  // Governance
  status: 'draft' | 'published' | 'deprecated' | 'archived',
  approvedBy: 'admin_id',     // Required for publish
  approvedAt: timestamp,
  
  // Targeting
  platformId: 'platform_id',  // Which platform this is for
  profileTags: ['premium'],   // Which profiles can use this
  
  // Execution Stats
  lastRunAt: timestamp,
  runCount: 150,
  successRate: 0.92,
  avgDuration: 45000,         // ms
  
  // Graph
  graphData: {...}            // Drawflow JSON
}
```

**Version Control:**
```javascript
// On save, if published workflow:
if (workflow.status === 'published') {
  // Create new version
  workflow.version = semverIncrement(workflow.version, 'patch');
  workflow.versionHistory.push({
    version: previousVersion,
    graphData: previousGraphData,
    savedAt: timestamp,
    savedBy: currentUser
  });
}
```

**Audit Trail:**
```javascript
// Log all workflow changes
auditLog.push({
  workflowId: 'uuid',
  action: 'update' | 'publish' | 'run' | 'delete',
  userId: 'user_id',
  timestamp: Date.now(),
  details: { changedFields: [...] }
});
```

### 10.2 Workflow Validation Before Run (P0)

**Pre-flight Checks:**
```javascript
async function validateWorkflow(workflowData) {
  const errors = [];
  const warnings = [];
  
  // 1. Structure Validation
  if (!hasStartNode(workflowData)) {
    errors.push({ code: 'NO_START', message: 'Workflow must have a Start node' });
  }
  
  // 2. Connectivity Check
  const orphanNodes = findOrphanNodes(workflowData);
  if (orphanNodes.length > 0) {
    warnings.push({ code: 'ORPHAN_NODES', nodes: orphanNodes });
  }
  
  // 3. Required Fields Check
  for (const node of allNodes) {
    const missingFields = validateNodeInputs(node);
    if (missingFields.length > 0) {
      errors.push({
        code: 'MISSING_REQUIRED',
        nodeId: node.id,
        nodeName: node.name,
        fields: missingFields
      });
    }
  }
  
  // 4. Loop Safety Check
  if (hasInfiniteLoopRisk(workflowData)) {
    warnings.push({ code: 'INFINITE_LOOP_RISK', message: 'Loop without clear exit' });
  }
  
  // 5. Permission Check
  const restrictedNodes = findRestrictedNodes(workflowData, currentUserRole);
  if (restrictedNodes.length > 0) {
    errors.push({
      code: 'PERMISSION_DENIED',
      nodes: restrictedNodes,
      requiredRole: 'admin'
    });
  }
  
  // 6. External Dependencies Check
  const webhookNodes = findNodes(workflowData, 'wait_for_webhook');
  if (webhookNodes.length > 0) {
    warnings.push({ code: 'EXTERNAL_DEPENDENCY', message: 'Workflow depends on external webhook' });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    canRun: errors.length === 0  // warnings don't block
  };
}
```

**UI Integration:**
- Show validation on Save
- Show validation on Run (block if errors)
- Highlight nodes with errors in red
- Show warnings but allow proceed

### 10.3 Retry Context Awareness

**Enhanced Retry Logic:**
```javascript
{
  // Node-level retry config
  retryConfig: {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: 'exponential',  // fixed | linear | exponential
    retryOn: ['timeout', 'element_not_found', 'network_error'],
    
    // Context awareness
    contextAware: true,
    onRetry: async (context, attempt, error) => {
      // Log retry attempt
      context.emit('retry', { nodeId, attempt, error, maxAttempts });
      
      // Take action based on attempt number
      if (attempt === 2) {
        // On 2nd retry, try alternative selector
        if (context.nodeData.alternateSelector) {
          context.nodeData.selector = context.nodeData.alternateSelector;
        }
      }
      if (attempt === 3) {
        // On 3rd retry, refresh page first
        await context.page.reload();
        await context.page.waitForLoadState('networkidle');
      }
    }
  }
}
```

**Retry Context Object:**
```javascript
{
  attempt: 2,              // Current attempt (1-based)
  maxAttempts: 3,
  previousErrors: [        // History of failures
    { message: 'Element not found', timestamp: ... },
    { message: 'Timeout', timestamp: ... }
  ],
  totalRetryTime: 3500,    // ms spent retrying
  nodeData: {...},         // Mutable - can change selector etc.
  actions: {
    skipNode: () => {},    // Skip this node
    abortWorkflow: () => {},
    useAlternate: (altConfig) => {}
  }
}
```

### 10.4 Global Workflow Timeout & Heartbeat

**Workflow-Level Timeout:**
```javascript
{
  // In workflow metadata
  execution: {
    maxDurationMs: 7200000,    // 2 hours max
    warningAtMs: 6000000,      // Warn at 1h40m
    
    heartbeatIntervalMs: 30000,  // Every 30 seconds
    heartbeatTimeoutMs: 60000,   // Consider dead if no heartbeat for 60s
    
    onTimeout: 'abort' | 'pause' | 'notify',
    notifyOnTimeout: ['admin@example.com']
  }
}
```

**Heartbeat Implementation:**
```javascript
class WorkflowRunner {
  async run(workflow, context) {
    const startTime = Date.now();
    let lastHeartbeat = Date.now();
    
    // Start heartbeat interval
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      
      // Emit heartbeat event
      this.emit('heartbeat', {
        runId: context.runId,
        elapsed,
        currentNode: context.currentNodeId,
        status: 'running'
      });
      
      // Check global timeout
      if (elapsed >= workflow.execution.maxDurationMs) {
        this.handleTimeout(context);
      }
      
      // Warning threshold
      if (elapsed >= workflow.execution.warningAtMs && !this.warningEmitted) {
        this.emit('timeout_warning', { runId: context.runId, elapsed });
        this.warningEmitted = true;
      }
      
      lastHeartbeat = now;
    }, workflow.execution.heartbeatIntervalMs);
    
    try {
      await this.executeNodes(workflow, context);
    } finally {
      clearInterval(heartbeatInterval);
    }
  }
}
```

**Dead Workflow Detection:**
```javascript
// Monitor for stale workflows
class WorkflowMonitor {
  checkForDeadWorkflows() {
    for (const [runId, lastHeartbeat] of this.activeRuns) {
      if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
        this.markAsDead(runId);
        this.cleanupResources(runId);
        this.emit('workflow_dead', { runId, lastHeartbeat });
      }
    }
  }
}
```

### 10.5 Variable Scoping

**Scope Hierarchy:**
```
┌─────────────────────────────────────────┐
│ GLOBAL SCOPE                             │
│ - profile.* (read-only)                 │
│ - secrets.* (read-only, masked)         │
│ - env.* (environment variables)         │
├─────────────────────────────────────────┤
│ WORKFLOW SCOPE                           │
│ - variables.* (read-write)              │
│ - lastResult.* (read-only, per node)    │
├─────────────────────────────────────────┤
│ LOOP SCOPE (inside loop_data)           │
│ - loop.index (read-only)                │
│ - loop.item (read-only)                 │
│ - loop.total (read-only)                │
│ - loopVars.* (local to loop)            │
├─────────────────────────────────────────┤
│ TRY-CATCH SCOPE                          │
│ - error.* (inside catch block only)     │
│ - error.message                         │
│ - error.nodeId                          │
│ - error.nodeName                        │
└─────────────────────────────────────────┘
```

**Variable Resolution Order:**
```javascript
function resolveVariable(path, context) {
  // 1. Check loop scope (if inside loop)
  if (context.loopStack.length > 0) {
    if (path.startsWith('loop.') || path.startsWith('loopVars.')) {
      return context.loopStack[context.loopStack.length - 1][path];
    }
  }
  
  // 2. Check error scope (if inside catch)
  if (context.inCatchBlock && path.startsWith('error.')) {
    return context.catchError[path.replace('error.', '')];
  }
  
  // 3. Check workflow scope
  if (path.startsWith('variables.')) {
    return context.variables[path.replace('variables.', '')];
  }
  if (path.startsWith('lastResult.')) {
    return context.lastResult[path.replace('lastResult.', '')];
  }
  
  // 4. Check global scope
  if (path.startsWith('profile.')) {
    return context.profile[path.replace('profile.', '')];
  }
  if (path.startsWith('secrets.')) {
    return context.secrets[path.replace('secrets.', '')];
  }
  if (path.startsWith('env.')) {
    return process.env[path.replace('env.', '')];
  }
  
  return undefined;
}
```

**Scope Isolation:**
```javascript
// Variables in loopVars.* are isolated per loop
[loop_data: items]
  → [set_variable: loopVars.temp = "value"]  // Only visible inside this loop
  → [type_text: {{loopVars.temp}}]
[end loop]
// loopVars.temp is now undefined
```

### 10.6 Secret Management Strategy

**Secret Sources:**
```javascript
{
  // 1. Profile Secrets (per-profile)
  profile: {
    password: '***',      // From profile auth_config
    twofa: '***'          // 2FA secret
  },
  
  // 2. Workflow Secrets (per-workflow)
  workflowSecrets: {
    apiKey: '***',        // Encrypted in DB
    webhookSecret: '***'
  },
  
  // 3. Global Secrets (system-wide)
  globalSecrets: {
    smtpPassword: '***',
    slackToken: '***'
  }
}
```

**Secret Storage:**
```javascript
// Encryption at rest
class SecretManager {
  constructor() {
    this.encryptionKey = deriveKey(process.env.MASTER_KEY);
  }
  
  async storeSecret(category, name, value) {
    const encrypted = await encrypt(value, this.encryptionKey);
    await db.query(
      'INSERT INTO secrets (category, name, encrypted_value) VALUES (?, ?, ?)',
      [category, name, encrypted]
    );
  }
  
  async getSecret(category, name) {
    const row = await db.query(
      'SELECT encrypted_value FROM secrets WHERE category = ? AND name = ?',
      [category, name]
    );
    return decrypt(row.encrypted_value, this.encryptionKey);
  }
}
```

**Secret Access Control:**
```javascript
// Only certain roles can access certain secrets
const SECRET_PERMISSIONS = {
  'profile.*': ['staff', 'admin', 'super_admin'],  // All can use profile secrets
  'workflowSecrets.*': ['admin', 'super_admin'],   // Only admins
  'globalSecrets.*': ['super_admin']               // Only super_admin
};
```

**Secret Masking in Logs:**
```javascript
function maskSecrets(logMessage, context) {
  const secretPaths = [
    'profile.password', 'profile.twofa',
    ...Object.keys(context.workflowSecrets).map(k => `workflowSecrets.${k}`),
    ...Object.keys(context.globalSecrets).map(k => `globalSecrets.${k}`)
  ];
  
  let masked = logMessage;
  for (const path of secretPaths) {
    const value = resolveVariable(path, context);
    if (value && masked.includes(value)) {
      masked = masked.replace(new RegExp(escapeRegex(value), 'g'), '***');
    }
  }
  return masked;
}
```

### 10.7 Observability: Event Stream Standard

**Event Types:**
```typescript
type WorkflowEvent = {
  // Identity
  eventId: string;          // UUID
  runId: string;            // Workflow run ID
  workflowId: string;       // Workflow definition ID
  workflowVersion: string;  // e.g., "1.2.0"
  
  // Timing
  timestamp: number;        // Unix ms
  elapsed: number;          // ms since workflow start
  
  // Event Type
  type: 
    | 'workflow.started'
    | 'workflow.completed'
    | 'workflow.failed'
    | 'workflow.timeout'
    | 'workflow.paused'
    | 'workflow.resumed'
    | 'workflow.cancelled'
    | 'node.started'
    | 'node.completed'
    | 'node.failed'
    | 'node.skipped'
    | 'node.retrying'
    | 'variable.set'
    | 'webhook.waiting'
    | 'webhook.received'
    | 'human.waiting'
    | 'human.continued'
    | 'heartbeat';
  
  // Context
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  
  // Payload (varies by type)
  data: {
    message?: string;
    error?: { code: string; message: string; stack?: string };
    duration?: number;
    retryAttempt?: number;
    variableName?: string;
    variableValue?: any;  // Masked if sensitive
    webhookUrl?: string;
    progress?: number;    // 0-100%
  };
  
  // Metadata
  meta: {
    profileId?: string;
    userId?: string;
    userRole?: string;
    environment?: string;  // 'development' | 'production'
  };
};
```

**Event Emitter:**
```javascript
class WorkflowEventEmitter extends EventEmitter {
  constructor(runId, workflowId, workflowVersion) {
    super();
    this.runId = runId;
    this.workflowId = workflowId;
    this.workflowVersion = workflowVersion;
    this.startTime = Date.now();
    
    // Subscribers
    this.subscribers = [
      new UIEventHandler(),      // Send to frontend
      new LogEventHandler(),     // Write to file
      new MetricsHandler(),      // Update metrics
      new WebhookHandler()       // Notify external (if configured)
    ];
  }
  
  emit(type, data, meta = {}) {
    const event = {
      eventId: uuid(),
      runId: this.runId,
      workflowId: this.workflowId,
      workflowVersion: this.workflowVersion,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
      type,
      data: maskSecrets(data),
      meta: { ...this.defaultMeta, ...meta }
    };
    
    for (const subscriber of this.subscribers) {
      subscriber.handle(event);
    }
  }
}
```

**Event Handlers:**
```javascript
// 1. UI Handler - Send to frontend via IPC
class UIEventHandler {
  handle(event) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workflow-event', event);
    }
  }
}

// 2. Log Handler - Write to file
class LogEventHandler {
  handle(event) {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(`logs/workflow-${event.runId}.jsonl`, line);
  }
}

// 3. Metrics Handler - Update counters
class MetricsHandler {
  handle(event) {
    if (event.type === 'workflow.completed') {
      metrics.increment('workflow.success');
      metrics.timing('workflow.duration', event.elapsed);
    }
    if (event.type === 'workflow.failed') {
      metrics.increment('workflow.failure');
    }
    if (event.type === 'node.completed') {
      metrics.increment(`node.${event.nodeName}.success`);
    }
  }
}

// 4. External Webhook Handler
class ExternalNotifyHandler {
  async handle(event) {
    if (['workflow.completed', 'workflow.failed'].includes(event.type)) {
      const webhookUrl = getNotificationWebhook();
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });
      }
    }
  }
}
```

---

## 📝 11. Appendix

### A. Variable Resolution Syntax

```
{{profile.username}}          → Login username
{{profile.password}}          → Login password (masked)
{{profile.twofa}}             → 2FA secret
{{variables.myVar}}           → Custom variable
{{webhookData.otp}}           → Data from webhook
{{lastResult.fieldName}}      → Previous node output
{{loop.index}}                → Current loop index
{{loop.item}}                 → Current loop item
{{loop.total}}                → Total loop items
```

### B. Selector Best Practices

```css
/* Recommended: Unique ID */
#login-button

/* Good: Specific class + tag */
button.submit-btn

/* Acceptable: Attribute selector */
[data-testid="login"]

/* Avoid: Generic class */
.btn  /* Too many matches */

/* XPath for complex cases */
//div[@class='container']//button[contains(text(),'Submit')]
```

### C. Webhook Payload Examples

**Receive OTP:**
```json
POST /api/workflow-webhook/{runId}/{webhookId}
{
  "action": "continue",
  "data": {
    "otp": "123456",
    "source": "email"
  }
}
```

**Send Completion:**
```json
// send_webhook body
{
  "event": "workflow_complete",
  "profileId": "{{profile.id}}",
  "result": "success",
  "data": {
    "scrapedItems": 42
  }
}
```

### D. Common Workflow Patterns

**Pattern 1: Simple Login**
```
[Start] → [open_url: login page] → [type_text: username] → [type_text: password] → [click_element: submit] → [wait_navigation]
```

**Pattern 2: Login with 2FA**
```
[Start] → [open_url] → [type_text: user] → [type_text: pass] → [click_element: submit] 
       → [wait_element: 2fa input] → [generate_2fa] → [type_text: 2fa code] → [click_element: verify]
```

**Pattern 3: Login with External OTP**
```
[Start] → [open_url] → [type_text: user] → [type_text: pass] → [click_element: submit]
       → [wait_for_webhook: receive OTP] → [type_text: {{webhookData.otp}}] → [click_element: verify]
       → [send_webhook: notify completion]
```

**Pattern 4: Scrape with Loop**
```
[Start] → [open_url: list page] → [get_text: item count] → [set_variable: items = []]
       → [loop_data: each item row]
           → [get_text: item name] → [get_attribute: href] → [array_push: items]
       → [send_webhook: send items]
```

**Pattern 5: Conditional Flow**
```
[Start] → [open_url] → [element_exists: logged_in_indicator]
       → [condition: exists == true]
           → YES: [continue to main task]
           → NO: [goto login flow]
```

**Pattern 6: Error Recovery**
```
[Start] → [try_catch]
           → TRY: [click_element: may fail] → [continue...]
           → CATCH: [screenshot] → [log_debug: error] → [send_webhook: notify error]
```

**Pattern 7: Human-in-the-Loop**
```
[Start] → [open_url] → [type_text: credentials] → [click_element: submit]
       → [element_exists: captcha]
           → YES: [wait_for_human: "Please solve CAPTCHA"] → [continue...]
           → NO: [continue normally]
```

### E. Troubleshooting Guide

| Problem | Possible Cause | Solution |
|---------|---------------|----------|
| Element not found | Wrong selector | Use Element Picker, check for iframes |
| Element not found | Not loaded yet | Add `wait_element` before action |
| Element not found | Dynamic class names | Use stable attributes like `[data-testid]` |
| Click does nothing | Element covered | Scroll into view, dismiss popups |
| Click does nothing | Button disabled | Check for disabled state, wait for enabled |
| Type text wrong | Input cleared before type | Set `clearFirst: false` or use `clear_input` explicitly |
| Type text slow | Human-like delay too long | Reduce delay in node config |
| Page timeout | Slow network | Increase timeout, check network |
| Page timeout | SPA navigation | Use `wait_element` instead of `wait_navigation` |
| Webhook not received | Wrong URL | Check runId and webhookId in URL |
| Webhook not received | Firewall blocked | Ensure port is open, use tunneling |
| Workflow hangs | Infinite loop | Check loop exit condition |
| Workflow hangs | Waiting for element forever | Add timeout to wait nodes |
| Variable undefined | Typo in variable name | Check exact spelling, use `{{variables.xxx}}` |
| Variable undefined | Previous node failed | Check try_catch, error path |
| 2FA code invalid | Time sync issue | Ensure server time is synced (NTP) |
| 2FA code invalid | Wrong secret format | Use base32 secret, no spaces |
| Browser crashes | Memory leak | Close unused tabs, limit workflow duration |
| Permission denied | RBAC restriction | Check user role, upgrade permissions |

---

## 🚨 CRITICAL ISSUES FOUND IN REVIEW (v2.0.7-v2.0.9)

> **40 issues identified**, organized by severity and category.

### 📊 Issues Summary by Severity

| Severity | Count | Examples |
|----------|-------|----------|
| **CRITICAL** | 4 | Profile concurrency, Export secrets, XSS, Webhook leak |
| **HIGH** | 12 | Start/End nodes, Timeout enforcement, Memory leak, Import validation |
| **MEDIUM** | 14 | Rate limiting, Variable scope, Connection validation, Zoom controls |
| **LOW** | 10 | Copy/paste, Name collision, Help docs, Templates |

### 🎯 Implementation Priority

**Phase 1 - Security & Stability (CRITICAL + HIGH):**
| # | Issue | Category |
|---|-------|----------|
| 3 | Profile Concurrency Lock | Core |
| 4 | Webhook Memory Leak | Core |
| 24 | Export Secret Stripping | Security |
| 26 | XSS Sanitization | Security |
| 1 | Start Node Definition | Core |
| 2 | End Node Definition | Core |
| 25 | Node Timeout Enforcement | Core |
| 31 | Memory Leak Cleanup | Performance |

**Phase 2 - Core Functionality (HIGH + MEDIUM):**
| # | Issue | Category |
|---|-------|----------|
| 5 | Try-Catch Schema | Nodes |
| 6 | Rate Limiting | Performance |
| 7 | Concurrent Workflow Limits | Performance |
| 9 | Workflow Size Validation | Validation |
| 10 | Browser Tab Cleanup | Core |
| 23 | Import Validation | Security |
| 15 | DB Semaphore | Performance |

**Phase 3 - UX Improvements (MEDIUM + LOW):**
| # | Issue | Category |
|---|-------|----------|
| 11 | Unsaved Changes Warning | UX |
| 19 | Auto-Save Draft | UX |
| 35 | Zoom/Pan Controls | UX |
| 39 | Workflow Templates | UX |
| 37 | Node Help Documentation | UX |
| 22 | Copy/Paste | UX |

### 📋 All Issues by Category

**Core (10):** #1, #2, #3, #4, #10, #13, #14, #17, #25, #31  
**Security (4):** #23, #24, #26, #29  
**Performance (6):** #6, #7, #9, #15, #20, #28  
**Nodes (3):** #5, #8, #21  
**UX (13):** #11, #12, #16, #18, #19, #22, #27, #35, #36, #37, #38, #39, #40  
**Testing (2):** #33, #34  
**Debug (2):** #30, #32

---

### Issue 1: Missing `start` Node Definition
**Severity:** HIGH  
**Problem:** Spec mentions "Start" node in UI wireframes and test scenarios but no definition in node catalog.  
**Fix:**
```javascript
{
  id: 'start',
  name: 'Start',
  category: 'System',
  riskLevel: 'Low',
  capabilities: [],
  description: 'Entry point for workflow execution',
  inputs: {},
  outputs: {
    startedAt: { type: 'number', description: 'Unix timestamp' }
  },
  // Special: Every workflow MUST have exactly 1 start node
  // Validation: Workflow invalid if missing start or has multiple starts
}
```

### Issue 2: Missing `end` Node Definition
**Severity:** HIGH  
**Problem:** No `end` node defined. Workflow completion logic unclear.  
**Fix:**
```javascript
{
  id: 'end',
  name: 'End',
  category: 'System',
  riskLevel: 'Low',
  capabilities: [],
  description: 'Marks successful workflow completion',
  inputs: {
    status: { type: 'string', enum: ['success', 'warning'], default: 'success' },
    message: { type: 'string', required: false }
  },
  outputs: {},
  // Special: Multiple end nodes allowed (different paths)
  // Workflow completes when any end node is reached
}
```

### Issue 3: Profile Concurrency - Same Profile Multiple Workflows
**Severity:** CRITICAL  
**Problem:** If 2 workflows run on same profile, they share browser session → conflicts  
**Fix:**
```javascript
// Profile lock system
const profileLocks = new Map(); // profileId -> runId

async function acquireProfileLock(profileId, runId) {
  if (profileLocks.has(profileId)) {
    const currentRun = profileLocks.get(profileId);
    throw new Error(`Profile ${profileId} is locked by run ${currentRun}`);
  }
  profileLocks.set(profileId, runId);
}

async function releaseProfileLock(profileId, runId) {
  if (profileLocks.get(profileId) === runId) {
    profileLocks.delete(profileId);
  }
}

// Enforce in workflow:run handler
ipcMain.handle('workflow:run', async (event, { workflowId, profileId }) => {
  // ...existing auth...
  
  // NEW: Acquire profile lock
  try {
    await acquireProfileLock(profileId, runId);
  } catch (e) {
    return { success: false, error: e.message };
  }
  
  // On workflow end (success/fail/cancel), release lock
});
```

### Issue 4: Webhook Memory Leak on Cancel/Crash
**Severity:** HIGH  
**Problem:** If workflow is cancelled while waiting for webhook, listener never cleaned up.  
**Fix:**
```javascript
// In WorkflowRunner
async stop() {
  this.status = 'cancelled';
  
  // Cleanup all webhook listeners
  const pendingWebhooks = this.context.pendingWebhooks || [];
  for (const webhookId of pendingWebhooks) {
    webhookRegistry.remove(this.context.runId, webhookId);
    console.log(`Cleaned up webhook: ${webhookId}`);
  }
  
  // Cleanup profile lock
  await releaseProfileLock(this.context.profileId, this.context.runId);
  
  // Update DB status
  await db.update('workflow_runs', { status: 'cancelled' }, { id: this.context.runId });
}

// Handle app crash - cleanup on startup
async function cleanupStaleRuns() {
  const staleRuns = await db.query(
    "SELECT * FROM workflow_runs WHERE status = 'running' AND updated_at < NOW() - INTERVAL 1 HOUR"
  );
  
  for (const run of staleRuns) {
    await db.update('workflow_runs', { status: 'orphaned' }, { id: run.id });
    profileLocks.delete(run.profile_id);
    console.log(`Cleaned up stale run: ${run.id}`);
  }
}
```

### Issue 5: `try_catch` Node Incomplete Schema
**Severity:** MEDIUM  
**Problem:** `try_catch` node only has visual and description, missing full schema.  
**Fix:**
```javascript
{
  id: 'try_catch',
  name: 'Try-Catch',
  category: 'Logic',
  riskLevel: 'Low',
  capabilities: ['logic:*'],
  
  inputs: {
    catchErrors: {
      type: 'array',
      default: ['all'],
      description: 'Error types to catch: all, timeout, element_not_found, network_error'
    },
    continueOnCatch: {
      type: 'boolean',
      default: true,
      description: 'Continue workflow after catch block'
    }
  },
  
  outputs: {
    errorCaught: { type: 'boolean' },
    errorMessage: { type: 'string' },
    errorNodeId: { type: 'string' },
    errorType: { type: 'string' }
  },
  
  // Special: 2 output ports
  // output_1: Success path (no error in try block)
  // output_2: Error path (error caught)
  connectionOutputs: 2
}
```

### Issue 6: Rate Limiting for Workflow Execution
**Severity:** MEDIUM  
**Problem:** User can spam Run button → resource exhaustion.  
**Fix:**
```javascript
// Rate limit per user
const runRateLimits = new Map(); // userId -> { count, windowStart }

function checkRateLimit(userId) {
  const limit = runRateLimits.get(userId) || { count: 0, windowStart: Date.now() };
  const windowMs = 60000; // 1 minute window
  const maxRuns = 10; // Max 10 runs per minute
  
  if (Date.now() - limit.windowStart > windowMs) {
    // Reset window
    limit.count = 1;
    limit.windowStart = Date.now();
  } else {
    limit.count++;
    if (limit.count > maxRuns) {
      throw new Error('Rate limit exceeded. Please wait before starting more workflows.');
    }
  }
  
  runRateLimits.set(userId, limit);
}
```

### Issue 7: Max Concurrent Workflows Limit
**Severity:** HIGH  
**Problem:** No limit on concurrent workflows → memory exhaustion.  
**Fix:**
```javascript
const MAX_CONCURRENT_WORKFLOWS = 5;
const activeRuns = new Map();

async function validateConcurrency(userId) {
  const userRuns = Array.from(activeRuns.values())
    .filter(r => r.userId === userId && r.status === 'running');
  
  if (userRuns.length >= MAX_CONCURRENT_WORKFLOWS) {
    throw new Error(`Maximum ${MAX_CONCURRENT_WORKFLOWS} concurrent workflows allowed.`);
  }
}
```

### Issue 8: Variable Name Collision Prevention
**Severity:** MEDIUM  
**Problem:** Loop variables can overwrite workflow variables if same name.  
**Fix:**
```javascript
// Variable resolver with scope isolation
class VariableResolver {
  constructor() {
    this.scopes = new Map(); // scope -> variables
  }
  
  setVariable(name, value, scope = 'workflow') {
    if (!this.scopes.has(scope)) {
      this.scopes.set(scope, new Map());
    }
    
    // Warn if shadowing
    if (scope !== 'workflow' && this.scopes.get('workflow').has(name)) {
      console.warn(`Variable '${name}' shadows workflow variable in scope '${scope}'`);
    }
    
    this.scopes.get(scope).set(name, value);
  }
  
  getVariable(name, scope = 'workflow') {
    // Search in order: current scope → parent scope → workflow scope
    const searchOrder = ['tryCatch', 'loop', 'workflow', 'global'];
    const startIdx = searchOrder.indexOf(scope);
    
    for (let i = startIdx; i < searchOrder.length; i++) {
      const scopeVars = this.scopes.get(searchOrder[i]);
      if (scopeVars && scopeVars.has(name)) {
        return scopeVars.get(name);
      }
    }
    
    return undefined;
  }
  
  clearScope(scope) {
    this.scopes.delete(scope);
  }
}
```

### Issue 9: Workflow Size Validation
**Severity:** MEDIUM  
**Problem:** Spec mentions 500 nodes max but no validation.  
**Fix:**
```javascript
// In WorkflowValidator
checkWorkflowSize(workflowData, errors) {
  const nodes = Object.values(workflowData.drawflow?.Home?.data || {});
  
  if (nodes.length > 500) {
    errors.push({
      code: 'WORKFLOW_TOO_LARGE',
      message: `Workflow has ${nodes.length} nodes, maximum is 500`
    });
  }
  
  // Also check connection count (max 1000)
  const connections = countConnections(workflowData);
  if (connections > 1000) {
    errors.push({
      code: 'TOO_MANY_CONNECTIONS',
      message: `Workflow has ${connections} connections, maximum is 1000`
    });
  }
  
  // Check for circular references
  const hasCircle = detectCycles(workflowData);
  if (hasCircle.found) {
    errors.push({
      code: 'CIRCULAR_REFERENCE',
      message: `Circular connection detected at ${hasCircle.nodeIds.join(' → ')}`
    });
  }
}
```

### Issue 10: Browser Tab Cleanup
**Severity:** HIGH  
**Problem:** If workflow opens new tabs, they're not closed on workflow end.  
**Fix:**
```javascript
// Track opened tabs per run
class ExecutionContext {
  constructor(runId, page) {
    this.runId = runId;
    this.mainPage = page;
    this.openedTabs = []; // Track additional tabs
  }
  
  registerTab(page) {
    this.openedTabs.push(page);
  }
  
  async cleanup() {
    // Close all extra tabs opened during workflow
    for (const tab of this.openedTabs) {
      try {
        if (!tab.isClosed()) {
          await tab.close();
        }
      } catch (e) {
        console.error('Failed to close tab:', e);
      }
    }
    this.openedTabs = [];
  }
}

// In WorkflowRunner
async stop() {
  // ...existing cleanup...
  await this.context.cleanup();
}
```

### Issue 11: Unsaved Changes Warning
**Severity:** MEDIUM  
**Problem:** No warning if user closes/leaves workflow editor with unsaved changes.  
**Fix:**
```javascript
// Frontend: Track dirty state
let isDirty = false;
let lastSavedData = null;

function markDirty() {
  isDirty = true;
  // Update title/indicator
  document.title = '* ' + originalTitle;
}

function markClean(currentData) {
  isDirty = false;
  lastSavedData = JSON.stringify(currentData);
  document.title = originalTitle;
}

// Warn on navigate away
window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
  }
});

// Warn on workflow switch
async function switchToWorkflow(newId) {
  if (isDirty) {
    const confirmed = await showConfirmDialog('Unsaved Changes', 
      'You have unsaved changes. Discard them?');
    if (!confirmed) return;
  }
  loadWorkflow(newId);
}
```

### Issue 12: Undo/Redo State Management
**Severity:** LOW  
**Problem:** Undo/Redo mentioned in keyboard shortcuts but no implementation spec.  
**Fix:**
```javascript
class UndoManager {
  constructor(maxHistory = 50) {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = maxHistory;
  }
  
  push(state) {
    // Remove forward history if we're not at the end
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state
    this.history.push(JSON.stringify(state));
    this.currentIndex++;
    
    // Trim if too long
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
  }
  
  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return JSON.parse(this.history[this.currentIndex]);
    }
    return null;
  }
  
  redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return JSON.parse(this.history[this.currentIndex]);
    }
    return null;
  }
  
  canUndo() { return this.currentIndex > 0; }
  canRedo() { return this.currentIndex < this.history.length - 1; }
}
```

### Issue 13: Workflow Execution Progress Calculation
**Severity:** LOW  
**Problem:** `progress` field in workflow_runs (0-100) but no calculation logic.  
**Fix:**
```javascript
// Calculate progress based on node completion
function calculateProgress(workflow, completedNodeIds) {
  const totalNodes = Object.keys(workflow.nodes).length;
  if (totalNodes === 0) return 100;
  
  // Weight certain nodes differently
  // start/end count less, action nodes count more
  let totalWeight = 0;
  let completedWeight = 0;
  
  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    const weight = NODE_WEIGHTS[node.type] || 1;
    totalWeight += weight;
    
    if (completedNodeIds.includes(nodeId)) {
      completedWeight += weight;
    }
  }
  
  const progress = Math.round((completedWeight / totalWeight) * 100);
  return Math.min(progress, 99); // Only 100 when truly complete
}

const NODE_WEIGHTS = {
  'start': 0.1,
  'end': 0.1,
  'delay': 0.3,
  'condition': 0.5,
  'open_url': 1.5,
  'type_text': 1,
  'click_element': 1,
  'wait_for_webhook': 2, // Long-running
  'wait_for_human': 2
};
```

### Issue 14: Duplicate Node ID Prevention
**Severity:** MEDIUM  
**Problem:** No check if user somehow creates duplicate node IDs.  
**Fix:**
```javascript
// Drawflow wrapper
function safeAddNode(type, ...args) {
  const nodeId = editor.addNode(type, ...args);
  
  // Verify unique
  const allNodeIds = Object.keys(editor.drawflow.drawflow.Home.data);
  const duplicates = allNodeIds.filter(id => allNodeIds.indexOf(id) !== allNodeIds.lastIndexOf(id));
  
  if (duplicates.length > 0) {
    console.error('Duplicate node IDs detected:', duplicates);
    // Remove the duplicate
    editor.removeNodeId(`node-${nodeId}`);
    throw new Error('Failed to create node: ID conflict');
  }
  
  return nodeId;
}
```

### Issue 15: Database Connection Pool Exhaustion
**Severity:** HIGH  
**Problem:** If many workflows use db_select/db_write concurrently, may exhaust pool.  
**Fix:**
```javascript
// Node-level database resource management
const DB_SEMAPHORE_MAX = 10; // Max concurrent DB operations
const dbSemaphore = new Semaphore(DB_SEMAPHORE_MAX);

async function executeDbNode(node, context) {
  await dbSemaphore.acquire();
  
  try {
    // Add timeout to prevent long-running queries
    const queryTimeout = 30000; // 30 seconds
    
    return await Promise.race([
      executeDbQuery(node.inputs),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), queryTimeout)
      )
    ]);
  } finally {
    dbSemaphore.release();
  }
}

class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.current++;
  }
  
  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}
```

### Issue 16: Element Picker Timeout
**Severity:** MEDIUM  
**Problem:** Element picker can hang forever if user doesn't select anything.  
**Fix:**
```javascript
// Add timeout to element picker
async function startElementPicker(browserWindow) {
  const PICKER_TIMEOUT = 120000; // 2 minutes
  
  return Promise.race([
    new Promise((resolve, reject) => {
      // Inject picker and wait for selection
      pickerPromise.then(resolve).catch(reject);
    }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Element picker timeout - please try again')), PICKER_TIMEOUT)
    )
  ]).finally(() => {
    // Always cleanup overlay
    removePickerOverlay(browserWindow);
  });
}
```

### Issue 17: Empty Loop Array Handling
**Severity:** LOW  
**Problem:** `loop_data` on empty array - should skip or error?  
**Fix:**
```javascript
// loop_data implementation
{
  id: 'loop_data',
  // ...existing...
  inputs: {
    data: { type: 'array', required: true },
    onEmpty: {
      type: 'string',
      enum: ['skip', 'error', 'warning'],
      default: 'skip',
      description: 'Behavior when array is empty'
    }
  },
  
  impl: async (inputs, context) => {
    const { data, onEmpty } = inputs;
    
    if (!data || data.length === 0) {
      switch (onEmpty) {
        case 'error':
          throw new Error('Loop data is empty');
        case 'warning':
          context.emit('warning', { message: 'Loop skipped - empty data' });
          // Fall through to skip
        case 'skip':
        default:
          return { loopCompleted: true, iterations: 0 };
      }
    }
    
    // Continue with loop execution
    for (let i = 0; i < data.length; i++) {
      context.setVariable('loop.index', i, 'loop');
      context.setVariable('loop.item', data[i], 'loop');
      context.setVariable('loop.total', data.length, 'loop');
      
      await context.executeConnectedNodes();
    }
    
    context.clearScope('loop');
    return { loopCompleted: true, iterations: data.length };
  }
}
```

### Issue 18: Webhook URL Expiration Display
**Severity:** LOW  
**Problem:** Webhook URL shown in log but no indication when it will expire.  
**Fix:**
```javascript
// In wait_for_webhook node
context.emit('info', {
  message: 'Waiting for webhook',
  webhookUrl: webhookUrl,
  expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
  expiresIn: `${Math.round(timeoutMs / 60000)} minutes`
});
```

### Issue 19: Auto-Save Draft
**Severity:** LOW  
**Problem:** No auto-save mentioned for workflow drafts.  
**Fix:**
```javascript
// Auto-save every 30 seconds when dirty
let autoSaveTimer = null;

function enableAutoSave() {
  editor.on('nodeDataChanged', markDirtyAndScheduleSave);
  editor.on('nodeCreated', markDirtyAndScheduleSave);
  editor.on('nodeRemoved', markDirtyAndScheduleSave);
  editor.on('connectionCreated', markDirtyAndScheduleSave);
  editor.on('connectionRemoved', markDirtyAndScheduleSave);
}

function markDirtyAndScheduleSave() {
  markDirty();
  
  // Debounce auto-save
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  
  autoSaveTimer = setTimeout(async () => {
    try {
      await saveWorkflowDraft();
      showToast('Draft saved automatically');
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }, 30000); // 30 seconds
}

async function saveWorkflowDraft() {
  const data = editor.export();
  await window.api.invoke('workflow:save-draft', {
    workflowId: currentWorkflowId,
    data
  });
}
```

### Issue 20: Nested Loop Depth Check
**Severity:** MEDIUM  
**Problem:** Spec says max 5 nested loops but no validation.  
**Fix:**
```javascript
// In WorkflowValidator
checkNestedLoopDepth(workflowData, errors) {
  const MAX_DEPTH = 5;
  
  for (const [nodeId, node] of Object.entries(workflowData.nodes)) {
    if (node.type === 'loop_data' || node.type === 'loop_count') {
      const depth = calculateLoopDepth(workflowData, nodeId);
      
      if (depth > MAX_DEPTH) {
        errors.push({
          code: 'NESTED_LOOP_TOO_DEEP',
          nodeId,
          message: `Loop at depth ${depth} exceeds maximum of ${MAX_DEPTH}`
        });
      }
    }
  }
}

function calculateLoopDepth(workflow, targetNodeId) {
  let depth = 0;
  let current = targetNodeId;
  const visited = new Set();
  
  // Walk backwards through connections
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = workflow.nodes[current];
    
    if (node.type === 'loop_data' || node.type === 'loop_count') {
      depth++;
    }
    
    // Find parent node
    current = findParentNode(workflow, current);
  }
  
  return depth;
}
```

### Issue 21: Connection Validation - Input/Output Type Mismatch
**Severity:** MEDIUM  
**Problem:** User can connect nodes with incompatible output→input types.  
**Fix:**
```javascript
// Validate connections on create
editor.on('connectionCreated', (connection) => {
  const sourceNode = getNode(connection.output_id);
  const targetNode = getNode(connection.input_id);
  
  const sourceOutput = NODE_REGISTRY[sourceNode.type].outputs;
  const targetInputs = NODE_REGISTRY[targetNode.type].inputs;
  
  // Get output type from source
  const outputPort = connection.output_class.replace('output_', '');
  const outputType = sourceOutput[Object.keys(sourceOutput)[outputPort]]?.type;
  
  // Check if any target input accepts this type
  const acceptableInputs = Object.values(targetInputs)
    .filter(input => input.type === outputType || input.type === 'any');
  
  if (acceptableInputs.length === 0) {
    showWarning(`Type mismatch: ${sourceNode.type} outputs ${outputType}, but ${targetNode.type} doesn't accept it`);
  }
});
```

### Issue 22: Node Copy/Paste Missing
**Severity:** LOW  
**Problem:** Ctrl+C/Ctrl+V mentioned in UX but no implementation.  
**Fix:**
```javascript
let clipboardNode = null;

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'c') {
    const selected = editor.getNodesFromName(selectedNodeId);
    if (selected) {
      clipboardNode = JSON.parse(JSON.stringify(selected));
      showToast('Node copied');
    }
  }
  
  if (e.ctrlKey && e.key === 'v' && clipboardNode) {
    // Paste at offset from original
    const newNode = { ...clipboardNode };
    newNode.pos_x += 50;
    newNode.pos_y += 50;
    
    editor.addNode(
      newNode.name,
      newNode.inputs,
      newNode.outputs,
      newNode.pos_x,
      newNode.pos_y,
      newNode.class,
      newNode.data,
      newNode.html
    );
    showToast('Node pasted');
  }
});
```

### Issue 23: Workflow Import Validation
**Severity:** HIGH  
**Problem:** If user imports malformed JSON, app could crash.  
**Fix:**
```javascript
async function importWorkflow(jsonString) {
  let data;
  
  // 1. Parse JSON
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON format');
  }
  
  // 2. Validate structure
  const requiredFields = ['drawflow', 'name', 'version'];
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // 3. Validate node types
  const allowedNodeTypes = Object.keys(NODE_REGISTRY);
  const nodes = Object.values(data.drawflow?.Home?.data || {});
  
  for (const node of nodes) {
    if (!allowedNodeTypes.includes(node.name)) {
      throw new Error(`Unknown node type: ${node.name}`);
    }
    
    // Validate node version compatibility
    const registryNode = NODE_REGISTRY[node.name];
    if (node.version && node.version > registryNode.version) {
      throw new Error(`Node ${node.name} version ${node.version} requires app update`);
    }
  }
  
  // 4. Sanitize potentially dangerous data
  const sanitized = sanitizeImportedWorkflow(data);
  
  return sanitized;
}

function sanitizeImportedWorkflow(data) {
  // Remove any script tags or event handlers
  const jsonStr = JSON.stringify(data);
  const sanitized = jsonStr
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
  
  return JSON.parse(sanitized);
}
```

### Issue 24: Workflow Export Including Secrets
**Severity:** CRITICAL - SECURITY  
**Problem:** If workflow has hardcoded secrets, export should strip them.  
**Fix:**
```javascript
async function exportWorkflow(workflowId) {
  const workflow = await getWorkflow(workflowId);
  
  // Deep clone
  const exportData = JSON.parse(JSON.stringify(workflow));
  
  // Strip sensitive data
  const nodes = Object.values(exportData.graph_data?.drawflow?.Home?.data || {});
  
  for (const node of nodes) {
    // Check each input field
    for (const [key, value] of Object.entries(node.data || {})) {
      const nodeSpec = NODE_REGISTRY[node.name];
      const inputSpec = nodeSpec?.inputs?.[key];
      
      if (inputSpec?.sensitive) {
        node.data[key] = ''; // Clear sensitive values
        node.data[`${key}_STRIPPED`] = true; // Mark as stripped
      }
    }
  }
  
  // Remove internal IDs
  delete exportData.id;
  delete exportData.created_by;
  delete exportData.updated_by;
  
  // Add export metadata
  exportData.exportedAt = new Date().toISOString();
  exportData.exportedFrom = 'Login Tab Automation Engine';
  
  return exportData;
}
```

### Issue 25: Node Timeout Not Enforced
**Severity:** HIGH  
**Problem:** Node `timeoutMs` defined but not enforced in executor.  
**Fix:**
```javascript
async function executeNodeWithTimeout(node, context) {
  const nodeSpec = NODE_REGISTRY[node.type];
  const timeoutMs = node.data.timeoutMs || nodeSpec.timeoutMs || 30000;
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Node ${node.type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([
      nodeSpec.impl(node.data, context),
      timeoutPromise
    ]);
    return result;
  } catch (e) {
    if (e instanceof TimeoutError) {
      context.emit('node:timeout', { nodeId: node.id, timeoutMs });
      
      // Check retry config
      if (node.retryConfig?.retryOn?.includes('timeout')) {
        throw e; // Let retry handler catch it
      }
    }
    throw e;
  }
}
```

### Issue 26: XSS in Node HTML Content
**Severity:** CRITICAL - SECURITY  
**Problem:** Node data displayed in UI without sanitization.  
**Fix:**
```javascript
// Sanitize all user input before display
function sanitizeForDisplay(value) {
  if (typeof value !== 'string') return value;
  
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML; // HTML-encoded
}

// In node rendering
function renderNodeContent(node) {
  const data = node.data || {};
  
  return `
    <div class="node-content">
      <div class="node-title">${sanitizeForDisplay(node.name)}</div>
      ${Object.entries(data).map(([key, value]) => `
        <div class="node-field">
          <span class="field-label">${sanitizeForDisplay(key)}:</span>
          <span class="field-value">${sanitizeForDisplay(String(value).substring(0, 50))}</span>
        </div>
      `).join('')}
    </div>
  `;
}
```

### Issue 27: Workflow Name Collision
**Severity:** LOW  
**Problem:** Users can create multiple workflows with same name → confusion.  
**Fix:**
```javascript
// In WorkflowService.create()
async create(data, callerId) {
  // Check for name collision
  const existing = await db.query(
    "SELECT id FROM workflows WHERE name = ? AND created_by = ?",
    [data.name, callerId]
  );
  
  if (existing.length > 0) {
    // Auto-rename with suffix
    data.name = await generateUniqueName(data.name, callerId);
  }
  
  // Continue with creation...
}

async function generateUniqueName(baseName, userId) {
  let counter = 1;
  let newName = baseName;
  
  while (true) {
    const exists = await db.query(
      "SELECT COUNT(*) as cnt FROM workflows WHERE name = ? AND created_by = ?",
      [newName, userId]
    );
    
    if (exists[0].cnt === 0) return newName;
    
    counter++;
    newName = `${baseName} (${counter})`;
  }
}
```

### Issue 28: Log Storage Growth
**Severity:** MEDIUM  
**Problem:** Logs grow indefinitely → disk full.  
**Fix:**
```javascript
// Log rotation policy
const LOG_RETENTION_DAYS = 30;
const MAX_LOG_SIZE_MB = 100;

async function cleanupOldLogs() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
  
  // Delete old run logs from DB
  await db.query(
    "DELETE FROM workflow_run_logs WHERE created_at < ?",
    [cutoffDate]
  );
  
  // Delete old log files
  const logDir = path.join(app.getPath('userData'), 'logs');
  const files = await fs.readdir(logDir);
  
  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stats = await fs.stat(filePath);
    
    if (stats.mtime < cutoffDate) {
      await fs.unlink(filePath);
      console.log(`Deleted old log: ${file}`);
    }
  }
}

// Run daily
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
```

### Issue 29: Missing Error Codes Standardization
**Severity:** LOW  
**Problem:** Errors return varied formats, hard to handle.  
**Fix:**
```javascript
// Standardized error codes
const ERROR_CODES = {
  // Validation errors (1xxx)
  WORKFLOW_INVALID: 1001,
  NODE_MISSING_REQUIRED: 1002,
  CONNECTION_INVALID: 1003,
  
  // Execution errors (2xxx)
  NODE_TIMEOUT: 2001,
  ELEMENT_NOT_FOUND: 2002,
  NETWORK_ERROR: 2003,
  WEBHOOK_TIMEOUT: 2004,
  
  // Permission errors (3xxx)
  UNAUTHORIZED: 3001,
  FORBIDDEN: 3002,
  SCOPE_VIOLATION: 3003,
  
  // System errors (4xxx)
  DATABASE_ERROR: 4001,
  BROWSER_CRASH: 4002,
  MEMORY_EXCEEDED: 4003
};

class WorkflowError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.name = 'WorkflowError';
    this.details = details;
    this.timestamp = Date.now();
  }
  
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}
```

### Issue 30: Browser DevTools Access
**Severity:** LOW  
**Problem:** Spec doesn't mention if DevTools is available during debug.  
**Fix:**
```javascript
// Add DevTools toggle in workflow settings
const workflowSettings = {
  enableDevTools: {
    type: 'boolean',
    default: false,
    description: 'Open browser DevTools during execution (debug mode)',
    requiredRole: 'admin' // Only admins can enable
  }
};

// In BrowserManager
async launchBrowserForWorkflow(profile, workflowSettings) {
  const browser = await puppeteer.launch({
    headless: !workflowSettings.showBrowser,
    devtools: workflowSettings.enableDevTools // Open DevTools if enabled
  });
  
  return browser;
}
```

### Issue 31: Memory Leak on Long-Running Workflows
**Severity:** HIGH  
**Problem:** Event listeners and context objects not cleaned up properly.  
**Fix:**
```javascript
class WorkflowRunner {
  constructor() {
    this.eventListeners = [];
  }
  
  // Track all event listeners
  addEventListener(target, event, handler) {
    target.addEventListener(event, handler);
    this.eventListeners.push({ target, event, handler });
  }
  
  // Cleanup on workflow end
  cleanup() {
    // Remove all event listeners
    for (const { target, event, handler } of this.eventListeners) {
      target.removeEventListener(event, handler);
    }
    this.eventListeners = [];
    
    // Clear context
    this.context = null;
    
    // Force garbage collection hint
    if (global.gc) global.gc();
  }
}
```

### Issue 32: Parallel Branch Execution
**Severity:** MEDIUM  
**Problem:** Spec doesn't cover parallel branches from condition node.  
**Fix:**
```javascript
// Parallel execution support
async function executeParallelBranches(node, branches, context) {
  if (branches.length === 0) return;
  
  // For condition/switch, only execute one branch (not parallel)
  if (node.type === 'condition' || node.type === 'switch') {
    const activeBranch = evaluateBranchCondition(node, context);
    await executeBranch(activeBranch, context);
    return;
  }
  
  // For parallel node (future), execute all branches concurrently
  if (node.type === 'parallel') {
    const results = await Promise.all(
      branches.map(branch => executeBranch(branch, context.clone()))
    );
    
    // Merge results
    context.setVariable('parallelResults', results);
  }
}
```

### Issue 33: Workflow Statistics Dashboard Missing
**Severity:** LOW  
**Problem:** No way to view workflow success rates, avg duration, etc.  
**Fix:**
```javascript
// Add statistics endpoint
ipcMain.handle('workflow:getStats', async (event, { workflowId }) => {
  const stats = await db.query(`
    SELECT 
      COUNT(*) as totalRuns,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failCount,
      AVG(duration_ms) as avgDuration,
      MAX(duration_ms) as maxDuration,
      MIN(duration_ms) as minDuration
    FROM workflow_runs
    WHERE workflow_id = ?
    GROUP BY workflow_id
  `, [workflowId]);
  
  return stats[0] || {
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    avgDuration: 0
  };
});
```

### Issue 34: Missing Test Suite Structure
**Severity:** HIGH  
**Problem:** Test scenarios mentioned but no test file structure.  
**Fix:**
```
tests/
├── unit/
│   ├── nodes/
│   │   ├── click_element.test.js
│   │   ├── type_text.test.js
│   │   └── ...
│   ├── services/
│   │   ├── WorkflowService.test.js
│   │   ├── WorkflowRunner.test.js
│   │   └── WorkflowValidator.test.js
│   └── utils/
│       └── VariableResolver.test.js
├── integration/
│   ├── workflows/
│   │   ├── simple_login.test.js
│   │   ├── login_with_2fa.test.js
│   │   └── error_recovery.test.js
│   └── ipc/
│       └── workflow_handlers.test.js
├── e2e/
│   └── workflow_editor.test.js
├── fixtures/
│   ├── workflows/
│   │   ├── valid_workflow.json
│   │   └── invalid_workflow.json
│   └── mocks/
│       └── browser_mock.js
└── helpers/
    └── test_utils.js
```

### Issue 35: Canvas Zoom/Pan Controls Missing
**Severity:** MEDIUM  
**Problem:** Large workflows hard to navigate without zoom controls.  
**Fix:**
```javascript
// Add zoom controls
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let currentZoomIndex = 3; // 1.0

function zoomIn() {
  if (currentZoomIndex < ZOOM_LEVELS.length - 1) {
    currentZoomIndex++;
    editor.zoom = ZOOM_LEVELS[currentZoomIndex];
    updateZoomIndicator();
  }
}

function zoomOut() {
  if (currentZoomIndex > 0) {
    currentZoomIndex--;
    editor.zoom = ZOOM_LEVELS[currentZoomIndex];
    updateZoomIndicator();
  }
}

function zoomReset() {
  currentZoomIndex = 3;
  editor.zoom = 1.0;
  updateZoomIndicator();
}

function zoomToFit() {
  const bounds = getNodesBoundingBox();
  const containerSize = getContainerSize();
  
  const scaleX = containerSize.width / bounds.width;
  const scaleY = containerSize.height / bounds.height;
  const scale = Math.min(scaleX, scaleY, 1.0) * 0.9; // 90% to add margin
  
  editor.zoom = scale;
  editor.translate_to(-bounds.minX * scale, -bounds.minY * scale);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '+') zoomIn();
  if (e.ctrlKey && e.key === '-') zoomOut();
  if (e.ctrlKey && e.key === '0') zoomReset();
  if (e.ctrlKey && e.key === '1') zoomToFit();
});

// Mouse wheel zoom
canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }
});
```

### Issue 36: Workflow Search/Filter
**Severity:** LOW  
**Problem:** No way to search workflows by name, node type, or status.  
**Fix:**
```javascript
// Enhanced workflow list filtering
async function searchWorkflows(query) {
  const filters = parseSearchQuery(query);
  
  let sql = "SELECT * FROM workflows WHERE created_by = ?";
  const params = [currentUserId];
  
  // Name search
  if (filters.name) {
    sql += " AND name LIKE ?";
    params.push(`%${filters.name}%`);
  }
  
  // Status filter
  if (filters.status) {
    sql += " AND status = ?";
    params.push(filters.status);
  }
  
  // Node type filter (search in graph_data JSON)
  if (filters.nodeType) {
    sql += " AND JSON_SEARCH(graph_data, 'one', ?) IS NOT NULL";
    params.push(filters.nodeType);
  }
  
  // Date range
  if (filters.since) {
    sql += " AND created_at >= ?";
    params.push(filters.since);
  }
  
  return db.query(sql, params);
}

// Search syntax examples:
// "login" - name contains "login"
// "status:published" - only published
// "node:wait_for_webhook" - contains webhook node
// "since:2026-01-01" - created after date
```

### Issue 37: Node Help/Documentation
**Severity:** LOW  
**Problem:** No inline help for nodes, users have to read spec.  
**Fix:**
```javascript
// Add help content to each node
const NODE_HELP = {
  'click_element': {
    summary: 'Click on an HTML element',
    inputs: {
      selector: 'CSS selector to find the element. Use 🎯 Pick to select visually.',
      waitForSelector: 'Wait until element exists before clicking (recommended).',
      timeout: 'Max time to wait for element (ms). Default: 30000.'
    },
    tips: [
      'Use data-testid or id selectors for stability',
      'Scroll element into view first if below the fold',
      'Add wait_element before click if page is dynamic'
    ],
    examples: [
      { input: '#submit-btn', description: 'Click by ID' },
      { input: '[data-action="login"]', description: 'Click by data attribute' },
      { input: 'button:has-text("Sign In")', description: 'Click by text' }
    ],
    commonErrors: {
      'Element not found': 'Check selector, add wait, or use Element Picker',
      'Element not visible': 'Element exists but hidden. Check if modal/overlay blocking.'
    }
  }
  // ... more nodes
};

// Show help panel
function showNodeHelp(nodeType) {
  const help = NODE_HELP[nodeType];
  if (!help) return;
  
  showHelpPanel({
    title: nodeType,
    content: renderHelpContent(help)
  });
}
```

### Issue 38: Webhook Debug Mode
**Severity:** MEDIUM  
**Problem:** Hard to test webhooks without external system.  
**Fix:**
```javascript
// Add webhook test/debug feature
ipcMain.handle('workflow:testWebhook', async (event, { webhookId, testData }) => {
  // Simulate webhook call for testing
  const webhook = webhookRegistry.get(webhookId);
  
  if (!webhook) {
    return { success: false, error: 'Webhook not found' };
  }
  
  // Inject test data as if webhook was called
  webhook.resolve({
    received: true,
    data: testData,
    source: 'debug'
  });
  
  return { success: true };
});

// UI: Add "Test" button next to webhook URL in execution log
// Opens modal to enter test data JSON
```

### Issue 39: Workflow Templates
**Severity:** MEDIUM  
**Problem:** Users start from scratch, no starter templates.  
**Fix:**
```javascript
const WORKFLOW_TEMPLATES = [
  {
    id: 'simple_login',
    name: 'Simple Login',
    description: 'Basic username/password login',
    category: 'Authentication',
    graph_data: { /* pre-built workflow */ }
  },
  {
    id: 'login_2fa',
    name: 'Login with 2FA',
    description: 'Login with TOTP 2-factor authentication',
    category: 'Authentication',
    graph_data: { /* ... */ }
  },
  {
    id: 'data_scrape',
    name: 'Data Scraper',
    description: 'Extract data from web page into database',
    category: 'Data',
    graph_data: { /* ... */ }
  },
  {
    id: 'form_fill',
    name: 'Form Filler',
    description: 'Auto-fill web form with profile data',
    category: 'Data Entry',
    graph_data: { /* ... */ }
  }
];

// UI: Show template picker on "New Workflow"
function showTemplateSelector() {
  return showModal({
    title: 'Create Workflow',
    options: [
      { label: 'Blank Workflow', value: null },
      ...WORKFLOW_TEMPLATES.map(t => ({
        label: t.name,
        description: t.description,
        value: t.id
      }))
    ]
  });
}
```

### Issue 40: Execution History Viewer
**Severity:** LOW  
**Problem:** Can't view past runs with their logs.  
**Fix:**
```javascript
// Add run history panel
ipcMain.handle('workflow:getRunHistory', async (event, { workflowId, limit = 20 }) => {
  const runs = await db.query(`
    SELECT 
      r.*,
      u.username as started_by_name
    FROM workflow_runs r
    LEFT JOIN users u ON r.started_by = u.id
    WHERE r.workflow_id = ?
    ORDER BY r.started_at DESC
    LIMIT ?
  `, [workflowId, limit]);
  
  return runs;
});

ipcMain.handle('workflow:getRunLogs', async (event, { runId }) => {
  const logs = await db.query(`
    SELECT * FROM workflow_run_logs
    WHERE run_id = ?
    ORDER BY created_at ASC
  `, [runId]);
  
  return logs;
});

// UI: Add "History" tab next to workflow editor
// Shows list of runs with status, duration, timestamp
// Click run to view execution logs replay
```

---

## 🔐 Freeze Notes

**Status:** COMPREHENSIVE REVIEW v2.0.9 COMPLETE (4 review passes)

**Review Summary:**
- **40 Critical Issues** identified and documented with fixes
- **4 CRITICAL severity** (security-related)
- **12 HIGH severity** (core functionality)
- **14 MEDIUM severity** (performance, validation)
- **10 LOW severity** (UX improvements)

**Key Additions from Review:**
1. **35+ nodes** catalog with edge cases
2. **`send_webhook`** node for outbound data
3. **`wait_for_human`** node for manual intervention
4. **`try_catch`** error handling
5. **Retry logic** per node
6. **Comprehensive edge case analysis**
7. **Test scenarios** documented
8. **Variable resolution** expanded
9. **UI Bug fixes** documented (node positioning, element picker)
10. **Backend Architecture** (module structure, services, IPC handlers)
11. **Frontend UI/UX Design** (components, states, interactions, responsive)
12. **RBAC v2 Integration** (permissions, scope enforcement, audit logging)
13. **Database Schema** (7 tables with indexes and migrations)
14. **40 Critical Issues with Code Fixes**

**Security Issues Addressed:**
- Profile concurrency lock (#3) - prevent session conflicts
- Export secret stripping (#24) - don't leak secrets in exports
- XSS sanitization (#26) - prevent script injection
- Import validation (#23) - sanitize imported workflows

**Performance Issues Addressed:**
- Webhook memory leak cleanup (#4, #31)
- Rate limiting (#6) - 10 runs/minute limit
- Concurrent workflow limits (#7) - max 5
- DB connection pooling (#15) - semaphore

**UX Improvements Specified:**
- Zoom/pan controls (#35)
- Workflow templates (#39)
- Inline help (#37)
- Copy/paste (#22)
- Auto-save (#19)
- Execution history (#40)

---

## 🔮 11. Future Considerations (Review Notes)

### 11.1 State Persistence & Recovery

| Scenario | Current | Should Handle |
|----------|---------|---------------|
| App crash mid-workflow | Lost | Save checkpoint, offer resume on restart |
| Browser close by user | Error | Detect and offer re-launch |
| Network disconnect | Error | Retry with exponential backoff |
| Workflow paused too long | Memory leak | Auto-timeout after 1 hour |
| Multiple browser windows | Confusion | Track page per workflow run |

### 11.2 Concurrency & Multi-User

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Same workflow edited by 2 users | Data loss | Lock workflow during edit, show warning |
| Same profile used by 2 workflows | Session conflict | Queue or reject second run |
| High webhook volume | Server overload | Rate limit per workflow, queue |
| Many concurrent workflows | Memory | Max 5 concurrent workflows |

### 11.3 Performance Limits

| Resource | Limit | Reason |
|----------|-------|--------|
| Max nodes per workflow | 500 | Canvas performance |
| Max workflow duration | 2 hours | Memory, stale sessions |
| Max loop iterations | 10,000 | Prevent infinite loops |
| Max webhook wait | 30 minutes | Resource cleanup |
| Max HTTP response | 1 MB | Memory |
| Max variables | 1,000 | Context size |
| Max nested loops | 5 | Stack depth |

### 11.4 Additional Nodes to Consider (P3+)

**Browser Navigation:**
| Node | Description |
|------|-------------|
| `reload_page` | Refresh current page |
| `go_back` | Browser back button |
| `go_forward` | Browser forward button |
| `get_current_url` | Get current URL into variable |
| `get_page_title` | Get page title |
| `scroll_page` | Scroll page by pixels (not to element) |
| `focus_element` | Focus on input without click |
| `drag_drop` | Drag element to target |
| `file_download` | Wait for/handle file downloads |

**Data Operations:**
| Node | Description |
|------|-------------|
| `array_push` | Add item to array variable |
| `array_filter` | Filter array by condition |
| `array_map` | Transform each array item |
| `string_split` | Split string to array |
| `string_replace` | Replace in string |
| `date_format` | Format date/time |
| `date_diff` | Calculate time difference |
| `random_number` | Generate random number |
| `random_string` | Generate random string |

**Integrations:**
| Node | Description |
|------|-------------|
| `email_send` | Send email via SMTP |
| `sms_send` | Send SMS via API |
| `slack_notify` | Send Slack message |
| `telegram_notify` | Send Telegram message |
| `google_sheets_read` | Read from Google Sheets |
| `google_sheets_write` | Write to Google Sheets |

### 11.5 UX Features (Future)

| Feature | Priority | Description |
|---------|----------|-------------|
| Workflow templates | P2 | Pre-built workflows for common tasks |
| Workflow duplication | P2 | Clone existing workflow |
| Workflow import/export | P2 | JSON file import/export |
| Workflow sharing | P3 | Share between users |
| Workflow marketplace | P4 | Community-shared workflows |
| Dark mode | P3 | UI theme |
| Keyboard shortcuts | P2 | Ctrl+S, Ctrl+Z, etc. |
| Node grouping | P3 | Group nodes into sub-workflow |
| Comments/notes | P2 | Add notes to canvas |
| Minimap | P3 | Overview of large workflows |

### 11.6 Debugging Features (Future)

| Feature | Priority | Description |
|---------|----------|-------------|
| Step-by-step mode | P2 | Execute one node at a time |
| Breakpoints | P3 | Pause at specific node |
| Variable inspector | P2 | View all variables during run |
| Watch expressions | P3 | Monitor specific values |
| Execution history | P2 | View past runs with logs |
| Screenshot on error | P2 | Auto-capture when error |
| Video recording | P3 | Record browser during workflow |
| Error notification | P2 | Email/webhook on workflow fail |

### 11.7 Login Tab Integration

| Feature | Description | Phase |
|---------|-------------|-------|
| Auto-run on profile launch | Run assigned workflow when browser opens | P2 |
| Workflow per platform | Assign default workflow to platform | P2 |
| Pre-login workflow | Run before manual login | P3 |
| Post-login workflow | Run after successful login | P2 |
| Session validation workflow | Check if session still valid | P3 |
| Profile data in workflow | Access all profile fields | P1 |

### 11.8 Webhook Security Enhancements

| Feature | Description | Phase |
|---------|-------------|-------|
| Webhook secret | Require X-Webhook-Secret header | P1 |
| HMAC signature | Verify payload integrity | P2 |
| IP allowlist | Only accept from specific IPs | P3 |
| Payload schema validation | Validate against JSON schema | P2 |
| Webhook logs | Log all incoming webhooks | P1 |
| Webhook retry | Caller can retry failed webhooks | P2 |

### 11.9 Additional Edge Cases Found in Review

| Case | Node | Handling |
|------|------|----------|
| Element in shadow DOM | `click_element` | Support `>>> ` selector syntax |
| Page has multiple frames | `get_text` | Specify frame or auto-search |
| Lazy-loaded content | `wait_element` | Wait for visibility, not just existence |
| React/Vue virtual DOM | `type_text` | Dispatch input events properly |
| File picker dialog | `upload_file` | Use setInputFiles() not click |
| Auto-complete dropdown | `type_text` | May need delay + arrow key |
| Password managers | `type_text` | May interfere, need focus first |
| Cookie consent popup | All browser | Auto-dismiss or handle first |
| Age verification popup | All browser | Auto-handle common patterns |
| Redirect after action | `click_element` | Wait for navigation if needed |
| SPA without page load | `wait_navigation` | Wait for network idle instead |
| Dynamic class names | `click_element` | Use text-based or attribute selectors |
| A/B testing variants | `element_exists` | Support multiple selectors |

---

## 📊 12. Metrics & Success Criteria

### 12.1 Implementation Success

| Metric | Target |
|--------|--------|
| Core nodes implemented | 25+ |
| Unit test coverage | 80%+ per node |
| Integration test workflows | 10+ |
| Bug reports after release | < 5 critical |

### 12.2 User Adoption

| Metric | Target (3 months) |
|--------|-------------------|
| Workflows created | 50+ |
| Workflows executed | 500+ |
| Unique users using automation | 80% of total |
| Failed workflow rate | < 10% |

---

**Reviewer Comments:**
> _Space for USER comments before freeze_

---

**Revision History:**
- v2.0.0: Initial draft
- v2.0.1: Comprehensive review with edge cases, new nodes, test scenarios
- v2.0.2: UI bug fixes (node positioning, element picker)
- v2.0.3: Added Future Considerations, Performance Limits, Additional Nodes, Integration Plans, Metrics
- v2.0.4: Added Common Workflow Patterns (7 patterns), Troubleshooting Guide (20+ issues)
- v2.0.5: Major revision - Added DependsOn/Non-Negotiables (Anti-Drift compliance), Master Spec alignment (capabilities, risk levels, resource locks), RBAC v2 Integration (workflow permissions, scope enforcement, audit logging), Database Schema (7 tables with indexes and migrations)
- v2.0.6: Added comprehensive Backend Architecture Design (module structure, core services, IPC handlers, webhook server) and Frontend UI/UX Design (page structure, component hierarchy, UI states, interactions, responsive design, accessibility)
- v2.0.7: Comprehensive self-review - Added 20 Critical Issues & Fixes (missing start/end nodes, profile concurrency lock, webhook memory leak cleanup, try_catch schema, rate limiting, concurrent workflow limits, variable scope isolation, workflow size validation, browser tab cleanup, unsaved changes warning, undo/redo, progress calculation, duplicate node prevention, DB semaphore, element picker timeout, empty loop handling, webhook expiration display, auto-save draft, nested loop depth check)
- v2.0.8: Second review pass - Added 10 more Critical Issues (connection type validation, copy/paste, import validation, export secret stripping, node timeout enforcement, XSS sanitization, name collision prevention, log rotation, error code standardization, DevTools access)
- v2.0.9: Third review pass - Added 10 more Critical Issues (memory leak cleanup, parallel branch execution, workflow statistics, test suite structure, zoom/pan controls, workflow search, inline help, webhook debug mode, workflow templates, execution history viewer)
