# eurooffice-nextcloud

Guidance for Claude Code (and other AI agents) working in **eurooffice-nextcloud** — the Nextcloud integration app for Euro-Office Document Server.

## What this repo is

A Nextcloud app (fork of `nextcloud/onlyoffice`) that embeds the Euro-Office Document Server editor inside Nextcloud for creating, editing, and collaborating on documents, spreadsheets, presentations, and PDFs. App ID: `eurooffice`. Licensed **AGPL-3.0**. Compatible with Nextcloud 33–35, PHP 8.1–8.4.

The app is a pure connector: it does not contain an editor. It generates JWT tokens, routes WOPI-like callbacks, and renders the editor iframe. The Document Server is a separate process (see [DocumentServer/AGENTS.md](../DocumentServer/AGENTS.md) for the Docker dev environment).

**Stack:** PHP 8.1–8.4 (`OCA\Eurooffice`, Nextcloud AppFramework), `firebase/php-jwt ^7.0`, Vue 3.5 + Vite 7 (`@nextcloud/vite-config`), Node 20.

**Multi-tool note:** Claude Code loads this file via `CLAUDE.md → @AGENTS.md`. Cursor, Gemini, and other agents read `AGENTS.md` directly. Both read the same file; there is no separate content.

---

## Architecture Constraints

### 1. JWT — Two Distinct Secrets

There are two independent JWT secrets. Conflating them silently breaks either the callback URL or the DS↔Nextcloud handshake.

| Secret | `AppConfig` accessor | Config key | Purpose |
|---|---|---|---|
| Internal URL token | `getSKey()` | `secret` | Signs/verifies the `$doc` parameter on every callback URL (`/track`, `/download`). Handled exclusively by `Crypt::getHash()` / `Crypt::readHash()`. |
| DS↔Nextcloud JWT | `getDocumentServerSecret()` | `jwt_secret` | Validates the JWT that Document Server sends in the `Authorization: Bearer` header (or `token` body field) on every callback request. Decoded directly via `\Firebase\JWT\JWT::decode()` in `CallbackController`. |

**Critical fail mode:** A mismatch on `getDocumentServerSecret()` causes a silent HTTP 403 on the callback with no useful log. It does not throw; it returns an error JSON. The save is lost.

### 2. Callback `/track` — Save Lifecycle

Route: `POST /apps/eurooffice/track` → `CallbackController::track()`.

Status codes (defined as private constants in `CallbackController` — do not change values):

| Constant | Value | Meaning |
|---|---|---|
| `TRACKERSTATUS_EDITING` | 1 | User opened/is editing; app acquires an `ILockManager` lock |
| `TRACKERSTATUS_MUSTSAVE` | 2 | DS finished editing; app must fetch and save the document |
| `TRACKERSTATUS_CORRUPTED` | 3 | DS detected corruption; app still attempts to save |
| `TRACKERSTATUS_CLOSED` | 4 | All users disconnected; app releases the lock |
| `TRACKERSTATUS_FORCESAVE` | 6 | Explicit user-triggered save |
| `TRACKERSTATUS_CORRUPTEDFORCESAVE` | 7 | Forcesave on corrupt document |

**Status 2/6 save path (synchronous, must not be made async):**
1. Validate DS JWT from `Authorization` header or body `token` field.
2. Resolve file via `IRootFolder::getUserFolder($userId)->getById($fileId)` (Nextcloud VFS).
3. Fetch new document content from the DS-provided URL via `DocumentService::request($url)`.
4. Acquire `ILockManager` lock via `LockContext($file, ILock::TYPE_APP, $appName)`.
5. Write via `OCP\Files\File::putContent($newData)` — this is the VFS write; it is synchronous.
6. Release lock, update `KeyManager` state in `*PREFIX*eurooffice_filekey`.
7. Return `{"error": 0}` (HTTP 200). Any other response tells DS the save failed.

`retryOperation()` retries `putContent()` up to 4 times with 500 ms sleep on `LockedException`. This blocking behaviour is intentional — the DS webhook waits for the response.

### 3. Filesystem Abstraction — Nextcloud VFS Only

All user-data I/O must go through the Nextcloud Virtual Filesystem:

- **Read:** `OCP\Files\File::fopen('rb')` or `File::getContent()`
- **Write:** `OCP\Files\File::putContent($data)`
- **Resolve:** `IRootFolder::getUserFolder($uid)->getById($fileId)` or `getByPath()`

The single legitimate use of a native PHP call is `file_get_contents($templatePath)` in `CallbackController::emptyfile()` to serve a **bundled read-only template** from the app directory — not user data.

### 4. Configuration Gateway — `AppConfig` Only

All settings are read and written through `OCA\Eurooffice\AppConfig`, which wraps `OCP\IConfig` and `OCP\IAppConfig`. Never access `\OC::$server->getConfig()` or `\OCP\Server::get(IConfig::class)` directly in business logic.

Three equivalent interfaces for operators: Admin UI (`/settings/admin/eurooffice`), `occ config:app:set eurooffice <key> <value>`, or `config.php` array.

### 5. Permission Model

- **Group-based access:** `AppConfig::isUserAllowedToUse(?string $userId)` gates all editor entry points (`EditorController::index()`, `EditorController::save()`). Do not bypass it.
- **File permissions:** `OCP\Constants::PERMISSION_READ/CREATE/UPDATE` flags are checked via `IFile::isReadable()`, `isCreatable()`, `isUpdateable()` before any file operation.
- **Share permissions:** `FileUtility::canShareDownload(IShare $share)` checks the share download attribute. `IManager::getShareByToken()` validates public share tokens.
- Extra fine-grained permissions (`REVIEW=1`, `COMMENT=2`, `FILLFORMS=4`, `MODIFYFILTER=8`) live in `OCA\Eurooffice\ExtraPermissions` backed by `*PREFIX*eurooffice_permissions` table.
- `CallbackController::download()` always checks `$file->isReadable()` before streaming.

---

## Rules

**Never:**
- Modify `Crypt::getHash()` / `Crypt::readHash()` or the JWT decode calls in `CallbackController` without updating both secrets in lockstep and retesting the full save cycle.
- Introduce any `async`, queue, or deferred execution in the status 2/6 branch of `CallbackController::track()`. The Document Server blocks on the HTTP response; deferring the write will appear to succeed but the document will not be saved.
- Use `fopen`, `file_put_contents`, `file_get_contents`, or any native PHP filesystem function on user-owned paths. Use `OCP\Files\File` methods exclusively.
- Access config via `\OC::$server->getConfig()` or direct `\OCP\IConfig` injection in business logic — always go through `AppConfig`.
- Bypass Nextcloud's permission check hooks. Never render the editor iframe or serve a file download without a successful `$file->isReadable()` / share permission check.
- Disable JWT (`getDocumentServerSecret()` returning empty) as a workaround for TLS or connectivity issues. Set `verify_peer_off` in `config.php` for self-signed certificates instead.
- Run `occ` as root — always `sudo -u www-data php occ …`.
- Change the integer values of the `TRACKERSTATUS_*` constants in `CallbackController` — they are part of the Document Server wire protocol.
- Widen the Nextcloud compatibility range in `appinfo/info.xml` (`min-version="33"` / `max-version="35"`) without testing against the target version.
- Include files listed in `.nextcloudignore` in a release package.
- Leave the app directory owned by any user other than `www-data` after file operations.

**Always:**
- Run `chown -R www-data:www-data /path/to/eurooffice` after any `git pull` or file operation as a non-`www-data` user.
- Return `{"error": 0}` (HTTP 200) from `track()` when the save succeeds; any non-zero `error` value causes DS to mark the document as unsaved.
- Acquire an `ILockManager` lock (via `LockContext`) before calling `File::putContent()` in the save path.
- Build frontend assets with `npm run build` before committing changes to `src/`. Never edit files under `js/` directly — they are Vite output.
- Keep `AppConfig` as the single gateway for all reads and writes of app settings.
- Validate `$doc` hash via `Crypt::readHash()` before processing any callback route.

---

## Gotchas

- **Callback URL must be routable from Document Server:** DS must be able to POST to `/apps/eurooffice/track`. Browser-to-DS connectivity is irrelevant; only the DS→Nextcloud direction matters. Misconfiguration manifests as silent save failures, not an error page.
- **`#[PublicPage]` and `#[NoCSRFRequired]` on callback routes are intentional.** DS does not carry Nextcloud session tokens. Removing these attributes breaks all saves.
- **`KeyManager` uses raw SQL via `IDBConnection`** (table `*PREFIX*eurooffice_filekey`). Do not refactor to an ORM or Repository pattern — Nextcloud's AppFramework ORM layer does not provide the lock/forcesave column semantics needed here.
- **`_jwtLeeway` (`jwt_leeway` config key)** is exposed in `AppConfig` to tolerate clock skew between DS and Nextcloud. Do not remove it.
- **`FileVersions` uses `OC\Files\View`** (internal, non-OCP API) for reading and writing version history data. This class is fragile across Nextcloud major versions and is a known breakage point when upgrading beyond the declared max-version. Do not extend its usage.

---

## Findings Reference

JWT misconfiguration edge cases (header vs. body token, leeway tuning), Nextcloud-version-specific compatibility issues, and DS callback failure analysis should be documented in code comments or GitHub issues (label them for easy retrieval).
