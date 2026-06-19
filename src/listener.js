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

/* global OC, OCP, t */

import { getLinkWithPicker } from '@nextcloud/vue/components/NcRichText'

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {

	const getFavIconHref = () => {
		const link = document.querySelector('link[rel="icon"]')
		return link ? link.getAttribute('href') : null
	}

	OCA.Eurooffice = Object.assign({
		AppName: 'eurooffice',
		frameSelector: null,
		titleBase: window.document.title,
		favIconBase: getFavIconHref(),
	}, OCA.Eurooffice)

	OCA.Eurooffice.onRequestClose = function() {

		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame) {
			frame.remove()
		}

		OCA.Eurooffice._isDocumentReady = false
		OCA.Eurooffice._pendingInsertLinks = []

		if (OCA.Viewer && OCA.Viewer.close) {
			OCA.Viewer.close()
		}

		if (OCA.Eurooffice.CloseEditor) {
			OCA.Eurooffice.CloseEditor()
		}
	}

	OCA.Eurooffice.onRequestSaveAs = function(saveData) {

		OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Save as'),
			function(fileDir) {
				saveData.dir = fileDir
				const frame = document.querySelector(OCA.Eurooffice.frameSelector)
				if (frame && frame.contentWindow) {
					frame.contentWindow.OCA.Eurooffice.editorSaveAs(saveData)
				}
			},
			false,
			'httpd/unix-directory',
			true,
			OC.dialogs.FILEPICKER_TYPE_CHOOSE,
			saveData.dir)
	}

	OCA.Eurooffice.onRequestInsertImage = function(imageMimes) {
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame && frame.contentWindow) {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Insert image'),
				frame.contentWindow.OCA.Eurooffice.editorInsertImage,
				false,
				imageMimes,
				true)
		}
	}

	// Open the NC Assistant text-processing form seeded with the editor
	// selection. We deliberately do NOT add an "Insert into editor" action
	// button: writing the AI result back into the document strips formatting
	// and produces low-quality replacements (markup is lost on plain-text
	// paste). Until that round-trip preserves at least basic styling, the
	// feature is intentionally read-only — the user copies the result from
	// the modal manually. The modal's built-in close button dismisses it.
	OCA.Eurooffice.onSmartPickerRequest = async function(selectedText, source) {
		if (this.showSmartPicker) {
			return
		}
		this.showSmartPicker = true

		if (source === 'contextmenu') {
			const openAssistantForm = window.OCA?.Assistant?.openAssistantForm
			if (typeof openAssistantForm !== 'function') {
				console.debug('NC Assistant app is not loaded; smart picker is unavailable')
				this.showSmartPicker = false
				return
			}
			try {
				const seedInputs = selectedText
					? { prompt: selectedText, input: selectedText, text: selectedText }
					: {}
				await openAssistantForm({
					appId: OCA.Eurooffice.AppName,
					taskType: 'core:text2text',
					inputs: seedInputs,
					closeOnResult: false,
				})
			} catch (e) {
				// Smart Picker cancelled or failed
			}
		} else {
			// Toolbar button: open the Smart Picker provider selection modal
			if (typeof getLinkWithPicker !== 'function') {
				console.error('getLinkWithPicker is not available. Make sure @nextcloud/vue supports the Smart Picker.')
				this.showSmartPicker = false
				return
			}
			let linkUrl = null
			try {
				linkUrl = await getLinkWithPicker('eurooffice', false)
			} catch (err) {
				// Cancelling via X/ESC may reject; treat as "no selection".
				console.debug('Smart Picker cancelled or failed:', err)
			}
			if (linkUrl) {
				OCA.Eurooffice.onInsertLink(linkUrl)
			} else {
				// Cancelled (resolve-empty or reject both land here). The
				// docEditor lives in the editor iframe, not this parent window,
				// so reach it through the frame. Also restore window focus to
				// the iframe, which the picker modal took.
				const frame = document.querySelector(OCA.Eurooffice.frameSelector)
				const docEditor = frame?.contentWindow?.OCA?.Eurooffice?.docEditor
				if (frame?.contentWindow) {
					frame.contentWindow.focus()
				}
				if (typeof docEditor?.setSmartPickerCancel === 'function') {
					docEditor.setSmartPickerCancel()
				}
			}
		}
		this.showSmartPicker = false
	}

	OCA.Eurooffice.onRequestMailMergeRecipients = function(recipientMimes) {
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame && frame.contentWindow) {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Select recipients'),
				frame.contentWindow.OCA.Eurooffice.editorSetRecipient,
				false,
				recipientMimes,
				true)
		}
	}

	OCA.Eurooffice.onRequestSelectDocument = function(revisedMimes, documentSelectionType) {
		let title
		switch (documentSelectionType) {
		case 'combine':
			title = t(OCA.Eurooffice.AppName, 'Select file to combine')
			break
		case 'compare':
			title = t(OCA.Eurooffice.AppName, 'Select file to compare')
			break
		case 'insert-text':
			title = t(OCA.Eurooffice.AppName, 'Select file to insert text')
			break
		default:
			title = t(OCA.Eurooffice.AppName, 'Select file')
		}
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame && frame.contentWindow) {
			OC.dialogs.filepicker(title,
				frame.contentWindow.OCA.Eurooffice.editorSetRequested.bind({ documentSelectionType }),
				false,
				revisedMimes,
				true)
		}
	}

	OCA.Eurooffice.onRequestReferenceSource = function(referenceSourceMimes) {
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame && frame.contentWindow) {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Select data source'),
				frame.contentWindow.OCA.Eurooffice.editorReferenceSource,
				false,
				referenceSourceMimes,
				true)
		}
	}

	OCA.Eurooffice.onDocumentReady = function() {
		OCA.Eurooffice.setViewport()
		OCA.Eurooffice._isDocumentReady = true
		if (OCA.Eurooffice._pendingInsertLinks && OCA.Eurooffice._pendingInsertLinks.length > 0) {
			const links = OCA.Eurooffice._pendingInsertLinks
			OCA.Eurooffice._pendingInsertLinks = []
			links.forEach((link) => {
				OCA.Eurooffice._doInsertLink(link)
			})
		}
	}

	OCA.Eurooffice._pendingInsertLinks = []
	OCA.Eurooffice._isDocumentReady = false

	OCA.Eurooffice._doInsertLink = function(link) {
		if (!link) return
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame && frame.contentWindow && frame.contentWindow.OCA?.Eurooffice?.docEditor) {
			frame.contentWindow.OCA.Eurooffice.docEditor.insertLink(link)
		}
	}

	OCA.Eurooffice.onInsertLink = function(link) {
		if (OCA.Eurooffice._isDocumentReady) {
			OCA.Eurooffice._doInsertLink(link)
		} else {
			OCA.Eurooffice._pendingInsertLinks.push(link)
		}
	}

	OCA.Eurooffice.changeFavicon = function(favicon) {
		const link = document.querySelector('link[rel="icon"]')
		if (link) {
			link.setAttribute('href', favicon)
		}
	}

	OCA.Eurooffice.setViewport = function() {
		document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
	}

	OCA.Eurooffice.onShowMessage = function(messageObj) {
		switch (messageObj.type) {
		case 'success':
			OCP.Toast.success(messageObj.message, messageObj.props)
			break
		case 'error':
			OCP.Toast.error(messageObj.message, messageObj.props)
			break
		}
	}

	window.addEventListener('message', function(event) {
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (!frame
			|| frame.contentWindow !== event.source
			|| !event.data.method) {
			return
		}
		switch (event.data.method) {
		case 'editorRequestClose':
			OCA.Eurooffice.onRequestClose()
			break
		case 'editorRequestSharingSettings':
			if (OCA.Eurooffice.OpenShareDialog) {
				OCA.Eurooffice.OpenShareDialog()
			}
			break
		case 'onRefreshVersionsDialog':
			if (OCA.Eurooffice.RefreshVersionsDialog) {
				OCA.Eurooffice.RefreshVersionsDialog()
			}
			break
		case 'editorRequestSaveAs':
			OCA.Eurooffice.onRequestSaveAs(event.data.param)
			break
		case 'editorRequestInsertImage':
			OCA.Eurooffice.onRequestInsertImage(event.data.param)
			break
		case 'editorRequestSmartPicker':
			OCA.Eurooffice.onSmartPickerRequest(event.data.param?.selectedText, event.data.param?.source)
			break
		case 'editorRequestMailMergeRecipients':
			OCA.Eurooffice.onRequestMailMergeRecipients(event.data.param)
			break
		case 'editorRequestSelectDocument':
			OCA.Eurooffice.onRequestSelectDocument(event.data.param, event.data.documentSelectionType)
			break
		case 'editorRequestReferenceSource':
			OCA.Eurooffice.onRequestReferenceSource(event.data.param)
			break
		case 'onDocumentReady':
			OCA.Eurooffice.onDocumentReady(event.data.param)
			break
		case 'changeFavicon':
			OCA.Eurooffice.changeFavicon(event.data.param)
			break
		case 'onShowMessage':
			OCA.Eurooffice.onShowMessage(event.data.param)
			break
		}
	}, false)

	window.addEventListener('popstate', function(event) {
		const frame = document.querySelector(OCA.Eurooffice.frameSelector)
		if (frame) {
			OCA.Eurooffice.onRequestClose()
		}
	})

	const mutationObserver = new MutationObserver(mutationRecords => {
		if (mutationRecords[0] && mutationRecords[0].removedNodes) {
			mutationRecords[0].removedNodes.forEach((node) => {
				if (node.id && '#' + node.id === OCA.Eurooffice.frameSelector) {
					OCA.Eurooffice.changeFavicon(OCA.Eurooffice.favIconBase)
					window.document.title = OCA.Eurooffice.titleBase
					OCA.Eurooffice.frameSelector = null
				}
			  })
		}
	  })

	mutationObserver.observe(document.querySelector('body'), {
		childList: true,
		subtree: true,
		characterDataOldValue: true,
	  })

})(OCA)
