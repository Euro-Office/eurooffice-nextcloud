/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_READY_METHOD, LOCAL_SOURCE_MESSAGE } from '../localSession.js'

vi.mock('@nextcloud/axios', () => ({ default: { get: vi.fn() } }))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const localConfig = () => ({
	documentType: 'word',
	documentServerUrl: 'https://ds.example/',
	document: { fileType: 'docx', title: 'a.docx', permissions: { edit: false } },
	editorConfig: { mode: 'view', session: { type: 'local' } },
})

describe('initLocalSession', () => {
	let axios
	let DocEditor
	let parent

	beforeEach(async () => {
		vi.resetModules()
		document.head.innerHTML = ''
		document.body.innerHTML = '<div id="iframeEditor" data-localsession="true" data-filename="a.docx" data-inframe="true" data-inviewer="true"></div>'
		globalThis.OCA = { Eurooffice: { AppName: 'eurooffice' } }
		globalThis.OCP.Toast.error.mockClear()
		globalThis.DocsAPI = undefined

		DocEditor = vi.fn()
		DocEditor.version = () => '9.3.8'
		DocEditor.capabilities = { localSession: true }

		parent = { postMessage: vi.fn(), OC: globalThis.OC, document: { title: '' } }
		vi.spyOn(window, 'parent', 'get').mockReturnValue(parent)

		axios = (await import('@nextcloud/axios')).default
		axios.get.mockReset()
		axios.get.mockResolvedValue({ data: localConfig() })

		await import('../editor.js')
		OCA.Eurooffice.showMessage = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	const sendSource = (buffer) => {
		window.dispatchEvent(new MessageEvent('message', {
			data: { type: LOCAL_SOURCE_MESSAGE, buffer, name: 'a.docx', mime: 'application/docx' },
			origin: window.location.origin,
			source: parent,
		}))
	}

	// Source listeners of earlier module instances may still fire, so the
	// script of the instance under test is the one appended last.
	const loadDocsApi = async () => {
		await flush()
		const scripts = document.head.querySelectorAll('script[src^="https://ds.example/web-apps/apps/api/documents/api.js"]')
		const script = scripts[scripts.length - 1]
		expect(script).toBeDefined()
		globalThis.DocsAPI = { DocEditor }
		script.onload()
	}

	it('asks the parent for the bytes and starts a local session with them', async () => {
		OCA.Eurooffice.InitEditor()

		expect(parent.postMessage).toHaveBeenCalledWith({ method: LOCAL_READY_METHOD }, window.location.origin)
		expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('config/local?fileName=a.docx&inframe=true&inviewer=true'))
		expect(DocEditor).not.toHaveBeenCalled()

		const buffer = new Uint8Array([1, 2, 3]).buffer
		sendSource(buffer)
		await loadDocsApi()

		expect(DocEditor).toHaveBeenCalledTimes(1)
		const [placeholder, config] = DocEditor.mock.calls[0]
		expect(placeholder).toBe('iframeEditor')
		expect(config.document.source).toEqual({ data: buffer })
		expect(config.editorConfig.session).toEqual({ type: 'local' })
		expect(config.events.onError).toBe(OCA.Eurooffice.onLocalSessionError)
		expect(config.events.onLocalSessionProgress).toBe(OCA.Eurooffice.onLocalSessionProgress)
		expect(config.events.onRequestHistory).toBeUndefined()
		expect(OCA.Eurooffice.showMessage).not.toHaveBeenCalled()
	})

	it('ignores bytes that do not come from the parent', async () => {
		OCA.Eurooffice.InitEditor()

		window.dispatchEvent(new MessageEvent('message', {
			data: { type: LOCAL_SOURCE_MESSAGE, buffer: new ArrayBuffer(1) },
			origin: window.location.origin,
			source: null,
		}))
		await flush()

		expect(document.head.querySelector('script')).toBeNull()
		expect(DocEditor).not.toHaveBeenCalled()
	})

	it('shows an error when the Document Server lacks local sessions', async () => {
		DocEditor.capabilities = {}
		OCA.Eurooffice.InitEditor()

		sendSource(new ArrayBuffer(1))
		await loadDocsApi()

		expect(DocEditor).not.toHaveBeenCalled()
		expect(OCA.Eurooffice.showMessage).toHaveBeenCalledWith(
			expect.stringContaining('does not support opening documents in the browser only'),
			'error',
			{ timeout: -1 },
		)
	})

	it('surfaces config errors', async () => {
		axios.get.mockRejectedValue({ response: { data: { error: 'Format is not supported' } } })
		OCA.Eurooffice.InitEditor()

		sendSource(new ArrayBuffer(1))
		await flush()

		expect(OCA.Eurooffice.showMessage).toHaveBeenCalledWith('Format is not supported', 'error', { timeout: -1 })
		expect(DocEditor).not.toHaveBeenCalled()
	})

	it('translates local session error codes', () => {
		OCA.Eurooffice.onLocalSessionError({ data: { errorCode: -101 } })
		OCA.Eurooffice.onLocalSessionError({ data: { errorCode: 1, errorDescription: 'custom' } })

		expect(OCA.Eurooffice.showMessage).toHaveBeenNthCalledWith(1, 'The document could not be converted', 'error', { timeout: -1 })
		expect(OCA.Eurooffice.showMessage).toHaveBeenNthCalledWith(2, 'custom', 'error', { timeout: -1 })
	})
})
