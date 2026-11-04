/**
 *
 * (c) Copyright Ascensio System SIA 2026
 *
 * This program is a free software product.
 * You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
 * (AGPL) version 3 as published by the Free Software Foundation.
 * In accordance with Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

/* global _oc_appswebroots */

import {
	attachLocalSource,
	decideMode,
	fetchSourceBytes,
	isEncrypted,
	localEditorUrl,
	localSessionSettings,
	toArrayBuffer,
} from './localSession.js'

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {
	if (!OCA.Eurooffice) {
		OCA.Eurooffice = {
			AppName: 'eurooffice',
			frameSelector: null,
			setting: {},
		}
	}

	if (!OCA.Eurooffice.setting || !OCA.Eurooffice.setting.formats) {
		OCA.Eurooffice.setting = OCP.InitialState.loadState(OCA.Eurooffice.AppName, 'settings')
	}

	const settings = () => localSessionSettings(OCA.Eurooffice.setting)

	const showError = (error) => {
		OCP.Toast.error(error?.message || t(OCA.Eurooffice.AppName, 'The document could not be opened'))
	}

	const EuroofficeViewerVue = {
		name: 'EuroofficeViewerVue',
		render(createElement) {
			const self = this

			if (!this.url) {
				return createElement('div', { attrs: { id: 'euroofficeViewerFrame' } })
			}

			return createElement('iframe', {
				attrs: {
					id: 'euroofficeViewerFrame',
					scrolling: 'no',
					src: self.url,
				},
				on: {
					load() {
						self.doneLoading()
					},
				},
			})
		},
		props: {
			filename: {
				type: String,
				default: null,
			},
			fileid: {
				type: Number,
				default: null,
			},
			source: {
				type: String,
				default: null,
			},
			basename: {
				type: String,
				default: null,
			},
			mime: {
				type: String,
				default: null,
			},
		},
		data() {
			return {
				url: null,
				mode: 'server',
				detachSource: null,
			}
		},
		computed: {
			documentName() {
				return this.$attrs?.displayname
					|| this.basename
					|| (this.filename ? this.filename.split('/').pop() : '')
			},
		},
		created() {
			this.mode = decideMode({
				fileid: this.fileid,
				encrypted: isEncrypted(this.$attrs),
				mode: this.$attrs?.euroofficeMode || 'auto',
				settings: settings(),
			})

			if (this.mode === 'server') {
				this.url = OC.generateUrl('/apps/' + OCA.Eurooffice.AppName + '/{fileId}?filePath={filePath}&inframe=true&inviewer=true',
					{
						fileId: this.fileid,
						filePath: this.filename,
					})
				return
			}

			if (this.mode !== 'local' || !this.source || !this.documentName) {
				OCP.Toast.error(t(OCA.Eurooffice.AppName, 'This document cannot be opened in the browser only'))
				this.$nextTick(() => this.doneLoading())
				return
			}

			this.url = localEditorUrl(this.documentName, true)
		},
		mounted() {
			OCA.Eurooffice.frameSelector = '#euroofficeViewerFrame'

			if (this.mode !== 'local' || !this.url) {
				return
			}
			const bufferPromise = fetchSourceBytes(this.source, settings().maxSize)
			this.detachSource = attachLocalSource(this.$el, bufferPromise, this.documentName, this.mime, showError)
		},
		beforeDestroy() {
			if (this.detachSource) {
				this.detachSource()
			}
		},
	}

	/**
	 * Open a document from bytes or a URL without a Nextcloud file node.
	 *
	 * @param {object} options document and how to open it
	 * @param {ArrayBuffer|Blob|Uint8Array} [options.data] document content
	 * @param {string} [options.url] document URL, fetched with credentials
	 * @param {string} options.name document name, the extension selects the editor
	 * @param {string} [options.mime] document mime type
	 * @param {'auto'|'local'|'server'} [options.mode] how to open, defaults to 'auto'
	 * @param {HTMLElement} [options.container] mount the editor here instead of the Viewer
	 * @return {{destroy: Function}|null}
	 */
	OCA.Eurooffice.openSource = function({ data, url, name, mime, mode = 'auto', container }) {
		if (!name || (!data && !url)) {
			throw new Error('openSource needs a name and either data or url')
		}
		if (decideMode({ fileid: null, encrypted: false, mode, settings: settings() }) !== 'local') {
			OCP.Toast.error(t(OCA.Eurooffice.AppName, 'This document cannot be opened in the browser only'))
			return null
		}

		if (!container) {
			if (!OCA.Viewer?.openWith) {
				OCP.Toast.error(t(OCA.Eurooffice.AppName, 'The Viewer app is required to open this document'))
				return null
			}
			const source = url || URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }))
			OCA.Viewer.openWith(OCA.Eurooffice.AppName, {
				fileInfo: {
					source,
					filename: source,
					basename: name,
					mime,
					hasPreview: false,
					etag: '',
					euroofficeMode: 'local',
				},
			})
			return null
		}

		const frame = document.createElement('iframe')
		frame.setAttribute('id', 'euroofficeSourceFrame')
		frame.setAttribute('scrolling', 'no')
		frame.src = localEditorUrl(name, false)
		const bufferPromise = data
			? toArrayBuffer(data)
			: fetchSourceBytes(url, settings().maxSize)
		container.appendChild(frame)
		OCA.Eurooffice.frameSelector = '#euroofficeSourceFrame'
		const detach = attachLocalSource(frame, bufferPromise, name, mime, showError)

		return {
			destroy() {
				detach()
				frame.remove()
			},
		}
	}

	if (OCA.Viewer) {

		const mimes = Object.values(OCA.Eurooffice.setting.formats)
			.filter(format => format.def)
			.filter(format => {
				// Don't collide with files_pdfviewer (bundled, enabled by default).
				// Exception: if the admin has explicitly enabled EO as the default PDF
				// viewer (format.def === true), register anyway so EO takes priority.
				if (!format.def && typeof _oc_appswebroots !== 'undefined' && _oc_appswebroots.files_pdfviewer) {
					const formatMimes = [].concat(format.mime)
					if (formatMimes.includes('application/pdf')) return false
				}
				return true
			})
			.map(format => format.mime)
			.flat()
		OCA.Viewer.registerHandler({
			id: OCA.Eurooffice.AppName,
			group: null,
			mimes,
			component: EuroofficeViewerVue,
			// Documents without a file id (e.g. mail attachments) can be opened
			// from their `source` URL in a client-only session.
			supportsSource: settings().enabled,
		})
	}

})(OCA)
