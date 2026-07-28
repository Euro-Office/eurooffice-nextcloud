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

/* eslint-disable import/no-unresolved */

/* global _oc_appswebroots */

import {
	File,
	registerFileAction,
	Permission,
	DefaultType,
	addNewFileMenuEntry,
	getSidebar,
} from '@nextcloud/files'
import {
	getClient as davGetClient,
	getRootPath as davGetRootPath,
	getDefaultPropfind as davGetDefaultPropfind,
	resultToNode as davResultToNode,
} from '@nextcloud/files/dav'
import { emit } from '@nextcloud/event-bus'
import { generateUrl } from '@nextcloud/router'
import { getCurrentUser } from '@nextcloud/auth'
import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { defineAsyncComponent } from 'vue'
import axios from '@nextcloud/axios'
import AppDarkSvg from '../img/app-dark.svg?raw'
import NewDocxSvg from '../img/new-docx.svg?raw'
import NewXlsxSvg from '../img/new-xlsx.svg?raw'
import NewPptxSvg from '../img/new-pptx.svg?raw'
import NewPdfSvg from '../img/new-pdf.svg?raw'
import { isPublicShare, getSharingToken } from '@nextcloud/sharing/public'
import { loadState } from '@nextcloud/initial-state'

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {

	OCA.Eurooffice = Object.assign({
		AppName: 'eurooffice',
		context: null,
		frameSelector: null,
	}, OCA.Eurooffice)

	OCA.Eurooffice.setting = OCP.InitialState.loadState(OCA.Eurooffice.AppName, 'settings')
	OCA.Eurooffice.mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini|Macintosh/i.test(navigator.userAgent)
							&& navigator.maxTouchPoints && navigator.maxTouchPoints > 1

	OCA.Eurooffice.CreateFile = function(name, fileList, templateId, targetId, open = true) {
		const dir = fileList.getCurrentDirectory()

		OCA.Eurooffice.CreateFileProcess(name, dir, templateId, targetId, open, (response) => {
			fileList.add(response, { animate: true })
		})
	}

	OCA.Eurooffice.CreateFileOverload = function(name, context, templateId, targetId, open = true, filesContext = null) {
		if (!context.view) {
			context.view = OCP.Files.Router._router.app.currentView
		}

		OCA.Eurooffice.CreateFileProcess(name, context.dir, templateId, targetId, open, async (response) => {
			if (!context.view && filesContext !== null) {
				const file = new File({
					source: filesContext.source + '/' + response.name,
					id: response.id,
					mtime: new Date(),
					mime: response.mimetype,
					name: response.name,
					owner: getCurrentUser()?.uid || null,
					permissions: Permission.ALL,
					type: 'file',
					root: filesContext?.root || '/files/' + getCurrentUser()?.uid,
				})
				emit('files:node:created', file)
			} else {
				const viewContents = await context.view.getContents(context.dir)
				if (viewContents.folder && (viewContents.folder.fileid === response.parentId)) {
					const newFile = viewContents.contents.find(node => node.fileid === response.id)
					if (newFile) emit('files:node:created', newFile)
				}
			}
		})
	}

	OCA.Eurooffice.CreateFileProcess = function(name, dir, templateId, targetId, open, callback) {
		let winEditor = null
		if (((!OCA.Eurooffice.setting.sameTab && !OCA.Eurooffice.setting.enableSharing) || OCA.Eurooffice.mobile || OCA.Eurooffice.Desktop) && open) {
			const loaderUrl = OCA.Eurooffice.Desktop ? '' : OC.filePath(OCA.Eurooffice.AppName, 'templates', 'loader.html')
			winEditor = window.open(loaderUrl)
		}

		const createData = {
			name,
			dir,
		}

		if (templateId) {
			createData.templateId = templateId
		}

		if (targetId) {
			createData.targetId = targetId
		}

		if (isPublicShare()) {
			createData.shareToken = encodeURIComponent(getSharingToken())
		}

		axios.post(generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/new'), createData)
			.then((response) => {
				const data = response.data
				if (data.error) {
					if (winEditor) {
						winEditor.close()
					}
					OCP.Toast.error(data.error)
					return
				}

				callback(data)

				if (open) {
					const fileName = data.name
					OCA.Eurooffice.OpenEditor(data.id, dir, fileName, winEditor)

					OCA.Eurooffice.context = {
						fileName: data.name,
						dir,
					}
				}

				OCP.Toast.success(t(OCA.Eurooffice.AppName, 'File created'))
			})
			.catch((error) => {
				if (winEditor) {
					winEditor.close()
				}
				OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to create file'))
			})
	}

	OCA.Eurooffice.OpenEditor = function(fileId, fileDir, fileName, winEditor, isDefault = true) {
		let filePath = ''
		if (fileName) {
			filePath = fileDir.replace(/\/$/, '') + '/' + fileName
		}
		let url = generateUrl('/apps/' + OCA.Eurooffice.AppName + '/{fileId}?filePath={filePath}',
			{
				fileId,
				filePath,
			})

		if (isPublicShare()) {
			url = generateUrl('apps/' + OCA.Eurooffice.AppName + '/s/{shareToken}?fileId={fileId}',
				{
					shareToken: encodeURIComponent(getSharingToken()),
					fileId,
				})
		}

		if (winEditor && winEditor.location) {
			OCA.Eurooffice.SetDefaultUrl()
			winEditor.location.href = url
		} else if ((!OCA.Eurooffice.setting.sameTab && !OCA.Eurooffice.setting.enableSharing)
			|| OCA.Eurooffice.mobile || OCA.Eurooffice.Desktop || (isPublicShare() && !OCA.Eurooffice.isViewIsFile()
			&& !OCA.Eurooffice.setting.sameTab && OCA.Eurooffice.setting.enableSharing)
			|| (!OCA.Eurooffice.setting.sameTab && !isDefault)) {
			OCA.Eurooffice.SetDefaultUrl()
			winEditor = window.open(url, '_blank')
		} else {
			if (OCA.Eurooffice.setting.enableSharing
				&& !isPublicShare()
				&& (window.OCP?.Files?.Router?.query?.openfile === undefined || window.OCP?.Files?.Router?.query?.openfile === 'false'
					|| window.OCP?.Files?.Router?.query?.enableSharing === undefined
				)) {
				window.OCP?.Files?.Router?.goToRoute(
					null, // use default route
					{ view: 'files', fileid: fileId },
					{ ...OCP.Files.Router.query, openfile: 'true', enableSharing: 'true' },
				)
				url = window.location.href
				OCA.Eurooffice.SetDefaultUrl()
				window.open(url, '_blank')
				return
			}
			OCA.Eurooffice.frameSelector = '#euroofficeFrame'
			const iframeContainer = document.createElement('div')
			iframeContainer.className = 'eurooffice-iframe-container'
			const iframe = document.createElement('iframe')
			iframe.id = 'euroofficeFrame'
			iframe.setAttribute('nonce', btoa(OC.requestToken))
			iframe.setAttribute('scrolling', 'no')
			iframe.setAttribute('allowfullscreen', '')
			iframe.src = url + '&inframe=true&parentOrigin=' + encodeURIComponent(window.location.origin)
			iframeContainer.appendChild(iframe)

			const frameContainer = document.getElementById('app-content') || document.getElementById('app-content-vue')
			if (frameContainer) {
				frameContainer.appendChild(iframeContainer)
			}

			document.body.classList.add('eurooffice-inline')

			getSidebar()?.close()

			const appContentElement = document.getElementById('app-content')
			const scrollTop = appContentElement ? appContentElement.scrollTop : 0
			const frameElement = document.querySelector(OCA.Eurooffice.frameSelector)
			if (frameElement) {
				frameElement.style.top = scrollTop + 'px'
			}

			const currentQuery = { ...OCP.Files.Router.query }
			if (isDefault) {
				currentQuery.openfile = 'true'
			} else {
				delete currentQuery.openfile
			}

			window.OCP?.Files?.Router?.goToRoute(
				null, // use default route
				{ view: 'files', fileid: fileId },
				currentQuery,
			)
		}
	}

	OCA.Eurooffice.CloseEditor = function() {
		document.body.classList.remove('eurooffice-inline')

		const iframeContainer = document.querySelector('.eurooffice-iframe-container')
		if (iframeContainer !== null) {
			iframeContainer.remove()
		}

		OCA.Eurooffice.context = null

		OCA.Eurooffice.SetDefaultUrl()
	}

	OCA.Eurooffice.SetDefaultUrl = function() {
		// eslint-disable-next-line no-unused-vars
		const { openfile, enableSharing, ...query } = OCP.Files.Router.query
		window.OCP?.Files?.Router?.goToRoute(
			null, // use default route
			{ view: 'files', fileid: undefined },
			query,
		)
	}

	OCA.Eurooffice.OpenShareDialog = function() {
		if (OCA.Eurooffice.context) {
			const sidebar = getSidebar()
			if (!sidebar.isOpen) {
				davGetClient().stat(davGetRootPath() + OCA.Eurooffice.context.dir + '/' + OCA.Eurooffice.context.fileName, {
					details: true,
					data: davGetDefaultPropfind(),
				}).then((result) => {
					const node = davResultToNode(result.data)
					emit('files:node:updated', node)
					sidebar.open(node)
					sidebar.setActiveTab('sharing')
				})
			} else {
				sidebar.close()
			}
		}
	}

	OCA.Eurooffice.RefreshVersionsDialog = function() {
		if (OCA.Eurooffice.context) {
			const sidebar = getSidebar()
			if (sidebar.isOpen) {
				sidebar.close()
				davGetClient().stat(davGetRootPath() + OCA.Eurooffice.context.dir + '/' + OCA.Eurooffice.context.fileName, {
					details: true,
					data: davGetDefaultPropfind(),
				}).then((result) => {
					const node = davResultToNode(result.data)
					emit('files:node:updated', node)
					sidebar.open(node)
					sidebar.setActiveTab('versionsTabView')
				})
			}
		}
	}

	OCA.Eurooffice.FileClick = function(fileName, context) {
		const fileInfoModel = context.fileInfoModel || context.fileList.getModelForFile(fileName)
		const fileId = context.fileId || (context.$file && context.$file[0].dataset.id) || fileInfoModel.id
		const winEditor = !fileInfoModel && !OCA.Eurooffice.setting.sameTab ? document : null

		OCA.Eurooffice.OpenEditor(fileId, context.dir, fileName, winEditor)

		OCA.Eurooffice.context = context
		OCA.Eurooffice.context.fileName = fileName
	}

	OCA.Eurooffice.FileClickExec = async function({ nodes, view, isDefault = true }) {
		const file = nodes[0]

		if (OCA.Eurooffice.context !== null
			&& document.querySelector('.eurooffice-iframe-container')
			&& !OCA.Eurooffice.Desktop) {
			return null
		}

		OCA.Eurooffice.OpenEditor(file.fileid, file.dirname, file.basename, 0, isDefault)

		OCA.Eurooffice.context = {
			fileName: file.basename,
			dir: file.dirname,
		}

		return null
	}

	OCA.Eurooffice.FileConvertClick = function(fileName, context) {
		const fileInfoModel = context.fileInfoModel || context.fileList.getModelForFile(fileName)
		const fileList = context.fileList
		const fileId = context.$file ? context.$file[0].dataset.id : fileInfoModel.id

		OCA.Eurooffice.FileConvert(fileId, (response) => {
			if (response.parentId === fileList.dirInfo.id) {
				fileList.add(response, { animate: true })
			}
		})
	}

	OCA.Eurooffice.FileConvertClickExec = async function({ nodes, view }) {
		const file = nodes[0]

		OCA.Eurooffice.FileConvert(file.fileid, async (response) => {
			const viewContents = await view.getContents(file.dirname)

			if (viewContents.folder && (viewContents.folder.fileid === response.parentId)) {
				const newFile = viewContents.contents.find(node => node.fileid === response.id)
				if (newFile) emit('files:node:created', newFile)
			}
		})

		return null
	}

	OCA.Eurooffice.FileConvert = function(fileId, callback) {
		const convertData = {
			fileId,
		}

		if (isPublicShare()) {
			convertData.shareToken = encodeURIComponent(getSharingToken())
		}

		axios.post(generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/convert'), convertData)
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCP.Toast.error(data.error)
					return
				}

				callback(data)

				OCP.Toast.success(t(OCA.Eurooffice.AppName, 'File has been converted. Its content might look different.'))
			})
			.catch((error) => {
				OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to convert file'))
			})
	}

	OCA.Eurooffice.DownloadClick = function(fileName, context) {
		const fileId = context.fileInfoModel.id

		OCA.Eurooffice.Download(fileName, fileId)
	}

	OCA.Eurooffice.DownloadClickExec = async function({ nodes }) {
		const file = nodes[0]

		OCA.Eurooffice.Download(file.basename, file.fileid)

		return null
	}

	OCA.Eurooffice.Download = function(fileName, fileId) {
		const extension = OCA.Eurooffice.getFileExtension(fileName)
		const saveasOptions = OCA.Eurooffice.setting.formats[extension]?.saveas || []

		spawnDialog(
			defineAsyncComponent(() => import('./views/DownloadAsDialog.vue')),
			{
				fileName,
				fileId,
				extension,
				saveasOptions,
			},
		)
	}

	OCA.Eurooffice.OpenFormPicker = function(name, filelist, filesContext = null) {
		const filterMimes = [
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		]

		const buttons = [
			{
				text: t(OCA.Eurooffice.AppName, 'Blank'),
				type: 'blank',
			},
			{
				text: t(OCA.Eurooffice.AppName, 'From text document'),
				type: 'target',
				defaultButton: true,
			},
		]

		OC.dialogs.filepicker(t(OCA.Eurooffice.AppName, 'Create new PDF form'),
			async function(filePath, type) {
				let dialogFileList = OC.dialogs.filelist
				let targetId = 0

				const targetFileName = OC.basename(filePath)
				const targetFolderPath = OC.dirname(filePath)

				if (!dialogFileList) {
					const results = await davGetClient().getDirectoryContents(davGetRootPath() + targetFolderPath, {
						details: true,
						data: davGetDefaultPropfind(),
					})
					dialogFileList = results.data.map((result) => davResultToNode(result))
				}

				if (type === 'target') {
					dialogFileList.forEach(item => {
						const itemName = item.name ? item.name : item.basename
						if (itemName === targetFileName) {
							targetId = item.id ? item.id : item.fileid
						}
					})
				}
				if (filelist.getCurrentDirectory) {
					OCA.Eurooffice.CreateFile(name, filelist, 0, targetId)
				} else {
					OCA.Eurooffice.CreateFileOverload(name, filelist, 0, targetId, true, filesContext)
				}
			},
			false,
			filterMimes,
			true,
			OC.dialogs.FILEPICKER_TYPE_CUSTOM,
			filelist.getCurrentDirectory ? filelist.getCurrentDirectory() : filelist.dir,
			{
				buttons,
			})
	}

	OCA.Eurooffice.CreateFormClick = function(fileName, context) {
		const fileList = context.fileList
		const name = fileName.replace(/\.[^.]+$/, '.pdf')
		const targetId = context.fileInfoModel.id

		OCA.Eurooffice.CreateFile(name, fileList, 0, targetId, false)
	}

	OCA.Eurooffice.CreateFormClickExec = async function({ nodes, view }) {
		const file = nodes[0]
		const name = file.basename.replace(/\.[^.]+$/, '.pdf')
		const context = {
			dir: file.dirname,
			view,
		}

		OCA.Eurooffice.CreateFileOverload(name, context, 0, file.fileid, false)

		return null
	}

	OCA.Eurooffice.registerAction = function() {
		const formats = OCA.Eurooffice.setting.formats

		const getConfig = function(file) {
			const fileExt = file?.extension?.toLowerCase()?.replace('.', '')
			const config = formats[fileExt]

			return config
		}

		const isDownloadDisabledByShareAttributes = function(file) {
			let shareAttributes
			try {
				shareAttributes = JSON.parse(file.attributes['share-attributes'] || '[]')
			} catch {
				return false
			}

			if (!Array.isArray(shareAttributes)) {
				return false
			}

			const downloadAttribute = shareAttributes.find((attribute) => attribute.scope === 'permissions' && attribute.key === 'download')

			return downloadAttribute !== undefined && downloadAttribute.value !== true
		}

		if (OCA.Files && OCA.Files.fileActions) {
			Object.entries(formats).forEach(([ext, config]) => {
				if (!config.mime) {
					return
				}

				const mimeTypes = config.mime
				mimeTypes.forEach((mime) => {
					OCA.Files.fileActions.registerAction({
						name: 'euroofficeOpen',
						displayName: t(OCA.Eurooffice.AppName, 'Open in Nextcloud Office'),
						mime,
						permissions: OC.PERMISSION_READ,
						iconClass: 'icon-eurooffice-open',
						actionHandler: OCA.Eurooffice.FileClick,
					})

					if (config.def) {
						OCA.Files.fileActions.setDefault(mime, 'euroofficeOpen')
					}

					if (config.conv) {
						OCA.Files.fileActions.registerAction({
							name: 'euroofficeConvert',
							displayName: t(OCA.Eurooffice.AppName, 'Convert with Nextcloud Office'),
							mime,
							permissions: (isPublicShare() ? OC.PERMISSION_UPDATE : OC.PERMISSION_READ),
							iconClass: 'icon-eurooffice-convert',
							actionHandler: OCA.Eurooffice.FileConvertClick,
						})
					}

					if (config.createForm) {
						OCA.Files.fileActions.registerAction({
							name: 'euroofficeCreateForm',
							displayName: t(OCA.Eurooffice.AppName, 'Create form'),
							mime,
							permissions: (isPublicShare() ? OC.PERMISSION_UPDATE : OC.PERMISSION_READ),
							iconClass: 'icon-eurooffice-create',
							actionHandler: OCA.Eurooffice.CreateFormClick,
						})
					}

					if (config.saveas && !isPublicShare() && !OCA.Eurooffice.setting.disableDownload) {
						OCA.Files.fileActions.registerAction({
							name: 'euroofficeDownload',
							displayName: t(OCA.Eurooffice.AppName, 'Download as'),
							mime,
							permissions: OC.PERMISSION_READ,
							iconClass: 'icon-eurooffice-download',
							actionHandler: OCA.Eurooffice.DownloadClick,
						})
					}
				})
			})
		} else {
			registerFileAction({
				id: 'eurooffice-open-def',
				displayName: () => t(OCA.Eurooffice.AppName, 'Open in Nextcloud Office'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes: files }) => {
					const config = getConfig(files[0])

					if (!config) return false
					if (!config.def) return false

					if (Permission.READ !== (files[0].permissions & Permission.READ)) { return false }

					return true
				},
				exec: OCA.Eurooffice.FileClickExec,
				default: DefaultType.HIDDEN,
				order: -1,
			})

			registerFileAction({
				id: 'eurooffice-open',
				displayName: () => t(OCA.Eurooffice.AppName, 'Open in Nextcloud Office'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes: files }) => {
					const config = getConfig(files[0])

					if (!config) return false
					if (config.def) return false

					if (Permission.READ !== (files[0].permissions & Permission.READ)) { return false }

					return true
				},
				exec({ nodes, view }) {
					OCA.Eurooffice.FileClickExec({ nodes, view, isDefault: false })
				},
			})

			registerFileAction({
				id: 'eurooffice-convert',
				displayName: () => t(OCA.Eurooffice.AppName, 'Convert with Nextcloud Office'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes: files }) => {
					const config = getConfig(files[0])

					if (!config) return false
					if (!config.conv) return false

					const required = isPublicShare() ? Permission.UPDATE : Permission.READ
					if (required !== (files[0].permissions & required)) { return false }

					if (files[0].attributes['mount-type'] === 'shared') {
						if (required !== (files[0].attributes['share-permissions'] & required)) { return false }

						if (isDownloadDisabledByShareAttributes(files[0])) { return false }
					}

					return true
				},
				exec: OCA.Eurooffice.FileConvertClickExec,
			})

			registerFileAction({
				id: 'eurooffice-create-form',
				displayName: () => t(OCA.Eurooffice.AppName, 'Create form'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes: files }) => {
					const config = getConfig(files[0])

					if (!config) return false
					if (!config.createForm) return false

					const required = isPublicShare() ? Permission.UPDATE : Permission.READ
					if (required !== (files[0].permissions & required)) { return false }

					if (files[0].attributes['mount-type'] === 'shared') {
						if (required !== (files[0].attributes['share-permissions'] & required)) { return false }

						if (isDownloadDisabledByShareAttributes(files[0])) { return false }
					}

					return true
				},
				exec: OCA.Eurooffice.CreateFormClickExec,
			})

			if (!isPublicShare()) {
				registerFileAction({
					id: 'eurooffice-download-as',
					displayName: () => t(OCA.Eurooffice.AppName, 'Download as'),
					iconSvgInline: () => AppDarkSvg,
					enabled: ({ nodes: files }) => {
						if (OCA.Eurooffice.setting.disableDownload) {
							return false
						}
						const config = getConfig(files[0])

						if (!config) return false
						if (!config.saveas) return false

						if (Permission.READ !== (files[0].permissions & Permission.READ)) { return false }

						if (files[0].attributes['mount-type'] === 'shared') {
							if (isDownloadDisabledByShareAttributes(files[0])) { return false }
						}

						return true
					},
					exec: OCA.Eurooffice.DownloadClickExec,
				})
			}
		}
	}

	OCA.Eurooffice.registerNewFileMenu = function() {

		if (isPublicShare() && !OCA.Eurooffice.isViewIsFile()) {
			if (OCA.Eurooffice.GetTemplates) {
				OCA.Eurooffice.GetTemplates()
			}
			// Document
			addNewFileMenuEntry({
				id: 'new-eurooffice-docx',
				displayName: t(OCA.Eurooffice.AppName, 'New document'),
				enabled: (folder) => {
					return (folder.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewDocxSvg,
				order: 21,
				handler: (context) => {
					const name = t(OCA.Eurooffice.AppName, 'New document')
					if (!isPublicShare() && OCA.Eurooffice.TemplateExist('document')) {
						OCA.Eurooffice.OpenTemplatePicker(name, '.docx', 'document')
					} else {
						const dirContext = { dir: context.path }
						OCA.Eurooffice.CreateFileOverload(name + '.docx', dirContext, null, null, true, context)
					}
				},
			})

			// Spreadsheet
			addNewFileMenuEntry({
				id: 'new-eurooffice-xlsx',
				displayName: t(OCA.Eurooffice.AppName, 'New spreadsheet'),
				enabled: (folder) => {
					return (folder.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewXlsxSvg,
				order: 22,
				handler: (context) => {
					const name = t(OCA.Eurooffice.AppName, 'New spreadsheet')
					if (!isPublicShare() && OCA.Eurooffice.TemplateExist('spreadsheet')) {
						OCA.Eurooffice.OpenTemplatePicker(name, '.xlsx', 'spreadsheet')
					} else {
						const dirContext = { dir: context.path }
						OCA.Eurooffice.CreateFileOverload(name + '.xlsx', dirContext, null, null, true, context)
					}
				},
			})

			// Presentation
			addNewFileMenuEntry({
				id: 'new-eurooffice-pptx',
				displayName: t(OCA.Eurooffice.AppName, 'New presentation'),
				enabled: (context) => {
					return (context.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewPptxSvg,
				order: 23,
				handler: (context) => {
					const name = t(OCA.Eurooffice.AppName, 'New presentation')
					if (!isPublicShare() && OCA.Eurooffice.TemplateExist('presentation')) {
						OCA.Eurooffice.OpenTemplatePicker(name, '.pptx', 'presentation')
					} else {
						const dirContext = { dir: context.path }
						OCA.Eurooffice.CreateFileOverload(name + '.pptx', dirContext, null, null, true, context)
					}
				},
			})
		}

		// PDF Form
		addNewFileMenuEntry({
			id: 'new-eurooffice-pdf',
			displayName: t(OCA.Eurooffice.AppName, 'New PDF form'),
			enabled: folder => {
				return (folder.permissions & Permission.CREATE) !== 0
			},
			iconSvgInline: NewPdfSvg,
			order: 24,
			handler: context => {
				const name = t(OCA.Eurooffice.AppName, 'New PDF form')
				const dirContext = { dir: context.path }
				OCA.Eurooffice.OpenFormPicker(name + '.pdf', dirContext, context)
			},
		})

		if (!isPublicShare() && OCA.Eurooffice.GetTemplates) {
			OCA.Eurooffice.GetTemplates()
		}
	}

	OCA.Eurooffice.getFileExtension = function(fileName) {
		const extension = fileName.substr(fileName.lastIndexOf('.') + 1).toLowerCase()
		return extension
	}

	OCA.Eurooffice.isViewIsFile = function() {
		const mimetype = document.getElementById('mimetype')?.value
		if (mimetype !== undefined) {
			return mimetype !== 'httpd/unix-directory'
		}

		try {
			return loadState('files_sharing', 'view') === 'public-file-share'
		} catch {
			return false
		}
	}

	const initPage = function() {
		if (isPublicShare() && OCA.Eurooffice.isViewIsFile()) {
			// file by shared link
			let fileName = ''
			const fileNameDomElement = document.getElementById('filename')
			if (fileNameDomElement !== null && fileNameDomElement.value) {
				fileName = fileNameDomElement.value
			} else {
				try {
					fileName = loadState('files_sharing', 'filename')
				} catch {
					return
				}
			}

			const extension = OCA.Eurooffice.getFileExtension(fileName)
			const formats = OCA.Eurooffice.setting.formats

			const config = formats[extension]
			if (!config) {
				return
			}

			registerFileAction({
				id: 'eurooffice-public-open',
				displayName: () => t(OCA.Eurooffice.AppName, 'Open in Nextcloud Office'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes: files }) => {
					if (Permission.READ !== (files[0].permissions & Permission.READ)) { return false }

					return true
				},
				exec({ nodes, view }) {
					OCA.Eurooffice.FileClickExec({ nodes, view, isDefault: false })
				},
			})

			if (config.def
				&& !_oc_appswebroots.richdocuments
				&& !(_oc_appswebroots.files_pdfviewer && extension === 'pdf')
				&& !(_oc_appswebroots.text && extension === 'txt')) {
				const editorUrl = generateUrl('apps/' + OCA.Eurooffice.AppName + '/s/' + encodeURIComponent(getSharingToken()))

				OCA.Eurooffice.frameSelector = '#euroofficeFrame'
				const container = document.createElement('div')
				container.classList.add('eurooffice-iframe-container')
				const iframe = document.createElement('iframe')
				iframe.id = 'euroofficeFrame'
				iframe.nonce = btoa(OC.requestToken)
				iframe.scrolling = 'no'
				iframe.allowFullscreen = true
				iframe.src = `${editorUrl}?inframe=true&parentOrigin=${encodeURIComponent(window.location.origin)}`
				container.appendChild(iframe)
				const appContent = document.querySelector('#app-content') || document.querySelector('#app-content-vue')
				appContent.appendChild(container)
				document.body.classList.add('eurooffice-inline')
			}
		} else {
			OCA.Eurooffice.registerNewFileMenu()

			OCA.Eurooffice.registerAction()
		}
	}
	initPage()

})(OCA)
