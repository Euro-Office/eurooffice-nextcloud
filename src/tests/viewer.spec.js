/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_READY_METHOD, LOCAL_SOURCE_MESSAGE } from '../localSession.js'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('OCA.Eurooffice.openSource', () => {
	let registerHandler

	beforeEach(async () => {
		vi.resetModules()
		registerHandler = vi.fn()
		globalThis.OCA = {
			Viewer: { registerHandler, openWith: vi.fn() },
			Eurooffice: {
				AppName: 'eurooffice',
				setting: {
					formats: { docx: { def: true, mime: 'application/docx' } },
					localSession: { enabled: true, maxSize: 0, forceE2ee: true },
				},
			},
		}
		globalThis.OCP.Toast.error.mockClear()
		await import('../viewer.js')
	})

	it('registers the handler with source support', () => {
		expect(registerHandler).toHaveBeenCalledWith(expect.objectContaining({
			id: 'eurooffice',
			mimes: ['application/docx'],
			supportsSource: true,
		}))
	})

	it('needs a name and a document', () => {
		expect(() => OCA.Eurooffice.openSource({ name: 'a.docx' })).toThrow()
		expect(() => OCA.Eurooffice.openSource({ url: '/x' })).toThrow()
	})

	it('hands a URL to the Viewer when it is available', () => {
		const result = OCA.Eurooffice.openSource({ url: '/attachment', name: 'a.docx', mime: 'application/docx' })

		expect(result).toBeNull()
		expect(OCA.Viewer.openWith).toHaveBeenCalledWith('eurooffice', {
			fileInfo: expect.objectContaining({
				source: '/attachment',
				basename: 'a.docx',
				mime: 'application/docx',
				euroofficeMode: 'local',
			}),
		})
	})

	it('wraps bytes in an object URL for the Viewer', () => {
		vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:doc') })

		OCA.Eurooffice.openSource({ data: new Uint8Array([1]), name: 'a.docx', mime: 'application/docx' })

		expect(OCA.Viewer.openWith.mock.calls[0][1].fileInfo.source).toBe('blob:doc')
		vi.unstubAllGlobals()
	})

	it('mounts an iframe into a container and hands the bytes over once the frame is ready', async () => {
		const container = document.createElement('div')
		const buffer = new Uint8Array([1, 2]).buffer

		const handle = OCA.Eurooffice.openSource({ data: buffer, name: 'a.docx', mime: 'application/docx', container })
		const frame = container.querySelector('iframe')

		expect(OCA.Viewer.openWith).not.toHaveBeenCalled()
		expect(frame.src).toContain('/apps/eurooffice/local?fileName=a.docx&inframe=true')
		expect(frame.src).not.toContain('inviewer')

		const postMessage = vi.fn()
		Object.defineProperty(frame, 'contentWindow', { value: { postMessage } })
		window.dispatchEvent(new MessageEvent('message', {
			data: { method: LOCAL_READY_METHOD },
			origin: window.location.origin,
			source: frame.contentWindow,
		}))
		await flush()

		expect(postMessage).toHaveBeenCalledWith(
			{ type: LOCAL_SOURCE_MESSAGE, buffer, name: 'a.docx', mime: 'application/docx' },
			window.location.origin,
			[buffer],
		)

		handle.destroy()
		expect(container.querySelector('iframe')).toBeNull()
	})

	it('refuses when local sessions are disabled', () => {
		OCA.Eurooffice.setting.localSession.enabled = false

		expect(OCA.Eurooffice.openSource({ url: '/attachment', name: 'a.docx' })).toBeNull()
		expect(OCA.Viewer.openWith).not.toHaveBeenCalled()
		expect(OCP.Toast.error).toHaveBeenCalled()
	})

	it('refuses without the Viewer and without a container', () => {
		delete OCA.Viewer.openWith

		expect(OCA.Eurooffice.openSource({ url: '/attachment', name: 'a.docx' })).toBeNull()
		expect(OCP.Toast.error).toHaveBeenCalledWith('The Viewer app is required to open this document')
	})
})
