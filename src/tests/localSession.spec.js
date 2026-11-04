/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	LOCAL_READY_METHOD,
	LOCAL_SOURCE_MESSAGE,
	attachLocalSource,
	decideMode,
	fetchSourceBytes,
	isEncrypted,
	localEditorUrl,
	localSessionSettings,
	toArrayBuffer,
} from '../localSession.js'

const enabled = { enabled: true, maxSize: 0, forceE2ee: true }
const disabled = { enabled: false, maxSize: 0, forceE2ee: true }

describe('localSessionSettings', () => {
	it('falls back to a disabled session when the state is missing', () => {
		expect(localSessionSettings(undefined)).toEqual({ enabled: false, maxSize: 0, forceE2ee: false })
		expect(localSessionSettings({ localSession: enabled })).toBe(enabled)
	})
})

describe('isEncrypted', () => {
	it('finds the E2E flag in any of the locations the Viewer may use', () => {
		expect(isEncrypted({ 'e2ee-is-encrypted': 1 })).toBe(true)
		expect(isEncrypted({ attributes: { 'e2ee-is-encrypted': 1 } })).toBe(true)
		expect(isEncrypted({ node: { attributes: { 'e2ee-is-encrypted': 1 } } })).toBe(true)
	})

	it('treats anything else as plain', () => {
		expect(isEncrypted(undefined)).toBe(false)
		expect(isEncrypted({})).toBe(false)
		expect(isEncrypted({ 'e2ee-is-encrypted': 0 })).toBe(false)
		expect(isEncrypted({ 'e2ee-is-encrypted': '1' })).toBe(false)
	})
})

describe('decideMode', () => {
	it('opens documents without a file id locally', () => {
		expect(decideMode({ fileid: null, encrypted: false, mode: 'auto', settings: enabled })).toBe('local')
	})

	it('opens encrypted nodes locally even with a file id', () => {
		expect(decideMode({ fileid: 42, encrypted: true, mode: 'auto', settings: enabled })).toBe('local')
	})

	it('uses the server session for regular files', () => {
		expect(decideMode({ fileid: 42, encrypted: false, mode: 'auto', settings: enabled })).toBe('server')
	})

	it('honours a forced mode', () => {
		expect(decideMode({ fileid: 42, encrypted: false, mode: 'local', settings: enabled })).toBe('local')
		expect(decideMode({ fileid: 42, encrypted: true, mode: 'server', settings: enabled })).toBe('server')
		expect(decideMode({ fileid: null, encrypted: false, mode: 'server', settings: enabled })).toBe('unsupported')
	})

	it('refuses local sessions when the admin disabled them', () => {
		expect(decideMode({ fileid: null, encrypted: false, mode: 'auto', settings: disabled })).toBe('unsupported')
		expect(decideMode({ fileid: 42, encrypted: true, mode: 'auto', settings: disabled })).toBe('unsupported')
		expect(decideMode({ fileid: 42, encrypted: false, mode: 'local', settings: disabled })).toBe('unsupported')
		expect(decideMode({ fileid: 42, encrypted: false, mode: 'auto', settings: disabled })).toBe('server')
	})
})

describe('localEditorUrl', () => {
	it('encodes the name and marks the viewer frame', () => {
		expect(localEditorUrl('Q3 report.docx', true))
			.toBe('/index.php/apps/eurooffice/local?fileName=Q3%20report.docx&inframe=true&inviewer=true')
		expect(localEditorUrl('a.xlsx', false))
			.toBe('/index.php/apps/eurooffice/local?fileName=a.xlsx&inframe=true')
	})
})

describe('fetchSourceBytes', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	const mockResponse = (bytes, { ok = true, contentLength = null } = {}) => ({
		ok,
		headers: { get: (name) => (name === 'content-length' ? contentLength : null) },
		arrayBuffer: async () => new Uint8Array(bytes).buffer,
	})

	it('downloads with credentials and returns the bytes', async () => {
		const fetch = vi.fn(async () => mockResponse([1, 2, 3]))
		vi.stubGlobal('fetch', fetch)

		const buffer = await fetchSourceBytes('/download', 0)

		expect(fetch).toHaveBeenCalledWith('/download', { credentials: 'include' })
		expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]))
	})

	it('rejects a failed download', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => mockResponse([], { ok: false })))

		await expect(fetchSourceBytes('/download', 0)).rejects.toThrow('The document could not be downloaded')
	})

	it('rejects bytes above the limit from the content length header', async () => {
		const response = mockResponse([1, 2, 3], { contentLength: '3' })
		const arrayBuffer = vi.spyOn(response, 'arrayBuffer')
		vi.stubGlobal('fetch', vi.fn(async () => response))

		await expect(fetchSourceBytes('/download', 2)).rejects.toThrow('The document is too large to be opened in the browser only')
		expect(arrayBuffer).not.toHaveBeenCalled()
	})

	it('rejects bytes above the limit when the header is missing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => mockResponse([1, 2, 3])))

		await expect(fetchSourceBytes('/download', 2)).rejects.toThrow('The document is too large to be opened in the browser only')
		await expect(fetchSourceBytes('/download', 3)).resolves.toBeInstanceOf(ArrayBuffer)
	})
})

describe('toArrayBuffer', () => {
	it('accepts buffers, views and blobs', async () => {
		const buffer = new Uint8Array([7, 8, 9]).buffer
		expect(await toArrayBuffer(buffer)).toBe(buffer)
		expect(new Uint8Array(await toArrayBuffer(new Uint8Array(buffer, 1, 2)))).toEqual(new Uint8Array([8, 9]))
		expect(new Uint8Array(await toArrayBuffer(new Blob([new Uint8Array([4, 5])])))).toEqual(new Uint8Array([4, 5]))
		await expect(toArrayBuffer('text')).rejects.toThrow('Unsupported document data')
	})
})

describe('attachLocalSource', () => {
	const makeFrame = () => ({ contentWindow: { postMessage: vi.fn() } })

	const ready = (frame, overrides = {}) => new MessageEvent('message', {
		data: { method: LOCAL_READY_METHOD },
		origin: window.location.origin,
		source: frame.contentWindow,
		...overrides,
	})

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

	it('posts the buffer once with the transfer list after the frame is ready', async () => {
		const frame = makeFrame()
		const buffer = new Uint8Array([1]).buffer
		attachLocalSource(frame, Promise.resolve(buffer), 'a.docx', 'application/docx', vi.fn())
		await flush()

		expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()

		window.dispatchEvent(ready(frame))
		window.dispatchEvent(ready(frame))
		await flush()

		expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(1)
		expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(
			{ type: LOCAL_SOURCE_MESSAGE, buffer, name: 'a.docx', mime: 'application/docx' },
			window.location.origin,
			[buffer],
		)
	})

	it('ignores messages from other windows, origins or methods', async () => {
		const frame = makeFrame()
		attachLocalSource(frame, Promise.resolve(new ArrayBuffer(1)), 'a.docx', null, vi.fn())

		window.dispatchEvent(ready(frame, { source: null }))
		window.dispatchEvent(ready(frame, { origin: 'https://evil.example' }))
		window.dispatchEvent(ready(frame, { data: { method: 'other' } }))
		await flush()

		expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
	})

	it('reports a failed download instead of posting', async () => {
		const frame = makeFrame()
		const onError = vi.fn()
		const error = new Error('nope')
		attachLocalSource(frame, Promise.reject(error), 'a.docx', null, onError)

		window.dispatchEvent(ready(frame))
		await flush()

		expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
		expect(onError).toHaveBeenCalledWith(error)
	})

	it('stops listening when detached', async () => {
		const frame = makeFrame()
		const detach = attachLocalSource(frame, Promise.resolve(new ArrayBuffer(1)), 'a.docx', null, vi.fn())

		detach()
		window.dispatchEvent(ready(frame))
		await flush()

		expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
	})
})
