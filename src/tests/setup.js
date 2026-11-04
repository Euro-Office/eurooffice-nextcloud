/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest'

// Nextcloud globals the sources rely on. Tests override what they need.
globalThis.t = (app, text) => text
globalThis.OC = {
	generateUrl: (url, params = {}) => Object.keys(params).reduce(
		(result, key) => result.replace('{' + key + '}', encodeURIComponent(params[key])),
		'/index.php' + url,
	),
	linkToOCS: (service, version) => '/ocs/v' + version + '.php/' + service + '/',
	getCurrentUser: () => ({ uid: 'alice' }),
	requestToken: 'token',
	theme: { title: 'Nextcloud' },
	filePath: () => '/icon.ico',
}
globalThis.OCP = {
	Toast: { success: vi.fn(), error: vi.fn() },
	InitialState: { loadState: vi.fn(() => ({ formats: {}, localSession: { enabled: true, maxSize: 0, forceE2ee: true } })) },
}
globalThis.OCA = {}
