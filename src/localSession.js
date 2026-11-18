/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Pure helpers for client-only (local) editor sessions: deciding how a
 * document opens, downloading its bytes and handing them to the editor frame.
 * Kept free of Vue and of the Viewer so they can be unit tested.
 */

export const APP_NAME = 'eurooffice'

// Message types exchanged with a local-session editor frame (see editor.js)
export const LOCAL_SOURCE_MESSAGE = 'eurooffice-local-source'
export const LOCAL_READY_METHOD = 'localSessionReady'

/**
 * @param {object} setting the app settings initial state
 * @return {{enabled: boolean, maxSize: number, forceE2ee: boolean}}
 */
export function localSessionSettings(setting) {
	return setting?.localSession || { enabled: false, maxSize: 0, forceE2ee: false }
}

/**
 * The Viewer binds the whole fileInfo to the handler, so the E2E flag can
 * arrive as a top-level attribute or nested in the node attributes.
 *
 * @param {object} attrs non-prop attributes passed by the Viewer
 * @return {boolean}
 */
export function isEncrypted(attrs) {
	return attrs?.['e2ee-is-encrypted'] === 1
		|| attrs?.attributes?.['e2ee-is-encrypted'] === 1
		|| attrs?.node?.attributes?.['e2ee-is-encrypted'] === 1
}

/**
 * Decide how a document is opened.
 *
 * @param {object} options decision inputs
 * @param {number|null} options.fileid Nextcloud file id, null for documents without a node
 * @param {boolean} options.encrypted the node is end-to-end encrypted
 * @param {string} options.mode 'auto' | 'local' | 'server'
 * @param {object} options.settings local session settings, see localSessionSettings()
 * @return {'local'|'server'|'unsupported'}
 */
export function decideMode({ fileid, encrypted, mode, settings }) {
	if (mode === 'server') {
		return fileid ? 'server' : 'unsupported'
	}
	if (mode === 'local') {
		return settings.enabled ? 'local' : 'unsupported'
	}
	if (!fileid || encrypted) {
		return settings.enabled ? 'local' : 'unsupported'
	}
	return 'server'
}

/**
 * @param {string} fileName document name, the extension selects the editor
 * @param {boolean} inviewer the frame lives inside the Viewer
 * @return {string}
 */
export function localEditorUrl(fileName, inviewer) {
	return OC.generateUrl('/apps/' + APP_NAME + '/local?fileName={fileName}&inframe=true' + (inviewer ? '&inviewer=true' : ''), {
		fileName,
	})
}

/**
 * Download the document bytes in the browser. For end-to-end encrypted
 * files the E2E app's fetch interceptor decrypts the response transparently.
 *
 * @param {string} url document URL
 * @param {number} maxSize maximum size in bytes, 0 for unlimited
 * @return {Promise<ArrayBuffer>}
 */
export async function fetchSourceBytes(url, maxSize) {
	const response = await fetch(url, { credentials: 'include' })
	if (!response.ok) {
		throw new Error(t(APP_NAME, 'The document could not be downloaded'))
	}
	const tooLarge = new Error(t(APP_NAME, 'The document is too large to be opened in the browser only'))
	const length = Number(response.headers.get('content-length'))
	if (maxSize > 0 && length > maxSize) {
		throw tooLarge
	}
	const buffer = await response.arrayBuffer()
	if (maxSize > 0 && buffer.byteLength > maxSize) {
		throw tooLarge
	}
	return buffer
}

/**
 * @param {ArrayBuffer|Blob|Uint8Array} data document content
 * @return {Promise<ArrayBuffer>}
 */
export async function toArrayBuffer(data) {
	if (data instanceof ArrayBuffer) {
		return data
	}
	if (ArrayBuffer.isView(data)) {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
	}
	if (data instanceof Blob) {
		return data.arrayBuffer()
	}
	throw new Error('Unsupported document data')
}

/**
 * Hand the document bytes to a local-session editor frame once it signals
 * that it is ready. The transfer is same-origin only.
 *
 * @param {HTMLIFrameElement} frame the editor frame
 * @param {Promise<ArrayBuffer>} bufferPromise resolves to the document bytes
 * @param {string} name document name
 * @param {string} mime document mime type
 * @param {Function} onError called with the error when the bytes cannot be provided
 * @return {Function} removes the listener
 */
export function attachLocalSource(frame, bufferPromise, name, mime, onError) {
	const onMessage = function(event) {
		if (event.source !== frame.contentWindow
			|| event.origin !== window.location.origin
			|| event.data?.method !== LOCAL_READY_METHOD) {
			return
		}
		window.removeEventListener('message', onMessage)
		bufferPromise
			.then((buffer) => {
				frame.contentWindow.postMessage({
					type: LOCAL_SOURCE_MESSAGE,
					buffer,
					name,
					mime,
				}, window.location.origin, [buffer])
			})
			.catch(onError)
	}
	window.addEventListener('message', onMessage)
	return () => window.removeEventListener('message', onMessage)
}
