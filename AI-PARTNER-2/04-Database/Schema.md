# Database Schema Reference

## 1. Overview
- **Engine**: MySQL / MariaDB via `mysql2` driver.
- **Init**: `src/database/mysql.js`.

## 2. Core Tables
### `users`
- `id` (PK), `username`, `password`, `role`, `managed_by_admin_id`.

### `accounts`
- `id` (PK)
- `name`, `loginUrl`
- `proxy_config` (JSON): `{host, port, user, pass, type}`
- `auth_config` (JSON): `{username, password, 2fa_secret}`
- `fingerprint_config` (JSON): `{userAgent, viewport, ...}`
- `platform_id` (FK)
- `workflow_id` (FK)

### `account_assignments`
- `user_id` (FK)
- `account_id` (FK)

### `workflows`
- `id` (PK)
- `name`
- `graph_data` (JSON): Drawflow node graph.

### `proxies`
- `id` (PK)
- `host`, `port`, `user`, `pass`
- `status` ('Live'/'Dead')

### `session_backups`
- `account_id` (FK)
- `session_data` (LONGBLOB): Zipped UserDataDir.
