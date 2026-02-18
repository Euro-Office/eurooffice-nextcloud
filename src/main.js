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
 * You can contact Ascensio System SIA at 20A-12 Ernesta Birznieka-Upisha street, Riga, Latvia, EU, LV-1050.
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 * Pursuant to Section 7(b) of the License you must retain the original Product logo when distributing the program.
 * Pursuant to Section 7(e) we decline to grant you any rights under trademark law for use of our trademarks.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

/* eslint-disable import/no-webpack-loader-syntax */
/* eslint-disable import/no-unresolved */

/* global _, _oc_appswebroots */

import {
	File,
	registerFileAction,
	Permission,
	DefaultType,
	addNewFileMenuEntry,
} from '@nextcloud/files'
import {
	getClient,
	getRootPath,
	getDefaultPropfind,
	resultToNode,
} from '@nextcloud/files/dav'
import { emit } from '@nextcloud/event-bus'
import { generateUrl } from '@nextcloud/router'
import { getCurrentUser } from '@nextcloud/auth'
import axios from '@nextcloud/axios'
import AppDarkSvg from '!!raw-loader!../img/app-dark.svg'
import NewDocxSvg from '!!raw-loader!../img/new-docx.svg'
import NewXlsxSvg from '!!raw-loader!../img/new-xlsx.svg'
import NewPptxSvg from '!!raw-loader!../img/new-pptx.svg'
import NewPdfSvg from '!!raw-loader!../img/new-pdf.svg'
import { isPublicShare, getSharingToken } from '@nextcloud/sharing/public'
import { loadState } from '@nextcloud/initial-state'

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {

	OCA.Onlyoffice = _.extend({
		AppName: 'onlyoffice',
		context: null,
		frameSelector: null,
	}, OCA.Onlyoffice)

	OCA.Onlyoffice.setting = OCP.InitialState.loadState(OCA.Onlyoffice.AppName, 'settings')
	OCA.Onlyoffice.mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini|Macintosh/i.test(navigator.userAgent)
							&& navigator.maxTouchPoints && navigator.maxTouchPoints > 1

	OCA.Onlyoffice.CreateFile = function(name, fileList, templateId, targetId, open = true) {
		const dir = fileList.getCurrentDirectory()

		OCA.Onlyoffice.CreateFileProcess(name, dir, templateId, targetId, open, (response) => {
			fileList.add(response, { animate: true })
		})
	}

	OCA.Onlyoffice.CreateFileOverload = function(name, context, templateId, targetId, open = true, filesContext = null) {
		if (!context.view) {
			context.view = OCP.Files.Router._router.app.currentView
		}

		OCA.Onlyoffice.CreateFileProcess(name, context.dir, templateId, targetId, open, async (response) => {
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

	OCA.Onlyoffice.CreateFileProcess = function(name, dir, templateId, targetId, open, callback) {
		let winEditor = null
		if (((!OCA.Onlyoffice.setting.sameTab && !OCA.Onlyoffice.setting.enableSharing) || OCA.Onlyoffice.mobile || OCA.Onlyoffice.Desktop) && open) {
			const loaderUrl = OCA.Onlyoffice.Desktop ? '' : OC.filePath(OCA.Onlyoffice.AppName, 'templates', 'loader.html')
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

		axios.post(generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/new'), createData)
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
					OCA.Onlyoffice.OpenEditor(data.id, dir, fileName, winEditor)

					OCA.Onlyoffice.context = {
						fileName: data.name,
						dir,
					}
				}

				OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'File created'))
			})
			.catch((error) => {
				if (winEditor) {
					winEditor.close()
				}
				OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to create file'))
			})
	}

	OCA.Onlyoffice.OpenEditor = function(fileId, fileDir, fileName, winEditor, isDefault = true) {
		let filePath = ''
		if (fileName) {
			filePath = fileDir.replace(/\/$/, '') + '/' + fileName
		}
		let url = generateUrl('/apps/' + OCA.Onlyoffice.AppName + '/{fileId}?filePath={filePath}',
			{
				fileId,
				filePath,
			})

		if (isPublicShare()) {
			url = generateUrl('apps/' + OCA.Onlyoffice.AppName + '/s/{shareToken}?fileId={fileId}',
				{
					shareToken: encodeURIComponent(getSharingToken()),
					fileId,
				})
		}

		if (winEditor && winEditor.location) {
			OCA.Onlyoffice.SetDefaultUrl()
			winEditor.location.href = url
		} else if ((!OCA.Onlyoffice.setting.sameTab && !OCA.Onlyoffice.setting.enableSharing)
			|| OCA.Onlyoffice.mobile || OCA.Onlyoffice.Desktop || (isPublicShare() && !OCA.Onlyoffice.isViewIsFile()
			&& !OCA.Onlyoffice.setting.sameTab && OCA.Onlyoffice.setting.enableSharing)
			|| (!OCA.Onlyoffice.setting.sameTab && !isDefault)) {
			OCA.Onlyoffice.SetDefaultUrl()
			winEditor = window.open(url, '_blank')
		} else if (isPublicShare() && OCA.Onlyoffice.isViewIsFile()) {
			location.href = url
		} else {
			if (OCA.Onlyoffice.setting.enableSharing
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
				OCA.Onlyoffice.SetDefaultUrl()
				window.open(url, '_blank')
				return
			}
			OCA.Onlyoffice.frameSelector = '#onlyofficeFrame'
		const iframeContainer = document.createElement('div')
		iframeContainer.className = 'onlyoffice-iframe-container'
		const iframe = document.createElement('iframe')
		iframe.id = 'onlyofficeFrame'
		iframe.setAttribute('nonce', btoa(OC.requestToken))
		iframe.setAttribute('scrolling', 'no')
		iframe.setAttribute('allowfullscreen', '')
		iframe.src = url + '&inframe=true'
		iframeContainer.appendChild(iframe)

		const frameContainer = document.getElementById('app-content') || document.getElementById('app-content-vue')
		if (frameContainer) {
			frameContainer.appendChild(iframeContainer)
		}

		document.body.classList.add('onlyoffice-inline')
			if (OCA.Files.Sidebar) {
				OCA.Files.Sidebar.close()
			}

		const appContentElement = document.getElementById('app-content')
		const scrollTop = appContentElement ? appContentElement.scrollTop : 0
		const frameElement = document.querySelector(OCA.Onlyoffice.frameSelector)
		if (frameElement) {
			frameElement.style.top = scrollTop + 'px'
		}

		window.OCP?.Files?.Router?.goToRoute(
				null, // use default route
				{ view: 'files', fileid: fileId },
				{ ...OCP.Files.Router.query, openfile: 'true' },
			)
		}
	}

	OCA.Onlyoffice.CloseEditor = function() {
		document.body.classList.remove('onlyoffice-inline')

		const iframeContainer = document.querySelector('.onlyoffice-iframe-container')
		if (iframeContainer !== null) {
			iframeContainer.remove()
		}

		OCA.Onlyoffice.context = null

		OCA.Onlyoffice.SetDefaultUrl()
	}

	OCA.Onlyoffice.SetDefaultUrl = function() {
		window.OCP?.Files?.Router?.goToRoute(
			null, // use default route
			{ view: 'files', fileid: undefined },
			{ ...OCP.Files.Router.query, openfile: 'false', enableSharing: undefined },
		)
	}

	OCA.Onlyoffice.OpenShareDialog = function() {
		if (OCA.Onlyoffice.context) {
			const sidebarElement = document.getElementById('app-sidebar-vue')
			if (!sidebarElement || sidebarElement.offsetParent === null) {
				OCA.Files.Sidebar.open(OCA.Onlyoffice.context.dir + '/' + OCA.Onlyoffice.context.fileName)
				OCA.Files.Sidebar.setActiveTab('sharing')
			} else {
				OCA.Files.Sidebar.close()
			}
		}
	}

	OCA.Onlyoffice.RefreshVersionsDialog = function() {
		if (OCA.Onlyoffice.context) {
			const sidebarElement = document.getElementById('app-sidebar-vue')
			if (sidebarElement && sidebarElement.offsetParent !== null) {
				OCA.Files.Sidebar.close()
				OCA.Files.Sidebar.open(OCA.Onlyoffice.context.dir + '/' + OCA.Onlyoffice.context.fileName)
				OCA.Files.Sidebar.setActiveTab('versionsTabView')
			}
		}
	}

	OCA.Onlyoffice.FileClick = function(fileName, context) {
		const fileInfoModel = context.fileInfoModel || context.fileList.getModelForFile(fileName)
		const fileId = context.fileId || (context.$file && context.$file[0].dataset.id) || fileInfoModel.id
		const winEditor = !fileInfoModel && !OCA.Onlyoffice.setting.sameTab ? document : null

		OCA.Onlyoffice.OpenEditor(fileId, context.dir, fileName, winEditor)

		OCA.Onlyoffice.context = context
		OCA.Onlyoffice.context.fileName = fileName
	}

	OCA.Onlyoffice.FileClickExec = async function({ nodes }) {
		if (OCA.Onlyoffice.context !== null && OCA.Onlyoffice.setting.sameTab && !OCA.Onlyoffice.Desktop) {
			return null
		}

		const node = nodes[0]
		OCA.Onlyoffice.OpenEditor(node.fileid, node.dirname, node.basename, 0)

		OCA.Onlyoffice.context = {
			fileName: node.basename,
			dir: node.dirname,
		}

		return null
	}

	OCA.Onlyoffice.FileConvertClick = function(fileName, context) {
		const fileInfoModel = context.fileInfoModel || context.fileList.getModelForFile(fileName)
		const fileList = context.fileList
		const fileId = context.$file ? context.$file[0].dataset.id : fileInfoModel.id

		OCA.Onlyoffice.FileConvert(fileId, (response) => {
			if (response.parentId === fileList.dirInfo.id) {
				fileList.add(response, { animate: true })
			}
		})
	}

	OCA.Onlyoffice.FileConvertClickExec = async function(file, view, dir) {
		OCA.Onlyoffice.FileConvert(file.fileid, async (response) => {
			const viewContents = await view.getContents(dir)

			if (viewContents.folder && (viewContents.folder.fileid === response.parentId)) {
				const newFile = viewContents.contents.find(node => node.fileid === response.id)
				if (newFile) emit('files:node:created', newFile)
			}
		})

		return null
	}

	OCA.Onlyoffice.FileConvert = function(fileId, callback) {
		const convertData = {
			fileId,
		}

		if (isPublicShare()) {
			convertData.shareToken = encodeURIComponent(getSharingToken())
		}

		axios.post(generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/convert'), convertData)
			.then((response) => {
				const data = response.data
				if (data.error) {
					OCP.Toast.error(data.error)
					return
				}

				callback(data)

				OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'File has been converted. Its content might look different.'))
			})
			.catch((error) => {
				OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to convert file'))
			})
	}

	OCA.Onlyoffice.DownloadClick = function(fileName, context) {
		const fileId = context.fileInfoModel.id

		OCA.Onlyoffice.Download(fileName, fileId)
	}

	OCA.Onlyoffice.DownloadClickExec = async function(file) {
		OCA.Onlyoffice.Download(file.basename, file.fileid)

		return null
	}

	OCA.Onlyoffice.Download = function(fileName, fileId) {
		axios.get(OC.filePath(OCA.Onlyoffice.AppName, 'templates', 'downloadPicker.html'))
			.then((response) => {
				const tmpl = response.data
				const tempDiv = document.createElement('div')
				tempDiv.innerHTML = tmpl
				const dialog = window.$(tempDiv.firstElementChild).octemplate({
					dialog_name: 'download-picker',
					dialog_title: t('onlyoffice', 'Download as'),
				})

				const dialogElement = dialog[0]
				const pElement = dialogElement.querySelector('p')
				if (pElement) {
					pElement.textContent = t(OCA.Onlyoffice.AppName, 'Choose a format to convert {fileName}', { fileName })
				}

				const extension = OCA.Onlyoffice.getFileExtension(fileName)
				const selectNode = dialogElement.querySelector('select')
				const optionNodeOrigin = selectNode.querySelector('option')

				optionNodeOrigin.setAttribute('data-value', extension)
				optionNodeOrigin.textContent = t(OCA.Onlyoffice.AppName, 'Origin format')

				dialogElement.dataset.format = extension
				selectNode.onchange = function() {
					const selectedOption = selectNode.querySelector('option:checked')
					dialogElement.dataset.format = selectedOption.getAttribute('data-value')
				}

				OCA.Onlyoffice.setting.formats[extension].saveas.forEach(ext => {
					const optionNode = optionNodeOrigin.cloneNode(true)
					optionNode.setAttribute('data-value', ext)
					optionNode.textContent = ext
					selectNode.append(optionNode)
				})

				document.body.appendChild(dialogElement)

				window.$('#download-picker').ocdialog({
					closeOnEscape: true,
					modal: true,
					buttons: [{
						text: t('core', 'Cancel'),
						classes: 'cancel',
						click() {
							window.$(this).ocdialog('close')
						},
					}, {
						text: t('onlyoffice', 'Download'),
						classes: 'primary',
						click() {
							const format = this.dataset.format
							const downloadLink = generateUrl('apps/' + OCA.Onlyoffice.AppName + '/downloadas?fileId={fileId}&toExtension={toExtension}', {
								fileId,
								toExtension: format,
							})

							location.href = downloadLink
							window.$(this).ocdialog('close')
						},
					}],
				})
			})
			.catch((error) => {
				OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to load template'))
			})
	}

	OCA.Onlyoffice.OpenFormPicker = function(name, filelist, filesContext = null) {
		const filterMimes = [
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		]

		const buttons = [
			{
				text: t(OCA.Onlyoffice.AppName, 'Blank'),
				type: 'blank',
			},
			{
				text: t(OCA.Onlyoffice.AppName, 'From text document'),
				type: 'target',
				defaultButton: true,
			},
		]

		OC.dialogs.filepicker(t(OCA.Onlyoffice.AppName, 'Create new PDF form'),
			async function(filePath, type) {
				let dialogFileList = OC.dialogs.filelist
				let targetId = 0

				const targetFileName = OC.basename(filePath)
				const targetFolderPath = OC.dirname(filePath)

				if (!dialogFileList) {
					const results = await getClient().getDirectoryContents(getRootPath() + targetFolderPath, {
						details: true,
						data: getDefaultPropfind(),
					})
					dialogFileList = results.data.map((result) => resultToNode(result))
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
					OCA.Onlyoffice.CreateFile(name, filelist, 0, targetId)
				} else {
					OCA.Onlyoffice.CreateFileOverload(name, filelist, 0, targetId, true, filesContext)
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

	OCA.Onlyoffice.CreateFormClick = function(fileName, context) {
		const fileList = context.fileList
		const name = fileName.replace(/\.[^.]+$/, '.pdf')
		const targetId = context.fileInfoModel.id

		OCA.Onlyoffice.CreateFile(name, fileList, 0, targetId, false)
	}

	OCA.Onlyoffice.CreateFormClickExec = async function(file, view, dir) {
		const name = file.basename.replace(/\.[^.]+$/, '.pdf')
		const context = {
			dir,
			view,
		}

		OCA.Onlyoffice.CreateFileOverload(name, context, 0, file.fileid, false)

		return null
	}

	OCA.Onlyoffice.registerAction = function() {
		const formats = OCA.Onlyoffice.setting.formats

		const getConfig = function(file) {
			const fileExt = file?.extension?.toLowerCase()?.replace('.', '')
			const config = formats[fileExt]

			return config
		}

		if (OCA.Files && OCA.Files.fileActions) {
			Object.entries(formats).forEach(([ext, config]) => {
				if (!config.mime) {
					return
				}

				const mimeTypes = config.mime
				mimeTypes.forEach((mime) => {
					OCA.Files.fileActions.registerAction({
						name: 'onlyofficeOpen',
						displayName: t(OCA.Onlyoffice.AppName, 'Open in ONLYOFFICE'),
						mime,
						permissions: OC.PERMISSION_READ,
						iconClass: 'icon-onlyoffice-open',
						actionHandler: OCA.Onlyoffice.FileClick,
					})

					if (config.def) {
						OCA.Files.fileActions.setDefault(mime, 'onlyofficeOpen')
					}

					if (config.conv) {
						OCA.Files.fileActions.registerAction({
							name: 'onlyofficeConvert',
							displayName: t(OCA.Onlyoffice.AppName, 'Convert with ONLYOFFICE'),
							mime,
							permissions: (isPublicShare() ? OC.PERMISSION_UPDATE : OC.PERMISSION_READ),
							iconClass: 'icon-onlyoffice-convert',
							actionHandler: OCA.Onlyoffice.FileConvertClick,
						})
					}

					if (config.createForm) {
						OCA.Files.fileActions.registerAction({
							name: 'onlyofficeCreateForm',
							displayName: t(OCA.Onlyoffice.AppName, 'Create form'),
							mime,
							permissions: (isPublicShare() ? OC.PERMISSION_UPDATE : OC.PERMISSION_READ),
							iconClass: 'icon-onlyoffice-create',
							actionHandler: OCA.Onlyoffice.CreateFormClick,
						})
					}

					if (config.saveas && !isPublicShare() && !OCA.Onlyoffice.setting.disableDownload) {
						OCA.Files.fileActions.registerAction({
							name: 'onlyofficeDownload',
							displayName: t(OCA.Onlyoffice.AppName, 'Download as'),
							mime,
							permissions: OC.PERMISSION_READ,
							iconClass: 'icon-onlyoffice-download',
							actionHandler: OCA.Onlyoffice.DownloadClick,
						})
					}
				})
			})
		} else {
			registerFileAction({
				id: 'onlyoffice-open-def',
				displayName: () => t(OCA.Onlyoffice.AppName, 'Open in ONLYOFFICE'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes }) => {
					const config = getConfig(nodes[0])

					if (!config) return false
					if (!config.def) return false

					if (Permission.READ !== (nodes[0].permissions & Permission.READ)) { return false }

					return true
				},
				exec: OCA.Onlyoffice.FileClickExec,
				default: DefaultType.HIDDEN,
				order: -1,
			})

			registerFileAction({
				id: 'onlyoffice-open',
				displayName: () => t(OCA.Onlyoffice.AppName, 'Open in ONLYOFFICE'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes }) => {
					const config = getConfig(nodes[0])

					if (!config) return false
					if (config.def) return false

					if (Permission.READ !== (nodes[0].permissions & Permission.READ)) { return false }

					return true
				},
				exec(file, view, dir) {
					OCA.Onlyoffice.FileClickExec(file, view, dir, false)
				},
			})

			registerFileAction({
				id: 'onlyoffice-convert',
				displayName: () => t(OCA.Onlyoffice.AppName, 'Convert with ONLYOFFICE'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes }) => {
					const config = getConfig(nodes[0])

					if (!config) return false
					if (!config.conv) return false

					const required = isPublicShare() ? Permission.UPDATE : Permission.READ
					if (required !== (nodes[0].permissions & required)) { return false }

					if (nodes[0].attributes['mount-type'] === 'shared') {
						if (required !== (nodes[0].attributes['share-permissions'] & required)) { return false }

						const attributes = JSON.parse(nodes[0].attributes['share-attributes'])
						const downloadAttribute = attributes.find((attribute) => attribute.scope === 'permissions' && attribute.key === 'download')
						if (downloadAttribute !== undefined && downloadAttribute.enabled === false) { return false }
					}

					return true
				},
				exec: OCA.Onlyoffice.FileConvertClickExec,
			})

			registerFileAction({
				id: 'onlyoffice-create-form',
				displayName: () => t(OCA.Onlyoffice.AppName, 'Create form'),
				iconSvgInline: () => AppDarkSvg,
				enabled: ({ nodes }) => {
					const config = getConfig(nodes[0])

					if (!config) return false
					if (!config.createForm) return false

					const required = isPublicShare() ? Permission.UPDATE : Permission.READ
					if (required !== (nodes[0].permissions & required)) { return false }

					if (nodes[0].attributes['mount-type'] === 'shared') {
						if (required !== (nodes[0].attributes['share-permissions'] & required)) { return false }

						const attributes = JSON.parse(nodes[0].attributes['share-attributes'])
						const downloadAttribute = attributes.find((attribute) => attribute.scope === 'permissions' && attribute.key === 'download')
						if (downloadAttribute !== undefined && downloadAttribute.enabled === false) { return false }
					}

					return true
				},
				exec: OCA.Onlyoffice.CreateFormClickExec,
			})

			if (!isPublicShare()) {
				registerFileAction({
					id: 'onlyoffice-download-as',
					displayName: () => t(OCA.Onlyoffice.AppName, 'Download as'),
					iconSvgInline: () => AppDarkSvg,
					enabled: ({ nodes }) => {
						if (OCA.Onlyoffice.setting.disableDownload) {
							return false
						}
						const config = getConfig(nodes[0])

						if (!config) return false
						if (!config.saveas) return false

						if (Permission.READ !== (nodes[0].permissions & Permission.READ)) { return false }

						if (nodes[0].attributes['mount-type'] === 'shared') {
							const attributes = JSON.parse(nodes[0].attributes['share-attributes'])
							const downloadAttribute = attributes.find((attribute) => attribute.scope === 'permissions' && attribute.key === 'download')
							if (downloadAttribute !== undefined && downloadAttribute.enabled === false) { return false }
						}

						return true
					},
					exec: OCA.Onlyoffice.DownloadClickExec,
				})
			}
		}
	}

	OCA.Onlyoffice.registerNewFileMenu = function() {

		if (isPublicShare() && !OCA.Onlyoffice.isViewIsFile()) {
			if (OCA.Onlyoffice.GetTemplates) {
				OCA.Onlyoffice.GetTemplates()
			}
			// Document
			addNewFileMenuEntry({
				id: 'new-onlyoffice-docx',
				displayName: t(OCA.Onlyoffice.AppName, 'New document'),
				enabled: (folder) => {
					return (folder.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewDocxSvg,
				order: 21,
				handler: (context) => {
					const name = t(OCA.Onlyoffice.AppName, 'New document')
					if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('document')) {
						OCA.Onlyoffice.OpenTemplatePicker(name, '.docx', 'document')
					} else {
						const dirContext = { dir: context.path }
						OCA.Onlyoffice.CreateFileOverload(name + '.docx', dirContext, null, null, true, context)
					}
				},
			})

			// Spreadsheet
			addNewFileMenuEntry({
				id: 'new-onlyoffice-xlsx',
				displayName: t(OCA.Onlyoffice.AppName, 'New spreadsheet'),
				enabled: (folder) => {
					return (folder.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewXlsxSvg,
				order: 22,
				handler: (context) => {
					const name = t(OCA.Onlyoffice.AppName, 'New spreadsheet')
					if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('spreadsheet')) {
						OCA.Onlyoffice.OpenTemplatePicker(name, '.xlsx', 'spreadsheet')
					} else {
						const dirContext = { dir: context.path }
						OCA.Onlyoffice.CreateFileOverload(name + '.xlsx', dirContext, null, null, true, context)
					}
				},
			})

			// Presentation
			addNewFileMenuEntry({
				id: 'new-onlyoffice-pptx',
				displayName: t(OCA.Onlyoffice.AppName, 'New presentation'),
				enabled: (context) => {
					return (context.permissions & Permission.CREATE) !== 0
				},
				iconSvgInline: NewPptxSvg,
				order: 23,
				handler: (context) => {
					const name = t(OCA.Onlyoffice.AppName, 'New presentation')
					if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('presentation')) {
						OCA.Onlyoffice.OpenTemplatePicker(name, '.pptx', 'presentation')
					} else {
						const dirContext = { dir: context.path }
						OCA.Onlyoffice.CreateFileOverload(name + '.pptx', dirContext, null, null, true, context)
					}
				},
			})
		}

		// PDF Form
		addNewFileMenuEntry({
			id: 'new-onlyoffice-pdf',
			displayName: t(OCA.Onlyoffice.AppName, 'New PDF form'),
			enabled: folder => {
				return (folder.permissions & Permission.CREATE) !== 0
			},
			iconSvgInline: NewPdfSvg,
			order: 24,
			handler: context => {
				const name = t(OCA.Onlyoffice.AppName, 'New PDF form')
				const dirContext = { dir: context.path }
				OCA.Onlyoffice.OpenFormPicker(name + '.pdf', dirContext, context)
			},
		})

		if (!isPublicShare() && OCA.Onlyoffice.GetTemplates) {
			OCA.Onlyoffice.GetTemplates()
		}
	}

	OCA.Onlyoffice.NewFileMenu = {
		attach(menu) {
			const fileList = menu.fileList

			if (fileList.id !== 'files' && fileList.id !== 'files.public') {
				return
			}

			if (isPublicShare() && !OCA.Onlyoffice.isViewIsFile()) {
				menu.addMenuEntry({
					id: 'onlyofficeDocx',
					displayName: t(OCA.Onlyoffice.AppName, 'New document'),
					templateName: t(OCA.Onlyoffice.AppName, 'New document'),
					iconClass: 'icon-onlyoffice-new-docx',
					fileType: 'docx',
					actionHandler(name) {
						if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('document')) {
							OCA.Onlyoffice.OpenTemplatePicker(name, '.docx', 'document')
						} else {
							OCA.Onlyoffice.CreateFile(name + '.docx', fileList)
						}
					},
				})

				menu.addMenuEntry({
					id: 'onlyofficeXlsx',
					displayName: t(OCA.Onlyoffice.AppName, 'New spreadsheet'),
					templateName: t(OCA.Onlyoffice.AppName, 'New spreadsheet'),
					iconClass: 'icon-onlyoffice-new-xlsx',
					fileType: 'xlsx',
					actionHandler(name) {
						if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('spreadsheet')) {
							OCA.Onlyoffice.OpenTemplatePicker(name, '.xlsx', 'spreadsheet')
						} else {
							OCA.Onlyoffice.CreateFile(name + '.xlsx', fileList)
						}
					},
				})

				menu.addMenuEntry({
					id: 'onlyofficePpts',
					displayName: t(OCA.Onlyoffice.AppName, 'New presentation'),
					templateName: t(OCA.Onlyoffice.AppName, 'New presentation'),
					iconClass: 'icon-onlyoffice-new-pptx',
					fileType: 'pptx',
					actionHandler(name) {
						if (!isPublicShare() && OCA.Onlyoffice.TemplateExist('presentation')) {
							OCA.Onlyoffice.OpenTemplatePicker(name, '.pptx', 'presentation')
						} else {
							OCA.Onlyoffice.CreateFile(name + '.pptx', fileList)
						}
					},
				})

				if (OCA.Onlyoffice.GetTemplates) {
					OCA.Onlyoffice.GetTemplates()
				}
			}

			menu.addMenuEntry({
				id: 'onlyofficePdf',
				displayName: t(OCA.Onlyoffice.AppName, 'New PDF form'),
				templateName: t(OCA.Onlyoffice.AppName, 'New PDF form'),
				iconClass: 'icon-onlyoffice-new-pdf',
				fileType: 'pdf',
				actionHandler(name) {
					OCA.Onlyoffice.OpenFormPicker(name + '.pdf', fileList)
				},
			})
		},
	}

	OCA.Onlyoffice.getFileExtension = function(fileName) {
		const extension = fileName.substr(fileName.lastIndexOf('.') + 1).toLowerCase()
		return extension
	}

	OCA.Onlyoffice.isViewIsFile = function() {
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
		if (isPublicShare() && OCA.Onlyoffice.isViewIsFile()) {
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

			const extension = OCA.Onlyoffice.getFileExtension(fileName)
			const formats = OCA.Onlyoffice.setting.formats

			const config = formats[extension]
			if (!config) {
				return
			}

			const editorUrl = generateUrl('apps/' + OCA.Onlyoffice.AppName + '/s/' + encodeURIComponent(getSharingToken()))

			if (_oc_appswebroots.richdocuments
				|| (_oc_appswebroots.files_pdfviewer && extension === 'pdf')
				|| (_oc_appswebroots.text && extension === 'txt')) {

				const button = document.createElement('a')
				button.href = editorUrl
				button.className = 'onlyoffice-public-open button'
				button.innerText = t(OCA.Onlyoffice.AppName, 'Open in ONLYOFFICE')

				if (!OCA.Onlyoffice.setting.sameTab) {
					button.target = '_blank'
				}

			const previewElement = document.getElementById('preview')
			if (previewElement) {
				previewElement.prepend(button)
			}
			} else {
				OCA.Onlyoffice.frameSelector = '#onlyofficeFrame'
				const container = document.createElement('div')
				container.classList.add('onlyoffice-iframe-container')
				const iframe = document.createElement('iframe')
				iframe.id = 'onlyofficeFrame'
				iframe.nonce = btoa(OC.requestToken)
				iframe.scrolling = 'no'
				iframe.allowFullscreen = true
				iframe.src = `${editorUrl}?inframe=true`
				container.appendChild(iframe)
				const appContent = document.querySelector('#app-content') || document.querySelector('#app-content-vue')
				appContent.appendChild(container)
				document.body.classList.add('onlyoffice-inline')
			}
		} else {
			OC.Plugins.register('OCA.Files.NewFileMenu', OCA.Onlyoffice.NewFileMenu)

			OCA.Onlyoffice.registerNewFileMenu()

			OCA.Onlyoffice.registerAction()
		}
	}
	initPage()

})(OCA)
