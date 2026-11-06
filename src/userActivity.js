/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'
import { loadState } from '@nextcloud/initial-state'
import { generateUrl } from '@nextcloud/router'

/**
 * Same interval as core's own session heartbeat: half the session lifetime, within one minute and one day
 *
 * @param {number|undefined} sessionLifetime seconds
 * @return {number} milliseconds
 */
function heartbeatInterval(sessionLifetime) {
	const interval = sessionLifetime ? Math.floor(sessionLifetime / 2) : 900
	return Math.min(24 * 3600, Math.max(60, interval)) * 1000
}

/**
 * Tells core's auto_logout check that the user is active: through localStorage in the other
 * windows of this origin, and through a storage event in each given window, which core documents
 * as the way for embedded editors to do this.
 *
 * @param {Window[]} windows this page's window, and the Files page around it when opened in the viewer
 */
function reportActivity(windows) {
	// Core reads newValue with JSON.parse
	const newValue = JSON.stringify(Date.now())
	let oldValue = null
	try {
		oldValue = localStorage.getItem('lastActive')
		localStorage.setItem('lastActive', newValue)
	} catch (error) {
		// The events below still reach core in the given windows; only other tabs miss it
		console.debug('Eurooffice: could not store the last activity', error)
	}
	for (const target of windows) {
		target.dispatchEvent(new StorageEvent('storage', { key: 'lastActive', oldValue, newValue }))
	}
}

/**
 * Builds the editor's onUserActivity handler. Input inside the editor happens in a cross-origin
 * frame that core's idle tracking cannot see, so without this auto_logout logs the user out
 * while they edit, and with session_keepalive off the session expires on the server.
 *
 * @param {Window} hostWindow the window whose user the editor belongs to: this one, or the Files
 *     page when the editor is opened in the viewer
 * @param {object} config core's config initial state
 * @return {Function|undefined} undefined when neither applies, so the editor is not asked to report
 */
export function createUserActivityHandler(hostWindow = window, config = loadState('core', 'config', {})) {
	const autoLogout = !!config.auto_logout
	// Same reading as core: without keepalive core sends no heartbeat of its own
	const heartbeat = !config.session_keepalive
	if (!autoLogout && !heartbeat) {
		return undefined
	}

	const interval = heartbeatInterval(config.session_lifetime)
	const windows = hostWindow === window ? [window] : [window, hostWindow]
	let lastHeartbeat = Date.now()

	return function onUserActivity() {
		if (autoLogout) {
			reportActivity(windows)
		}

		const sinceHeartbeat = Date.now() - lastHeartbeat
		// Negative after the clock steps back: the server's session clock did not, so send now
		if (heartbeat && (sinceHeartbeat >= interval || sinceHeartbeat < 0)) {
			const previous = lastHeartbeat
			const current = Date.now()
			lastHeartbeat = current
			// Core's keepalive route: refreshes the session without running an app
			axios.get(generateUrl('/heartbeat')).catch((error) => {
				console.debug('Eurooffice: session heartbeat failed, retrying on the next activity', error)
				// A request that hangs past the next interval must not undo a newer one
				if (lastHeartbeat === current) {
					lastHeartbeat = previous
				}
			})
		}
	}
}
