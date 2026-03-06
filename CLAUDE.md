# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nextcloud app that integrates ONLYOFFICE Document Server. The backend is PHP, the frontend is a multi-entry Vite build. The app registers file actions, a sidebar share tab, a viewer, and a standalone editor page.

## Build & Development Commands

```bash
npm install   # install dependencies
npm run build # production build
npm run dev   # development build (unminified, source maps)
```

Build output goes to `js/` (bundles) and `css/` (extracted stylesheets, one per entry point).

## How the Editor Works

The editor page loads `editor.js` inside an `<iframe>`. That script fetches an editor config from the PHP backend via an OCS API call, then calls `new DocsAPI.DocEditor()` with that config. DocsAPI is an external JS library served by the ONLYOFFICE Document Server itself — it is not bundled.

The Document Server communicates back to the app through callbacks defined in the config (save, error, ready, etc.) and through `postMessage` for actions triggered by the user inside the editor (save-as, insert image, etc.).

## Frontend Structure

Multiple Vite entry points — see `vite.config.mjs`. Each is loaded on a specific page via PHP listeners/templates.

**`editor.js` and `listener.js` are a pair.** When the editor opens in the same tab (not a new window), `listener.js` runs in the Files app parent window and `editor.js` runs in the iframe. They communicate via `postMessage` — `editor.js` posts requests (save-as, insert image, reference source, etc.) and `listener.js` handles them by opening file pickers and posting responses back.

All HTTP calls are in TypeScript service modules under `src/services/`. The JS entry point files consume the services and handle UI/DOM concerns. Entry point files use an IIFE + `OCA.Onlyoffice` global namespace pattern.

## PHP Backend

- `appinfo/routes.php` — URL routing
- `lib/Controller/` — request handlers for the editor page, AJAX endpoints, and settings
- `lib/Listeners/` — event listeners that inject scripts and styles into pages
- `lib/AppConfig.php` — single source of truth for all app configuration (document server URL, JWT secret, feature flags, watermarks, etc.)

## Notes

**CSS bundles are not auto-loaded.** Vite extracts CSS into `css/onlyoffice-*.css`. Each must be explicitly registered in the PHP listener alongside its script via `Util::addStyle()`.

**`appName` is injected at build time.** The Nextcloud Vite config injects `const appName = "onlyoffice"` into every bundle. Never declare it locally — it causes a redeclaration build error.

**`window.parent.OC` in `editor.js` is intentional.** The editor runs in an iframe. Accessing `window.parent.OC` reaches the parent frame's Nextcloud context, not the current window.
