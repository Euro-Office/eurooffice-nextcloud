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

	// Message types exchanged with a local-session editor frame (see editor.js)
	const LOCAL_SOURCE_MESSAGE = 'eurooffice-local-source'
	const LOCAL_READY_METHOD = 'localSessionReady'

	/**
	 * @return {{enabled: boolean, maxSize: number, forceE2ee: boolean}}
	 */
	function localSessionSettings() {
		return OCA.Eurooffice.setting?.localSession || { enabled: false, maxSize: 0, forceE2ee: false }
	}

	/**
	 * The Viewer binds the whole fileInfo to the handler, so the E2E flag can
	 * arrive as a top-level attribute or nested in the node attributes.
	 *
	 * @param {object} attrs non-prop attributes passed by the Viewer
	 * @return {boolean}
	 */
	function isEncrypted(attrs) {
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
	 * @return {'local'|'server'|'unsupported'}
	 */
	function decideMode({ fileid, encrypted, mode }) {
		const settings = localSessionSettings()
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
	function localEditorUrl(fileName, inviewer) {
		return OC.generateUrl('/apps/' + OCA.Eurooffice.AppName + '/local?fileName={fileName}&inframe=true' + (inviewer ? '&inviewer=true' : ''), {
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
	async function fetchSourceBytes(url, maxSize) {
		const response = await fetch(url, { credentials: 'include' })
		if (!response.ok) {
			throw new Error(t(OCA.Eurooffice.AppName, 'The document could not be downloaded'))
		}
		const tooLarge = new Error(t(OCA.Eurooffice.AppName, 'The document is too large to be opened in the browser only'))
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
	async function toArrayBuffer(data) {
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
	 * @return {Function} removes the listener
	 */
	function attachLocalSource(frame, bufferPromise, name, mime) {
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
				.catch((error) => {
					OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'The document could not be opened'))
				})
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
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
			const bufferPromise = fetchSourceBytes(this.source, localSessionSettings().maxSize)
			this.detachSource = attachLocalSource(this.$el, bufferPromise, this.documentName, this.mime)
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
		if (decideMode({ fileid: null, encrypted: false, mode }) !== 'local') {
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
			: fetchSourceBytes(url, localSessionSettings().maxSize)
		container.appendChild(frame)
		OCA.Eurooffice.frameSelector = '#euroofficeSourceFrame'
		const detach = attachLocalSource(frame, bufferPromise, name, mime)

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
			supportsSource: localSessionSettings().enabled,
		})
	}

})(OCA)
