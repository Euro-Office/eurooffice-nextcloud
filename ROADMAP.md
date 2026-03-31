<!--
SPDX-FileCopyrightText: 2026 Euro-Office contributors
SPDX-License-Identifier: CC0-1.0
-->

# Euro-Office Integration Roadmap

> This roadmap covers the integration of Euro-Office DocumentServer with external platforms (OpenCloud, SOGo, Open-Xchange, Zimbra) via WOPI and Docs API protocols.
>
> Full integration planning document: [.github/INTEGRATION-PLANNING.md](https://github.com/Euro-Office/DocumentServer/blob/main/.github/INTEGRATION-PLANNING.md)

## Role in Integration

This repo is the **OpenCloud/Nextcloud connector** — a PHP app that acts as a WOPI client. It is the primary integration artifact for Phase 2 (OpenCloud Integration, P1 priority).

## Roadmap Items

### Phase 2 — OpenCloud Integration (P1)

- [ ] Test `eurooffice-nextcloud` connector against OpenCloud's app API
- [ ] Fix any compatibility issues between Nextcloud and OpenCloud APIs
  - App info XML format
  - Capabilities API differences
  - Sharing hooks
- [ ] Package the connector for OpenCloud's app store
- [ ] Write OpenCloud-specific installation and configuration documentation
- [ ] Set up CI testing against OpenCloud releases

### Notes

- This connector (46 PHP files) already provides a mature Nextcloud integration
- OpenCloud is a fork of ownCloud with the same app-based extension architecture
- The existing `richdocuments` (Nextcloud Office) app pattern is the standard WOPI client architecture

---

## Cross-Repo References

| Repo | Role |
|------|------|
| [server](https://github.com/Euro-Office/server) | WOPI endpoints, discovery, proof keys, JWT, admin panel |
| [sdkjs](https://github.com/Euro-Office/sdkjs) | Docs API, editor engine, co-editing, format conversion |
| [web-apps](https://github.com/Euro-Office/web-apps) | Editor UI, toolbar, plugins, branding |
| [core](https://github.com/Euro-Office/core) | File format conversion engine (OOXML, ODF, PDF) |
| [eurooffice-nextcloud](https://github.com/Euro-Office/eurooffice-nextcloud) | OpenCloud/Nextcloud WOPI connector |
| [DocumentServer](https://github.com/Euro-Office/DocumentServer) | Integration orchestration, Docker, Helm |
| [document-server-integration](https://github.com/Euro-Office/document-server-integration) | Integration examples & API docs |
| [document-server-package](https://github.com/Euro-Office/document-server-package) | DEB/RPM/Helm packaging |
| [docker-ci](https://github.com/Euro-Office/docker-ci) | Docker images for deployment |
| [desktop-sdk](https://github.com/Euro-Office/desktop-sdk) | Desktop CEF integration |
| [desktop-apps](https://github.com/Euro-Office/desktop-apps) | Desktop packaging & Electron wrappers |

## Protocol Documentation

- [WOPI Protocol Overview — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/)
- [WOPI Overview — ONLYOFFICE API](https://api.onlyoffice.com/docs/docs-api/using-wopi/overview/)
- [WOPI REST API — ONLYOFFICE API](https://api.onlyoffice.com/docs/docs-api/using-wopi/wopi-rest-api/)
- [WOPI Discovery — ONLYOFFICE API](https://api.onlyoffice.com/docs/docs-api/using-wopi/wopi-discovery/)
- [Docs API Basic Concepts — ONLYOFFICE API](https://api.onlyoffice.com/docs/docs-api/get-started/basic-concepts/)
