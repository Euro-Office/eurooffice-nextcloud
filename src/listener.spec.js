/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@nextcloud/vue/components/NcRichText', () => ({ getLinkWithPicker: vi.fn() }))

const selector = '#euroofficeViewerFrame'
const flushObserver = () => new Promise(resolve => setTimeout(resolve))

const addViewerWrapper = () => {
	const wrapper = document.createElement('div')
	const frame = document.createElement('iframe')
	frame.id = 'euroofficeViewerFrame'
	wrapper.appendChild(frame)
	document.body.appendChild(wrapper)
	return wrapper
}

describe('listener frame removal', () => {
	beforeAll(async () => {
		document.head.innerHTML = '<link rel="icon" href="/favicon.ico">'
		document.title = 'Files'
		globalThis.OCA = {}
		await import('./listener.js')
	})

	beforeEach(() => {
		document.body.innerHTML = ''
		document.title = 'report.docx'
		document.querySelector('link[rel="icon"]').setAttribute('href', '/word.ico')
		OCA.Eurooffice.frameSelector = selector
	})

	it('keeps the frame selector when a prerendered neighbour frame is removed', async () => {
		const previous = addViewerWrapper()
		addViewerWrapper()

		previous.remove()
		await flushObserver()

		expect(OCA.Eurooffice.frameSelector).toBe(selector)
		expect(document.title).toBe('report.docx')
		expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('/word.ico')
	})

	it('resets frame selector, title and favicon when the last frame is removed', async () => {
		const current = addViewerWrapper()

		current.remove()
		await flushObserver()

		expect(OCA.Eurooffice.frameSelector).toBeNull()
		expect(document.title).toBe('Files')
		expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('/favicon.ico')
	})
})
