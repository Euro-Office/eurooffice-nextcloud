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

/* global _ */

import AppDarkSvg from '!!raw-loader!../img/app-dark.svg'
import axios from '@nextcloud/axios'

/**
 * @param {object} OC Nextcloud OCA object
 */
(function(OC) {

	OCA.Onlyoffice = _.extend({
		AppName: 'onlyoffice',
	}, OCA.Onlyoffice)

	OCA.Onlyoffice.Permissions = {
		None: 0,
		Review: 1,
		Comment: 2,
		FillForms: 4,
		ModifyFilter: 8,
	}

	let tabcontext = null

	const advancedTab = new OCA.Files.Sidebar.Tab({
		id: 'onlyofficeSharingTabView',
		name: t(OCA.Onlyoffice.AppName, 'Advanced'),
		iconSvg: AppDarkSvg,

		mount(el, fileInfo, context) {
			if (!tabcontext) {
				tabcontext = advancedContext()
			}

			tabcontext.init(el, fileInfo)
		},

		update(fileInfo) {
			tabcontext.update(fileInfo)
		},

		destroy() {
			tabcontext.clear()
		},

		enabled(fileInfo) {
			let canDisplay = false

			if (!fileInfo.isDirectory()) {
				const ext = OCA.Onlyoffice.getFileExtension(fileInfo.name)
				const format = OCA.Onlyoffice.setting.formats[ext]
				if (format && (format.review
					|| format.comment
					|| format.fillForms
					|| format.modifyFilter)) {
					canDisplay = true

				}
			}

			return canDisplay
		},
	})

	const advancedContext = function() {
		let el = null

		let format = null
		let fileInfo = null
		let collection = null
		let customEvents = null
		let permissionsMenu = null
		let templateItem = null

		const getContainer = function() {
			return el.querySelector('.onlyoffice-share-container')
		}

		const getTemplate = function(callback) {
			if (!el.querySelector('.onlyoffice-share-container')) {
				const ul = document.createElement('ul')
				ul.className = 'onlyoffice-share-container'
				el.appendChild(ul)

				const div = document.createElement('div')
				div.textContent = t(OCA.Onlyoffice.AppName, 'Provide advanced document permissions using ONLYOFFICE Docs')
				el.insertBefore(div, el.firstChild)
			}

			if (templateItem) {
				callback()
				return
			}

			axios.get(OC.filePath(OCA.Onlyoffice.AppName, 'templates', 'share.html'))
				.then((response) => {
					const tempDiv = document.createElement('div')
					tempDiv.innerHTML = response.data
					templateItem = tempDiv.firstElementChild

					callback()
				})
		}

		const render = function() {
			getTemplate(() => {
				collection.forEach(extra => {
					const itemNode = templateItem.cloneNode(true)
					const descNode = itemNode.querySelector('span')
					const avatar = itemNode.querySelector('img')
					const actionButton = itemNode.querySelector('#onlyoffice-share-action')

					let avatarSrc = '/index.php/avatar/' + extra.shareWith + '/32?v=0'
					let label = extra.shareWithName
					if (extra.type === OC.Share.SHARE_TYPE_GROUP
						|| extra.type === OC.Share.SHARE_TYPE_ROOM) {
						avatarSrc = '/index.php/avatar/guest/' + extra.shareWith + '/32?v=0'
						label = extra.shareWith + ' (' + t(OCA.Onlyoffice.AppName, 'group') + ')'
					}

					if (extra.type === OC.Share.SHARE_TYPE_ROOM) {
						label = extra.shareWith + ' (' + t(OCA.Onlyoffice.AppName, 'conversation') + ')'
					}

					if (extra.type === OC.Share.SHARE_TYPE_LINK) {
						label = t(OCA.Onlyoffice.AppName, 'Share link')

						const avatarWrapper = itemNode.querySelector('.avatardiv')
						if (avatarWrapper) {
							avatarWrapper.classList.add('onlyoffice-share-link-avatar')
						}

						avatarSrc = '/core/img/actions/public.svg'
					}

					if (actionButton) {
						actionButton.addEventListener('click', onClickPermissionMenu)
					}

					if (avatar) avatar.src = avatarSrc
					if (descNode) descNode.textContent = label

					itemNode.id = extra.share_id

					getContainer().appendChild(itemNode)
				})
			})
		}

		const onClickSetPermissions = function(e) {
			const permissionValues = permissionsMenu.getValues()
			const shareId = permissionsMenu.getTargetId()
			const fileId = fileInfo.id
			const extra = collection.find(item => item.share_id === shareId)

			let permissions = OCA.Onlyoffice.Permissions.None
			if (permissionValues[OCA.Onlyoffice.Permissions.Review]) {
				permissions |= OCA.Onlyoffice.Permissions.Review
			}
			if (permissionValues[OCA.Onlyoffice.Permissions.Comment]
				&& (permissions & OCA.Onlyoffice.Permissions.Review) !== OCA.Onlyoffice.Permissions.Review
				&& (permissions & OCA.Onlyoffice.Permissions.ModifyFilter) !== OCA.Onlyoffice.Permissions.ModifyFilter) {
				permissions |= OCA.Onlyoffice.Permissions.Comment
			}
			if (permissionValues[OCA.Onlyoffice.Permissions.FillForms]
				&& (permissions & OCA.Onlyoffice.Permissions.Review) !== OCA.Onlyoffice.Permissions.Review) {
				permissions |= OCA.Onlyoffice.Permissions.FillForms
			}
			if (permissionValues[OCA.Onlyoffice.Permissions.ModifyFilter]
				&& (permissions & OCA.Onlyoffice.Permissions.Comment) !== OCA.Onlyoffice.Permissions.Comment) {
				permissions |= OCA.Onlyoffice.Permissions.ModifyFilter
			}

			permissionsMenu.block(true)
			OCA.Onlyoffice.SetShares(extra.id, shareId, fileId, permissions, (extra) => {
				collection.forEach(item => {
					if (item.share_id === extra.share_id) {
						item.id = extra.id
						item.permissions = extra.permissions
						item.available = extra.available
					}
				})

				const attributes = getPermissionAttributes(extra)

				permissionsMenu.refresh(attributes)
				permissionsMenu.block(false)
			})
		}

		const listenOuterClicks = function(event) {
			if (event.target.id === 'onlyoffice-share-action') {
				return
			}
			const target = document.querySelector('#onlyoffice-share-popup-menu')
			if (target) {
				const eventPath = event.composedPath().includes(target)
				if (!eventPath && typeof (permissionsMenu) !== 'undefined' && permissionsMenu.isOpen()) {
					permissionsMenu.close()
				}
			}
		}

		const onClickPermissionMenu = function(e) {
			if (!permissionsMenu) {
				permissionsMenu = getPermissionMenu()
			}
			window.addEventListener('click', listenOuterClicks)

			const shareNode = e.target.closest('.onlyoffice-share-item')
			const shareId = shareNode.id

			if (permissionsMenu.isOpen()) {
				const previousId = permissionsMenu.getTargetId()
				permissionsMenu.close()

				if (previousId === shareId) return
			}

			const extra = collection.find(item => item.share_id === shareId)

			const attributes = getPermissionAttributes(extra)

			const targetElement = e.target
			const rect = targetElement.getBoundingClientRect()
			permissionsMenu.open(extra.share_id, attributes, { top: rect.top, left: rect.left })
		}

		const getCustomEvents = function() {
			let init = false

			return {
				on() {
					if (!init) {
						const content = document.getElementById('content')
						if (content) {
							content.addEventListener('click', function(e) {
								const target = e.target
								if (!permissionsMenu
									|| !permissionsMenu.isOpen()
									|| target.id === 'onlyoffice-share-action'
									|| target.className === 'onlyoffice-share-label'
									|| target.closest('.onlyoffice-share-action')) {
									return
								}

								permissionsMenu.close()
							})
						}

						init = true
					}
				},
			}
		}

		const getPermissionAttributes = function(extra) {
			const attributes = []

			if (format.review
				&& (OCA.Onlyoffice.Permissions.Review & extra.available) === OCA.Onlyoffice.Permissions.Review) {
				const review = (OCA.Onlyoffice.Permissions.Review & extra.permissions) === OCA.Onlyoffice.Permissions.Review
				attributes.push({
					checked: review,
					extra: OCA.Onlyoffice.Permissions.Review,
					label: t(OCA.Onlyoffice.AppName, 'Review only'),
				})
			}
			if (format.comment
				&& (OCA.Onlyoffice.Permissions.Comment & extra.available) === OCA.Onlyoffice.Permissions.Comment) {
				const comment = (OCA.Onlyoffice.Permissions.Comment & extra.permissions) === OCA.Onlyoffice.Permissions.Comment
				attributes.push({
					checked: comment,
					extra: OCA.Onlyoffice.Permissions.Comment,
					label: t(OCA.Onlyoffice.AppName, 'Comment only'),
				})
			}
			if (format.fillForms
				&& (OCA.Onlyoffice.Permissions.FillForms & extra.available) === OCA.Onlyoffice.Permissions.FillForms) {
				const fillForms = (OCA.Onlyoffice.Permissions.FillForms & extra.permissions) === OCA.Onlyoffice.Permissions.FillForms
				attributes.push({
					checked: fillForms,
					extra: OCA.Onlyoffice.Permissions.FillForms,
					label: t(OCA.Onlyoffice.AppName, 'Form filling'),
				})
			}

			if (format.modifyFilter
				&& (OCA.Onlyoffice.Permissions.ModifyFilter & extra.available) === OCA.Onlyoffice.Permissions.ModifyFilter) {
				const modifyFilter = (OCA.Onlyoffice.Permissions.ModifyFilter & extra.permissions) === OCA.Onlyoffice.Permissions.ModifyFilter
				attributes.push({
					checked: modifyFilter,
					extra: OCA.Onlyoffice.Permissions.ModifyFilter,
					label: t(OCA.Onlyoffice.AppName, 'Global filter'),
				})
			}

			return attributes
		}

		const getPermissionMenu = function() {
			const popup = document.createElement('div')
			popup.className = 'popovermenu onlyoffice-share-popup'
			popup.id = 'onlyoffice-share-popup-menu'

			const ul = document.createElement('ul')
			ul.id = '-1'
			popup.appendChild(ul)

			const appendItem = function(checked, extra, name) {
				const item = document.createElement('li')
				const span = document.createElement('span')
				span.className = 'onlyoffice-share-action'

				const input = document.createElement('input')
				input.id = 'extra-' + extra
				input.type = 'checkbox'
				input.className = 'checkbox action-checkbox__checkbox focusable'
				input.checked = checked
				input.addEventListener('click', onClickSetPermissions)

				const label = document.createElement('label')
				label.htmlFor = 'extra-' + extra
				label.textContent = name
				label.className = 'onlyoffice-share-label'

				span.appendChild(input)
				span.appendChild(label)
				item.appendChild(span)

				popup.querySelector('ul').appendChild(item)
			}

			const removeItems = function() {
				const items = popup.querySelectorAll('li')
				items.forEach(item => item.remove())
			}

			const setTargetId = function(id) {
				const ulElement = popup.querySelector('ul')
				if (ulElement) {
					ulElement.id = id
				}
			}

			el.appendChild(popup)

			return {
				isOpen() {
					return popup.style.display !== 'none' && popup.style.display !== ''
				},

				open(id, attributes, position) {
					removeItems()

					if (position) {
						popup.style.top = position.top + 'px'
					}

					attributes.forEach(attr => {
						appendItem(attr.checked, attr.extra, attr.label)
					})

					setTargetId(id)
					popup.style.display = 'block'
				},

				close() {
					removeItems()

					setTargetId(-1)
					popup.style.display = 'none'
					window.removeEventListener('click', listenOuterClicks)
				},

				refresh(attributes) {
					removeItems()

					attributes.forEach(attr => {
						appendItem(attr.checked, attr.extra, attr.label)
					})
				},

				block(value) {
					const inputs = popup.querySelectorAll('input')
					inputs.forEach(input => {
						input.disabled = value
					})
				},

				getValues() {
					const values = []

					const inputs = popup.querySelectorAll('input')
					inputs.forEach(input => {
						const extra = input.id.split('extra-')[1]
						values[extra] = input.checked
					})

					return values
				},

				getTargetId() {
					const ulElement = popup.querySelector('ul')
					return ulElement ? ulElement.id : null
				},
			}
		}

		return {
			get fileInfo() {
				return fileInfo
			},

			init(_el, _fileInfo) {
				el = _el

				getTemplate(() => {
					this.update(_fileInfo)
				})
			},

			update(_fileInfo) {
				if (customEvents === null) {
					customEvents = getCustomEvents()
					customEvents.on()
				}

				const container = getContainer()
				if (container) {
					while (container.firstChild) {
						container.removeChild(container.firstChild)
					}
				}

				fileInfo = _fileInfo

				const ext = OCA.Onlyoffice.getFileExtension(fileInfo.name)
				format = OCA.Onlyoffice.setting.formats[ext]

				OCA.Onlyoffice.GetShares(fileInfo.id, (shares) => {
					collection = shares

					render()
				})
			},

			clear() {
				el = null
				format = null
				fileInfo = null
				collection = null
				permissionsMenu = null
			},
		}
	}

	OCA.Onlyoffice.GetShares = function(fileId, callback) {
		axios.get(OC.linkToOCS('apps/' + OCA.Onlyoffice.AppName + '/api/v1/shares', 2) + fileId + '?format=json')
			.then((response) => {
				callback(response.data.ocs.data)
			})
	}

	OCA.Onlyoffice.SetShares = function(id, shareId, fileId, permissions, callback) {
		axios.put(OC.linkToOCS('apps/' + OCA.Onlyoffice.AppName + '/api/v1', 2) + 'shares?format=json', {
			extraId: id,
			shareId,
			fileId,
			permissions,
		})
			.then((response) => {
				callback(response.data.ocs.data)
			})
	}

	if (OCA.Files.Sidebar && OCA.Files.Sidebar.registerTab) {
		OCA.Files.Sidebar.registerTab(advancedTab)
	}

})(OC)
