/*
 * Smart Picker handling, shared by both frames the editor can run in.
 *
 * The editor asks for a picker by posting onRequestSmartPicker. Where that
 * request has to be served depends on how the editor was opened:
 *
 *   in a frame  - viewer.js embeds the connector page in the Files page, so
 *                 listener.js serves it there, reaching the editor through the
 *                 iframe. The picker modal belongs in that outer page.
 *   standalone  - the connector page IS the top-level page. There is no outer
 *                 page to relay to, and posting to window.parent posts to
 *                 ourselves, which is why this used to fail silently.
 *
 * Only *how the editor is reached* differs, so that is the one thing callers
 * pass in. Everything else -- which picker to open, how to treat a cancel --
 * lives here once.
 *
 * The picker itself is Nextcloud's own (getLinkWithPicker). We deliberately do
 * not reimplement it: each provider's picker carries behaviour that is invisible
 * from the outside, and reimplementing it means rediscovering all of it.
 */

import { getLinkWithPicker, getProvider, getProviders, searchProvider } from '@nextcloud/vue/components/NcRichText'

/**
 * Whether this page has a reference registry at all.
 *
 * This, not the frame layout, is what decides whether a page can supply the
 * editor's provider list. A provider is only openable where its picker component
 * is registered, and the editor iframe is rendered with renderAs "base", so no
 * RenderReferenceEvent fires there and it has nothing to offer. Asking the page
 * what it actually has beats inferring it from window.parent.
 *
 * @return {boolean} true when this page knows of any provider
 */
export function hasProviderRegistry() {
	try {
		return getProviders().length > 0
	} catch (error) {
		return false
	}
}

/**
 * What this page knows about reference providers, for diagnosis.
 *
 * The two facts that decide the menu, and they come from different places: the
 * provider list is server-rendered initial state, while the picker components are
 * registered at runtime by each app's script. Either can be missing on its own.
 *
 * @return {object} counts and ids
 */
export function describeRegistry() {
	return {
		// eslint-disable-next-line no-underscore-dangle
		fromInitialState: (window._vue_richtext_reference_providers ?? []).map((p) => p?.id),
		// eslint-disable-next-line no-underscore-dangle
		pickerComponents: Object.keys(window._vue_richtext_custom_picker_elements ?? {}),
		openable: (() => {
			try {
				return getProviders().map((p) => p.id)
			} catch (error) {
				return 'threw: ' + error?.message
			}
		})(),
	}
}

/**
 * The providers this page can actually open, in Nextcloud's own order.
 *
 * searchProvider('') is what the Nextcloud editors' own "/" menu lists: it is
 * getProviders() -- which keeps only providers that have a search provider or a
 * picker component registered *in this page* -- sorted by recent use, plus the
 * synthetic "any link" entry. That entry exists only client-side, so asking OCS
 * for providers can never produce it.
 *
 * Must be called from the page that will open the picker. The editor iframe is
 * rendered with renderAs "base", which means no RenderReferenceEvent and so no
 * providers at all there.
 *
 * @return {Array} [{id, title, icon_url}] safe to hand to the editor
 */
export function listProviders() {
	try {
		const list = searchProvider('').map((provider) => ({
			id: provider.id,
			title: provider.title,
			// Providers give root-relative icon paths, which would resolve against
			// the document server once the editor iframe renders them.
			icon_url: provider.icon_url
				? new URL(provider.icon_url, window.location.origin).href
				: '',
		}))
		// searchProvider('') always appends the synthetic "any link" entry, so an
		// empty list here means this page has no reference registry at all -- worth
		// saying out loud, because the editor then has nothing to offer.
		if (!list.length) {
			console.warn('[EO picker] this page lists no providers at all')
		} else {
			console.debug('[EO picker] providers for the editor:', list.map((p) => p.id))
		}
		return list
	} catch (error) {
		console.error('[EO picker] could not list providers', error)
		return []
	}
}

/** Guards against a second picker while one is open. */
let busy = false

/**
 * Open the Smart Picker and give the chosen link to the editor.
 *
 * @param {object} options options
 * @param {string} options.selectedText the editor's current selection
 * @param {string} options.source what asked for it ('contextmenu' or 'toolbar')
 * @param {string} options.providerId provider to open directly, '' for the list
 * @param {object} options.target how to reach the editor and its window
 * @return {Promise<void>}
 */
export async function handleSmartPickerRequest({ selectedText, source, providerId, target }) {
	if (busy) {
		return
	}
	busy = true
	try {
		if (source === 'contextmenu') {
			await openAssistant(selectedText)
			return
		}

		if (typeof getLinkWithPicker !== 'function') {
			console.error('[EO picker] getLinkWithPicker is unavailable; @nextcloud/vue is too old')
			return
		}

		// A provider the editor offered but that cannot be resolved here means the
		// two lists disagree. getProviders() keeps only providers that have a
		// search provider or a custom picker element registered *in this page*,
		// and the editor builds its menu from OCS, which cannot see that.
		if (providerId && !getProvider(providerId)) {
			console.warn('[EO picker] provider not resolvable here:', providerId,
				'| resolvable:', getProviders().map((p) => p.id))
		}

		let link = null
		try {
			// isInsideViewer is not cosmetic: the modal has to register its content
			// with the Viewer's focus trap (it emits viewer:trapElements:changed on
			// mount), or the trap keeps pulling focus out of the modal's inputs.
			link = await getLinkWithPicker(providerId || null, target.isInsideViewer())
		} catch (error) {
			// Cancelling with X or ESC rejects, so this is the normal exit, not a fault.
			console.debug('[EO picker] closed without a link:', error?.message || error)
		}

		if (link) {
			target.insertLink(link)
		} else {
			target.cancel()
		}
	} finally {
		busy = false
	}
}

/**
 * Seed the Assistant's own form with the selection.
 *
 * @param {string} selectedText the editor's current selection
 * @return {Promise<void>}
 */
async function openAssistant(selectedText) {
	const openAssistantForm = window.OCA?.Assistant?.openAssistantForm
	if (typeof openAssistantForm !== 'function') {
		console.warn('[EO picker] the Assistant app is not loaded')
		return
	}
	try {
		await openAssistantForm({
			appId: 'eurooffice',
			taskType: 'core:text2text',
			inputs: selectedText
				? { prompt: selectedText, input: selectedText, text: selectedText }
				: {},
			closeOnResult: false,
		})
	} catch (error) {
		console.debug('[EO picker] Assistant form closed:', error?.message || error)
	}
}
