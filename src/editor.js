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

/* global DocsAPI, moment, oc_defaults */

import axios from '@nextcloud/axios'

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {

	OCA.Eurooffice = Object.assign({
		AppName: 'eurooffice',
		inframe: false,
		inviewer: false,
		fileId: null,
		shareToken: null,
		insertImageType: null,
	}, OCA.Eurooffice)

	OCA.Eurooffice.InitEditor = function() {

		const iframeEditor = document.getElementById('iframeEditor')
		if (!iframeEditor) {
			return
		}

		OCA.Eurooffice.fileId = iframeEditor.dataset.id
		OCA.Eurooffice.shareToken = iframeEditor.dataset.sharetoken
		OCA.Eurooffice.directToken = iframeEditor.dataset.directtoken
		OCA.Eurooffice.template = iframeEditor.dataset.template
		OCA.Eurooffice.inframe = !!iframeEditor.dataset.inframe
		OCA.Eurooffice.inviewer = !!iframeEditor.dataset.inviewer
		OCA.Eurooffice.filePath = iframeEditor.dataset.path
		OCA.Eurooffice.anchor = iframeEditor.getAttribute('data-anchor')
		OCA.Eurooffice.currentWindow = window
		OCA.Eurooffice.currentUser = OC.getCurrentUser()

		if (OCA.Eurooffice.inframe) {
			OCA.Eurooffice.currentWindow = window.parent
			OCA.Eurooffice.currentUser = OCA.Eurooffice.currentWindow.OC.getCurrentUser()
		}

		if (!OCA.Eurooffice.fileId && !OCA.Eurooffice.shareToken && !OCA.Eurooffice.directToken) {
			OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'FileId is empty'), 'error', { timeout: -1 })
			return
		}

		const configUrl = OCA.Eurooffice.getConfigUrl()

		axios.get(configUrl)
			.then((response) => {
				const config = response.data
				if (config) {
					OCA.Eurooffice.device = config.type
					if (OCA.Eurooffice.device === 'mobile') {
						OCA.Eurooffice.resizeEvents()
					}

					if (config.redirectUrl) {
						location.href = config.redirectUrl
						return
					}

					if (config.error != null) {
						OCA.Eurooffice.showMessage(config.error, 'error', { timeout: -1 })
						return
					}

					if (!config.documentServerUrl) {
						OCA.Eurooffice.showMessage('Nextcloud Office cannot be reached. Please contact admin', 'error', { timeout: -1 })
						return
					}

					const script = document.createElement('script')
					script.src = config.documentServerUrl + 'web-apps/apps/api/documents/api.js?shardKey=' + config.document.key
					script.setAttribute('nonce', btoa(OC.requestToken))
					script.onerror = function() {
						OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'Nextcloud Office cannot be reached. Please contact admin'), 'error', { timeout: -1 })
					}
					script.onload = function() {
						if (typeof DocsAPI === 'undefined') {
							OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'Nextcloud Office cannot be reached. Please contact admin'), 'error', { timeout: -1 })
							return
						}

						const docsVersion = DocsAPI.DocEditor.version().split('.')
						if ((docsVersion[0] < 6)
							|| (parseInt(docsVersion[0]) === 6 && parseInt(docsVersion[1]) === 0)) {
							OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'Not supported version'), 'error', { timeout: -1 })
							return
						}

						let docIsChanged = null
						let docIsChangedTimeout = null

						const setPageTitle = function(event) {
							clearTimeout(docIsChangedTimeout)

							if (docIsChanged !== event.data) {
								const titleChange = function() {
									OCA.Eurooffice.currentWindow.document.title = config.document.title + (event.data ? ' *' : '') + ' - ' + oc_defaults.title
									docIsChanged = event.data
								}

								if (event === false || event.data) {
									titleChange()
								} else {
									docIsChangedTimeout = setTimeout(titleChange, 500)
								}
							}
						}
						setPageTitle(false)

						OCA.Eurooffice.documentType = config.documentType

						config.events = {
							onDocumentStateChange: setPageTitle,
							onDocumentReady: OCA.Eurooffice.onDocumentReady,
							onMakeActionLink: OCA.Eurooffice.onMakeActionLink,
						}

						config.events.onAppReady = function() {
							if (config.editorConfig.tenant) {
								OCA.Eurooffice.docEditor.showMessage(t(OCA.Eurooffice.AppName, 'You are using public demo Nextcloud Office server. Please do not store private sensitive data.'))
							}
							// Tell the editor whether the NC Assistant app is enabled.
							// The EditorController publishes this via initial state under
							// the 'eurooffice' namespace so it works on every editor layout
							// (including the inframe 'base' layout that doesn't run the
							// Assistant app's own initial-state bootstrap).
							const assistantAvailable = !!OCP?.InitialState?.loadState?.('eurooffice', 'assistant-enabled', false)
							if (typeof OCA.Eurooffice.docEditor.setAssistantAvailable === 'function') {
								OCA.Eurooffice.docEditor.setAssistantAvailable(assistantAvailable)
							}
						}

						if ((OCA.Eurooffice.inframe && !OCA.Eurooffice.shareToken)
							|| (OCA.Eurooffice.currentUser.uid)) {
							config.events.onRequestSaveAs = OCA.Eurooffice.onRequestSaveAs
							config.events.onRequestInsertImage = OCA.Eurooffice.onRequestInsertImage
							config.events.onRequestMailMergeRecipients = OCA.Eurooffice.onRequestMailMergeRecipients
							config.events.onRequestCompareFile = OCA.Eurooffice.onRequestSelectDocument // todo: remove (for editors 7.4)
							config.events.onRequestSelectDocument = OCA.Eurooffice.onRequestSelectDocument
							config.events.onRequestSendNotify = OCA.Eurooffice.onRequestSendNotify
							config.events.onRequestReferenceData = OCA.Eurooffice.onRequestReferenceData
							config.events.onRequestOpen = OCA.Eurooffice.onRequestOpen
							config.events.onRequestReferenceSource = OCA.Eurooffice.onRequestReferenceSource
							config.events.onMetaChange = OCA.Eurooffice.onMetaChange
							config.events.onRequestRefreshFile = OCA.Eurooffice.onRequestRefreshFile
							config.events.onRequestSmartPicker = OCA.Eurooffice.onRequestSmartPicker

							if (OCA.Eurooffice.currentUser.uid) {
								config.events.onRequestUsers = OCA.Eurooffice.onRequestUsers
							}

							if (!OCA.Eurooffice.filePath) {
								OCA.Eurooffice.filePath = config._file_path
							}

							if (!OCA.Eurooffice.template) {
								config.events.onRequestHistory = OCA.Eurooffice.onRequestHistory
								config.events.onRequestHistoryData = OCA.Eurooffice.onRequestHistoryData
								config.events.onRequestRestore = OCA.Eurooffice.onRequestRestore
								config.events.onRequestHistoryClose = OCA.Eurooffice.onRequestHistoryClose
							}
						}

						if (OCA.Eurooffice.directEditor || OCA.Eurooffice.inframe) {
							config.events.onRequestClose = OCA.Eurooffice.onRequestClose
						}

						if (OCA.Eurooffice.inframe
							&& config._files_sharing && !OCA.Eurooffice.shareToken
							&& window.parent.OCA.Eurooffice.context) {
							config.events.onRequestSharingSettings = OCA.Eurooffice.onRequestSharingSettings
						}

						OCA.Eurooffice.docEditor = new DocsAPI.DocEditor('iframeEditor', config)

						if (OCA.Eurooffice.directEditor) {
							OCA.Eurooffice.directEditor.loaded()
						}

						if (!OCA.Eurooffice.directEditor
							&& config.type === 'mobile') {
							const appIframe = document.querySelector('#app > iframe')
							if (appIframe && window.getComputedStyle(appIframe).position === 'fixed') {
								appIframe.style.height = 'calc(100% - 50px)'
							}
						}

						const favicon = OC.filePath(OCA.Eurooffice.AppName, 'img', OCA.Eurooffice.documentType + '.ico')
						if (OCA.Eurooffice.inframe) {
							window.parent.postMessage({
								method: 'changeFavicon',
								param: favicon,
							},
							'*')
						} else {
							const faviconLink = document.querySelector('link[rel="icon"]')
							if (faviconLink) {
								faviconLink.setAttribute('href', favicon)
							}
						}
					}
					document.head.appendChild(script)
				}
			})
			.catch((error) => {
				OCA.Eurooffice.showMessage(error.message || t(OCA.Eurooffice.AppName, 'Failed to load configuration'), 'error', { timeout: -1 })
			})
	}

	OCA.Eurooffice.onRequestHistory = function(version) {
		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/history?fileId={fileId}',
			{
				fileId: OCA.Eurooffice.fileId || 0,
			}))
			.then((response) => {
				OCA.Eurooffice.refreshHistory(response.data, version)
			})
	}

	OCA.Eurooffice.onRequestHistoryData = function(event) {
		const version = event.data

		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/version?fileId={fileId}&version={version}',
			{
				fileId: OCA.Eurooffice.fileId || 0,
				version,
			}))
			.then((response) => {
				let data = response.data
				if (data.error) {
					data = {
						error: data.error,
						version,
					}
				}
				OCA.Eurooffice.docEditor.setHistoryData(data)
			})
	}

	OCA.Eurooffice.onRequestRestore = function(event) {
		const version = event.data.version

		axios.put(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/restore'), {
			fileId: OCA.Eurooffice.fileId || 0,
			version,
		})
			.then((response) => {
				const data = response.data
				OCA.Eurooffice.refreshHistory(data, data.at(-1).version)

				if (OCA.Eurooffice.inframe) {
					window.parent.postMessage({
						method: 'onRefreshVersionsDialog',
					},
					'*')
				}
			})
	}

	OCA.Eurooffice.onRequestHistoryClose = function() {
		location.reload(true)
	}

	OCA.Eurooffice.onDocumentReady = function() {
		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'onDocumentReady',
				param: {},
			},
			'*')
		}

		OCA.Eurooffice.resize()
		OCA.Eurooffice.setViewport()
	}

	OCA.Eurooffice.onRequestSaveAs = function(event) {
		const saveData = {
			name: event.data.title,
			url: event.data.url,
		}

		if (OCA.Eurooffice.filePath) {
			const arrayPath = OCA.Eurooffice.filePath.split('/')
			arrayPath.pop()
			arrayPath.shift()
			saveData.dir = '/' + arrayPath.join('/')
		}

		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestSaveAs',
				param: saveData,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Save as'),
				function(fileDir) {
					saveData.dir = fileDir
					OCA.Eurooffice.editorSaveAs(saveData)
				},
				false,
				'httpd/unix-directory',
				true,
				OC.dialogs.FILEPICKER_TYPE_CHOOSE,
				saveData.dir)
		}
	}

	OCA.Eurooffice.editorSaveAs = function(saveData) {
		axios.post(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/save'), saveData)
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}

				OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'File saved') + ' (' + data.name + ')')
			})
	}

	OCA.Eurooffice.onRequestInsertImage = function(event) {
		const imageMimes = [
			'image/bmp', 'image/x-bmp', 'image/x-bitmap', 'application/bmp',
			'image/gif', 'image/tiff',
			'image/jpeg', 'image/jpg', 'application/jpg', 'application/x-jpg',
			'image/png', 'image/x-png', 'application/png', 'application/x-png',
			'image/svg+xml',
		]

		if (event.data) {
			OCA.Eurooffice.insertImageType = event.data.c
		}

		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestInsertImage',
				param: imageMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Insert image'),
				OCA.Eurooffice.editorInsertImage,
				false,
				imageMimes,
				true)
		}
	}

	OCA.Eurooffice.editorInsertImage = function(filePath) {
		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}))
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}

				if (OCA.Eurooffice.insertImageType) {
					data.c = OCA.Eurooffice.insertImageType
				}

				OCA.Eurooffice.docEditor.insertImage(data)
			})
	}

	OCA.Eurooffice.onRequestSmartPicker = function(event) {
		// The web-apps Gateway delivers the user's current selection via
		// event.data.selectedText so the NC Assistant can seed its input
		// with the text the user wants to operate on.
		const selectedText = event?.data?.selectedText ?? event?.selectedText ?? ''
		const source = event?.data?.source ?? event?.source ?? 'smartpicker'
		window.parent.postMessage({
			method: 'editorRequestSmartPicker',
			param: { selectedText, source },
		}, '*')
	}

	OCA.Eurooffice.onRequestMailMergeRecipients = function() {
		const recipientMimes = [
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		]

		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestMailMergeRecipients',
				param: recipientMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Select recipients'),
				OCA.Eurooffice.editorSetRecipient,
				false,
				recipientMimes,
				true)
		}
	}

	OCA.Eurooffice.editorSetRecipient = function(filePath) {
		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}))
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}

				OCA.Eurooffice.docEditor.setMailMergeRecipients(data)
			})
	}

	OCA.Eurooffice.editorReferenceSource = function(filePath) {
		if (filePath === OCA.Eurooffice.filePath) {
			OCA.Eurooffice.showMessage(t(OCA.Eurooffice.AppName, 'The data source must not be the current document'), 'error')
			return
		}

		axios.post(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/reference'), {
			path: filePath,
		})
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}
				OCA.Eurooffice.docEditor.setReferenceSource(data)
			})
	}

	OCA.Eurooffice.onRequestClose = function() {
		if (OCA.Eurooffice.directEditor) {
			OCA.Eurooffice.directEditor.close()
			return
		}

		OCA.Eurooffice.docEditor.destroyEditor()

		window.parent.postMessage({
			method: 'editorRequestClose',
		},
		'*')
	}

	OCA.Eurooffice.onRequestSharingSettings = function() {
		window.parent.postMessage({
			method: 'editorRequestSharingSettings',
		},
		'*')
	}

	OCA.Eurooffice.onRequestSelectDocument = function(event) {
		const revisedMimes = [
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		]

		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestSelectDocument',
				param: revisedMimes,
				documentSelectionType: event.data.c,
			},
			'*')
		} else {
			let title
			switch (event.data.c) {
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
			OC.dialogs.filepicker(title,
				OCA.Eurooffice.editorSetRequested.bind({ documentSelectionType: event.data.c }),
				false,
				revisedMimes,
				true)
		}
	}

	OCA.Eurooffice.editorSetRequested = function(filePath) {
		const documentSelectionType = this.documentSelectionType
		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/url?filePath={filePath}',
			{
				filePath,
			}))
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCP.Toast.error(data.error)
					return
				}
				data.c = documentSelectionType

				OCA.Eurooffice.docEditor.setRequestedDocument(data)
			})
	}

	OCA.Eurooffice.onMakeActionLink = function(event) {
		let url = location.href
		if (event && event.data) {
			const indexAnchor = url.indexOf('#')
			if (parseInt(indexAnchor) !== -1) {
				url = url.substring(0, indexAnchor)
			}

			let data = JSON.stringify(event.data)
			data = 'anchor=' + encodeURIComponent(data)

			const inframeRegex = /inframe=([^&]*&?)/g
			if (inframeRegex.test(url)) {
				url = url.replace(inframeRegex, data)
			}

			const anchorRegex = /anchor=([^&]*)/g
			if (anchorRegex.test(url)) {
				url = url.replace(anchorRegex, data)
			} else {
				url += (url.indexOf('?') === -1) ? '?' : '&'
				url += data
			}
		}

		OCA.Eurooffice.docEditor.setActionLink(url)
	}

	OCA.Eurooffice.onRequestUsers = function(event) {
		const operationType = typeof (event.data.c) !== 'undefined' ? event.data.c : null
		switch (operationType) {
		case 'info': {
			axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/userInfo?userIds={userIds}',
				{
					userIds: JSON.stringify(event.data.id),
				}))
				.then((response) => {
					OCA.Eurooffice.docEditor.setUsers({
						c: operationType,
						users: response.data,
					})
				})
			break
		}
		default: {
			let requestString = 'apps/' + OCA.Eurooffice.AppName + '/ajax/users?fileId={fileId}&operationType=' + operationType
			if (typeof (event.data.search) !== 'undefined') {
				requestString += '&from=' + event.data.from + '&count=' + event.data.count + '&search=' + encodeURIComponent(event.data.search)
			}
			axios.get(OC.generateUrl(requestString,
				{
					fileId: OCA.Eurooffice.fileId || 0,
				}))
				.then((response) => {
					OCA.Eurooffice.docEditor.setUsers({
						c: operationType,
						users: response.data,
						// support v9.0
						total: 1 + (!event.data.count || response.data.length < event.data.count ? 0 : (event.data.from + event.data.count)),
						// since v9.0.1
						isPaginated: true,
					})
				})
		}
		}
	}

	OCA.Eurooffice.onRequestSendNotify = function(event) {
		const actionLink = event.data.actionLink
		const comment = event.data.message
		const emails = event.data.emails

		const fileId = OCA.Eurooffice.fileId

		axios.post(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/mention'), {
			fileId,
			anchor: JSON.stringify(actionLink),
			comment,
			emails,
		})
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}

				OCA.Eurooffice.showMessage(data.message)
			})
	}

	OCA.Eurooffice.onRequestReferenceData = function(event) {
		const link = event.data.link
		const referenceData = event.data.referenceData
		const path = event.data.path

		axios.post(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/reference'), {
			referenceData,
			path,
			link,
		})
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCA.Eurooffice.showMessage(data.error, 'error')
					return
				}

				OCA.Eurooffice.docEditor.setReferenceData(data)
			})
	}

	OCA.Eurooffice.onRequestOpen = function(event) {
		const filePath = event.data.path
		const fileId = event.data.referenceData.fileKey
		const windowName = event.data.windowName
		const sourceUrl = OC.generateUrl(`apps/${OCA.Eurooffice.AppName}/${fileId}?filePath=${OC.encodePath(filePath)}`)
		window.open(sourceUrl, windowName)
	}

	OCA.Eurooffice.onRequestReferenceSource = function(event) {
		const referenceSourceMimes = [
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		]
		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'editorRequestReferenceSource',
				param: referenceSourceMimes,
			},
			'*')
		} else {
			OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Select data source'),
				OCA.Eurooffice.editorReferenceSource,
				false,
				referenceSourceMimes,
				true)
		}
	}

	OCA.Eurooffice.onMetaChange = function(event) {
		if (event.data.favorite !== undefined) {
			axios.post(OC.generateUrl('apps/files/api/v1/files' + OC.encodePath(OCA.Eurooffice.filePath)), {
				tags: event.data.favorite ? [OC.TAG_FAVORITE] : [],
			})
				.then(() => {
					OCA.Eurooffice.docEditor.setFavorite(event.data.favorite)
				})
		}
	}

	OCA.Eurooffice.onRequestRefreshFile = function() {
		const configUrl = OCA.Eurooffice.getConfigUrl()
		axios.get(configUrl)
			.then((response) => {
				OCA.Eurooffice.docEditor.refreshFile(response.data)
			})
	}

	OCA.Eurooffice.showMessage = function(message, type = 'success', props = null) {
		if (OCA.Eurooffice.directEditor) {
			OCA.Eurooffice.directEditor.loaded()
		}

		if (OCA.Eurooffice.inframe) {
			window.parent.postMessage({
				method: 'onShowMessage',
				param: {
					message,
					type,
					props,
				},
			},
			'*')
			return
		}

		switch (type) {
		case 'success':
			OCP.Toast.success(message, props)
			break
		case 'error':
			OCP.Toast.error(message, props)
			break
		}
	}

	OCA.Eurooffice.refreshHistory = function(response, version) {
		let data = {}
		if (response.error) {
			data = { error: response.error }
		} else {
			let currentVersion = 0
			response.forEach((fileVersion, i) => {
				if (fileVersion.version >= currentVersion) {
					currentVersion = fileVersion.version
				}

				fileVersion.created = moment(fileVersion.created * 1000).format('L LTS')
				if (fileVersion.changes) {
					fileVersion.changes.forEach((change, j) => {
						change.created = moment(change.created + '+00:00').format('L LTS')
					})
				}
			})

			if (version) {
				currentVersion = Math.min(currentVersion, version)
			}

			data = {
				currentVersion,
				history: response,
			}
		}
		OCA.Eurooffice.docEditor.refreshHistory(data)
	}

	OCA.Eurooffice.resize = function() {
		if (OCA.Eurooffice.device !== 'mobile') {
			return
		}

		const header = document.getElementById('header')
		const headerHeight = header ? header.offsetHeight : 50
		const wrapEl = document.querySelector('#app>iframe')
		if (wrapEl) {
			wrapEl.style.height = (screen.availHeight - headerHeight) + 'px'
			window.scrollTo(0, -1)
			wrapEl.style.height = (window.top.innerHeight - headerHeight) + 'px'
		}
	}

	OCA.Eurooffice.resizeEvents = function() {
		if (window.addEventListener) {
			if (/Android/i.test(navigator.userAgent)) {
				window.addEventListener('resize', OCA.Eurooffice.resize)
			}
			if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
				window.addEventListener('orientationchange', OCA.Eurooffice.resize)
			}
		}
	}

	OCA.Eurooffice.setViewport = function() {
		document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0')
	}

	OCA.Eurooffice.getConfigUrl = function() {
		const guestName = localStorage.getItem('nick')
		let configUrl = OC.linkToOCS('apps/' + OCA.Eurooffice.AppName + '/api/v1/config', 2) + (OCA.Eurooffice.fileId || 0)

		const params = []
		if (OCA.Eurooffice.filePath) {
			params.push('filePath=' + encodeURIComponent(OCA.Eurooffice.filePath))
		}
		if (OCA.Eurooffice.shareToken) {
			params.push('shareToken=' + encodeURIComponent(OCA.Eurooffice.shareToken))
		}
		if (OCA.Eurooffice.directToken) {
			document.documentElement.classList.add('eurooffice-full-page')
			params.push('directToken=' + encodeURIComponent(OCA.Eurooffice.directToken))
		}
		if (OCA.Eurooffice.template) {
			params.push('template=true')
		}
		if (guestName && guestName !== 'null') {
			params.push('guestName=' + encodeURIComponent(guestName))
		}
		if (OCA.Eurooffice.anchor) {
			params.push('anchor=' + encodeURIComponent(OCA.Eurooffice.anchor))
		}

		if (OCA.Eurooffice.inframe || OCA.Eurooffice.directToken) {
			params.push('inframe=true')
		}

		if (OCA.Eurooffice.inviewer) {
			params.push('inviewer=true')
		}

		if (OCA.Eurooffice.Desktop) {
			params.push('desktop=true')
		}
		if (params.length) {
			configUrl += '?' + params.join('&')
		}

		return configUrl
	}

	OCA.Eurooffice.InitEditor()

})(OCA)
