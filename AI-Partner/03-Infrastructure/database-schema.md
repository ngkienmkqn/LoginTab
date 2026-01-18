# Database Schema Reference

## 1. Overview
- **Engine**: MySQL / MariaDB (via `mysql2`).
- **Initialization**: `src/database/mysql.js` (Auto-creates tables on boot).
- **Foreign Keys**: Usage of relational mapping (User <-> Account).

## 2. Table Definitions

### `users`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) | Primary Key (UUID). |
| `username` | VARCHAR | Login ID. |
| `password` | VARCHAR | Plain text (Currently). |
| `role` | ENUM | `'super_admin'`, `'admin'`, `'staff'`. |

### `accounts`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) | Primary Key (UUID). |
| `name` | VARCHAR | Display Name. |
| `loginUrl` | TEXT | Target URL for automation. |
| `proxy_config` | JSON | `{host, port, user, pass, type}`. |
| `auth_config` | JSON | `{username, password, 2fa_secret}`. |
| `fingerprint_config` | JSON | `{userAgent, viewport, webgl_renderer...}`. |
| `lastActive` | TIMESTAMP | Last time browser was closed. |
| `platform_id` | VARCHAR | Link to `platforms`. |
| `workflow_id` | VARCHAR | Link to `workflows` (Auto-login script). |

### `account_assignments`
| Field | Type | Description |
| :--- | :--- | :--- |
| `user_id` | VARCHAR(36) | Link to `users`. |
| `account_id` | VARCHAR(36) | Link to `accounts`. |

### `proxies` (Resource Pool)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) | UUID. |
| `host`, `port`... | VARCHAR | Connection details. |
| `status` | VARCHAR | Cached health status ('Live', 'Dead'). |

### `workflows`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) | UUID. |
| `name` | VARCHAR | Display Name. |
| `graph_data` | JSON | The Drawflow JSON object structure. |

### `session_backups`
| Field | Type | Description |
| :--- | :--- | :--- |
| `account_id` | VARCHAR(36) | Key. |
| `session_data` | LONGBLOB | Zipped session folder (Max 64MB typical limit). |

## 3. JSON Configurations Structure

### Fingerprint JSON
```json
{
  "userAgent": "Mozilla/5.0...",
  "viewport": { "width": 1920, "height": 1080 },
  "platform": "Win32",
  "webgl_vendor": "Google Inc. (NVIDIA)",
  "webgl_renderer": "ANGLE (NVIDIA GeForce RTX 3060...)"
}
```
