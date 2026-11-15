/**
 * SPDX-FileCopyrightText: 2026 Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FontManager from './FontManager.vue'

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn().mockResolvedValue({ data: { available: true, fonts: [] } }) },
}))

/** Mounts FontManager and waits for the font list to load. */
async function mountFontManager() {
	const wrapper = mount(FontManager, { attachTo: document.body })
	await flushPromises()
	return wrapper
}

describe('FontManager file input', () => {
	it('is hidden instead of moved off-screen, so it cannot take focus and scroll the page', async () => {
		const input = (await mountFontManager()).find('input[type="file"]')

		expect(input.attributes('hidden')).toBeDefined()
		expect(input.classes()).not.toContain('hidden-visually')
		expect(input.attributes('accept')).toBe('.ttf,.otf,.ttc,.woff,.woff2')
		expect(input.attributes('id')).toBeTruthy()
		expect(input.attributes('name')).toBeTruthy()
	})

	it('opens the file picker from the Add font button', async () => {
		const wrapper = await mountFontManager()
		const click = vi.spyOn(wrapper.find('input[type="file"]').element, 'click')

		const button = wrapper.findAll('button').find((b) => b.text() === 'Add font')
		await button.trigger('click')

		expect(click).toHaveBeenCalledOnce()
	})
})
