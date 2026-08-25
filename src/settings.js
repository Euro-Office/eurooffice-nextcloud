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

import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { createApp, defineAsyncComponent } from 'vue'
import axios from '@nextcloud/axios'

/**
 * @param {object} OC Nextcloud OCA object
 */
(function(OC) {

	document.addEventListener('DOMContentLoaded', function() {
		OCA.Eurooffice = Object.assign({}, OCA.Eurooffice)
		if (!OCA.Eurooffice.AppName) {
			OCA.Eurooffice = {
				AppName: 'eurooffice',
			}
		}

		const advToogle = function() {
			const secretPanel = document.getElementById('euroofficeSecretPanel')
			if (secretPanel) {
				secretPanel.classList.toggle('eurooffice-hide')
			}
			const advIcon = document.querySelector('#euroofficeAdv .icon')
			if (advIcon) {
				advIcon.classList.toggle('icon-triangle-s')
				advIcon.classList.toggle('icon-triangle-n')
			}
		}

		const internalUrl = document.getElementById('euroofficeInternalUrl')
		const storageUrl = document.getElementById('euroofficeStorageUrl')
		const jwtHeader = document.getElementById('euroofficeJwtHeader')
		if ((internalUrl && internalUrl.value.length)
			|| (storageUrl && storageUrl.value.length)
			|| (jwtHeader && jwtHeader.value.length)) {
			advToogle()
		}

		const advButton = document.getElementById('euroofficeAdv')
		if (advButton) {
			advButton.addEventListener('click', advToogle)
		}

		const groupsCheckbox = document.getElementById('euroofficeGroups')
		const limitGroupsSelect = document.getElementById('euroofficeLimitGroups')
		if (groupsCheckbox && limitGroupsSelect) {
			groupsCheckbox.checked = limitGroupsSelect.value !== ''
		}

		const ListPicker = defineAsyncComponent(() => import('./views/ListPicker.vue'))
		const mountedPickers = new Set()

		/**
		 * Mount a group / tag picker next to its hidden value input.
		 *
		 * @param {string} target id of the hidden input holding the value
		 * @param {string} type either 'groups' or 'tags'
		 * @param {string} label accessible label for the picker
		 */
		const mountPicker = function(target, type, label) {
			const container = document.getElementById(target + 'Picker')
			if (!container || mountedPickers.has(target)) {
				return
			}
			mountedPickers.add(target)
			createApp(ListPicker, { target, type, label }).mount(container)
		}

		const groupListToggle = function() {
			const checked = !!(groupsCheckbox && groupsCheckbox.checked)
			const container = document.getElementById('euroofficeLimitGroupsPicker')
			if (container) {
				container.classList.toggle('eurooffice-hide', !checked)
			}
			if (checked) {
				mountPicker(
					'euroofficeLimitGroups',
					'groups',
					t(OCA.Eurooffice.AppName, 'Allow the following groups to access the editors'),
				)
			}
		}

		if (groupsCheckbox) {
			groupsCheckbox.addEventListener('click', groupListToggle)
			groupListToggle()
		}

		const demoCheckbox = document.getElementById('euroofficeDemo')
		const demoToggle = function() {
			const addrInputs = document.querySelectorAll('#euroofficeAddrSettings input:not(#euroofficeStorageUrl)')
			const isChecked = demoCheckbox && demoCheckbox.checked
			addrInputs.forEach(input => {
				input.disabled = isChecked
			})
		}

		if (demoCheckbox) {
			demoCheckbox.addEventListener('click', demoToggle)
			demoToggle()
		}

		const watermarkEnabledCheckbox = document.getElementById('euroofficeWatermark_enabled')
		const watermarkSettingsEl = document.getElementById('euroofficeWatermarkSettings')
		const watermarkToggle = function() {
			if (watermarkSettingsEl) {
				const isChecked = watermarkEnabledCheckbox && watermarkEnabledCheckbox.checked
				watermarkSettingsEl.classList.toggle('eurooffice-hide', !isChecked)
			}
		}

		if (watermarkEnabledCheckbox) {
			watermarkEnabledCheckbox.addEventListener('click', watermarkToggle)
		}

		const watermarkShareAll = document.getElementById('euroofficeWatermark_shareAll')
		if (watermarkShareAll) {
			watermarkShareAll.addEventListener('click', function() {
				const watermarkShareRead = document.getElementById('euroofficeWatermark_shareRead')
				if (watermarkShareRead && watermarkShareRead.parentElement) {
					watermarkShareRead.parentElement.classList.toggle('eurooffice-hide')
				}
			})
		}

		const watermarkLinkAll = document.getElementById('euroofficeWatermark_linkAll')
		if (watermarkLinkAll) {
			watermarkLinkAll.addEventListener('click', function() {
				const watermarkLinkSensitive = document.getElementById('euroofficeWatermark_link_sensitive')
				if (watermarkLinkSensitive) {
					watermarkLinkSensitive.classList.toggle('eurooffice-hide')
				}
			})
		}

		const watermarkGroupLists = [
			'allGroups',
		]

		const watermarkTagLists = [
			'allTags',
			'linkTags',
		]

		const watermarkLabels = {
			allGroups: 'Show watermark for users of groups',
			allTags: 'Show watermark on tagged files',
			linkTags: 'Show watermark on link shares with specific system tags',
		}

		const watermarkNodeBehaviour = function(watermark) {
			const target = 'euroofficeWatermark_' + watermark + 'List'
			const type = watermark.indexOf('Group') >= 0 ? 'groups' : 'tags'
			const watermarkCheckbox = document.getElementById('euroofficeWatermark_' + watermark)

			const watermarkListToggle = function() {
				const checked = !!(watermarkCheckbox && watermarkCheckbox.checked)
				const container = document.getElementById(target + 'Picker')
				if (container) {
					container.classList.toggle('eurooffice-hide', !checked)
				}
				if (checked) {
					mountPicker(target, type, t(OCA.Eurooffice.AppName, watermarkLabels[watermark]))
				}
			}

			if (watermarkCheckbox) {
				watermarkCheckbox.addEventListener('click', watermarkListToggle)
				watermarkListToggle()
			}
		}

		watermarkGroupLists.forEach((watermarkGroup) => {
			watermarkNodeBehaviour(watermarkGroup)
		})

		// NcSelectTags loads the system tags itself, no OC.SystemTags needed.
		watermarkTagLists.forEach((watermarkTag) => {
			watermarkNodeBehaviour(watermarkTag)
		})

		const connectionErrorEl = document.getElementById('euroofficeSettingsState')
		const connectionError = connectionErrorEl ? connectionErrorEl.value : ''
		if (connectionError !== '') {
			OCP.Toast.error(t(OCA.Eurooffice.AppName, 'Error when trying to connect') + ' (' + connectionError + ')')
		}

		const addrSaveButton = document.getElementById('euroofficeAddrSave')
		if (addrSaveButton) {
			addrSaveButton.addEventListener('click', function() {
				const section = document.querySelector('.section-eurooffice')
				if (section) section.classList.add('icon-loading')

				const euroofficeUrl = (document.getElementById('euroofficeUrl')?.value || '').trim()

				if (!euroofficeUrl.length) {
					const internalUrlEl = document.getElementById('euroofficeInternalUrl')
					const storageUrlEl = document.getElementById('euroofficeStorageUrl')
					const secretEl = document.getElementById('euroofficeSecret')
					const jwtHeaderEl = document.getElementById('euroofficeJwtHeader')
					if (internalUrlEl) internalUrlEl.value = ''
					if (storageUrlEl) storageUrlEl.value = ''
					if (secretEl) secretEl.value = ''
					if (jwtHeaderEl) jwtHeaderEl.value = ''
				}

				const euroofficeInternalUrl = (document.getElementById('euroofficeInternalUrl')?.value || '').trim()
				const euroofficeStorageUrl = (document.getElementById('euroofficeStorageUrl')?.value || '').trim()
				const verifyPeerOffCheckbox = document.getElementById('euroofficeVerifyPeerOff')
				const euroofficeVerifyPeerOff = verifyPeerOffCheckbox ? verifyPeerOffCheckbox.checked : false
				const euroofficeSecret = (document.getElementById('euroofficeSecret')?.value || '').trim()
				const jwtHeaderVal = (document.getElementById('euroofficeJwtHeader')?.value || '').trim()
				const demoEl = document.getElementById('euroofficeDemo')
				const demo = demoEl ? demoEl.checked : false

				axios.put(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/settings/address'), {
					documentserver: euroofficeUrl,
					documentserverInternal: euroofficeInternalUrl,
					storageUrl: euroofficeStorageUrl,
					verifyPeerOff: euroofficeVerifyPeerOff,
					secret: euroofficeSecret,
					jwtHeader: jwtHeaderVal,
					demo,
				})
					.then((response) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')

						const data = response.data
						if (data && (data.documentserver != null || demo)) {
							const urlInput = document.getElementById('euroofficeUrl')
							const internalUrlInput = document.getElementById('euroofficeInternalUrl')
							const storageUrlInput = document.getElementById('euroofficeStorageUrl')
							const secretInput = document.getElementById('euroofficeSecret')
							const jwtHeaderInput = document.getElementById('euroofficeJwtHeader')
							if (urlInput) urlInput.value = data.documentserver
							if (internalUrlInput) internalUrlInput.value = data.documentserverInternal
							if (storageUrlInput) storageUrlInput.value = data.storageUrl
							if (secretInput) secretInput.value = data.secret
							if (jwtHeaderInput) jwtHeaderInput.value = data.jwtHeader

							const toggleSections = document.querySelectorAll('.section-eurooffice-common, .section-eurooffice-templates, .section-eurooffice-watermark')
							const shouldHide = (data.documentserver == null && !demo) || !!data.error.length
							toggleSections.forEach(el => el.classList.toggle('eurooffice-hide', shouldHide))

							const versionMessage = data.version ? (' (' + t(OCA.Eurooffice.AppName, 'version') + ' ' + data.version + ')') : ''

							if (data.error) {
								OCP.Toast.error(t(OCA.Eurooffice.AppName, 'Error when trying to connect') + ' (' + data.error + ')' + versionMessage)
							} else {
								if (data.secret !== null) {
									OCP.Toast.success(t(OCA.Eurooffice.AppName, 'Server settings have been successfully updated') + versionMessage)
								} else {
									spawnDialog(defineAsyncComponent(() => import('./views/EmptyJwtInfoDialog.vue')))
								}
							}
						} else {
							const hideSections = document.querySelectorAll('.section-eurooffice-common, .section-eurooffice-templates, .section-eurooffice-watermark')
							hideSections.forEach(el => el.classList.add('eurooffice-hide'))
						}
					})
					.catch((error) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')
						OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to save settings'))
					})
			})
		}

		const commonSaveButton = document.getElementById('euroofficeSave')
		if (commonSaveButton) {
			commonSaveButton.addEventListener('click', function() {
				const section = document.querySelector('.section-eurooffice')
				if (section) section.classList.add('icon-loading')

				const defFormats = {}
				document.querySelectorAll('input[id^="euroofficeDefFormat"]').forEach(function(input) {
					defFormats[input.name] = input.checked
				})

				const editFormats = {}
				document.querySelectorAll('input[id^="euroofficeEditFormat"]').forEach(function(input) {
					editFormats[input.name] = input.checked
				})

				const sameTab = document.getElementById('euroofficeSameTab')?.checked || false
				const enableSharing = document.getElementById('euroofficeEnableSharing')?.checked || false
				const preview = document.getElementById('euroofficePreview')?.checked || false
				const advanced = document.getElementById('euroofficeAdvanced')?.checked || false
				const cronChecker = document.getElementById('euroofficeCronChecker')?.checked || false
				const emailNotifications = document.getElementById('euroofficeEmailNotifications')?.checked || false
				const versionHistory = document.getElementById('euroofficeVersionHistory')?.checked || false

				const groupsCheckboxEl = document.getElementById('euroofficeGroups')
				const limitGroupsElement = document.getElementById('euroofficeLimitGroups')
				const limitGroupsString = (groupsCheckboxEl?.checked && limitGroupsElement) ? limitGroupsElement.value : ''
				const limitGroups = limitGroupsString ? limitGroupsString.split('|') : []

				const chat = document.getElementById('euroofficeChat')?.checked || false
				const compactHeader = document.getElementById('euroofficeCompactHeader')?.checked || false
				const feedback = document.getElementById('euroofficeFeedback')?.checked || false
				const forcesave = document.getElementById('euroofficeForcesave')?.checked || false
				const liveViewOnShare = document.getElementById('euroofficeLiveViewOnShare')?.checked || false
				const help = document.getElementById('euroofficeHelp')?.checked || false
				const reviewDisplay = document.querySelector("input[type='radio'][name='reviewDisplay']:checked")?.id.replace('euroofficeReviewDisplay_', '') || ''
				const theme = document.querySelector("input[type='radio'][name='theme']:checked")?.id.replace('euroofficeTheme_', '') || ''
				const unknownAuthorInput = document.getElementById('euroofficeUnknownAuthor')
				const unknownAuthor = unknownAuthorInput ? unknownAuthorInput.value.trim() : ''

				axios.put(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/settings/common'), {
					defFormats,
					editFormats,
					sameTab,
					enableSharing,
					preview,
					advanced,
					cronChecker,
					emailNotifications,
					versionHistory,
					limitGroups,
					chat,
					compactHeader,
					feedback,
					forcesave,
					liveViewOnShare,
					help,
					reviewDisplay,
					theme,
					unknownAuthor,
				})
					.then((response) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')
						if (response.data) {
							OCP.Toast.success(t(OCA.Eurooffice.AppName, 'Common settings have been successfully updated'))
						}
					})
					.catch((error) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')
						OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to save settings'))
					})
			})
		}

		const securitySaveButton = document.getElementById('euroofficeSecuritySave')
		if (securitySaveButton) {
			securitySaveButton.addEventListener('click', function() {
				const section = document.querySelector('.section-eurooffice')
				if (section) section.classList.add('icon-loading')

				const plugins = document.getElementById('euroofficePlugins')?.checked || false
				const macros = document.getElementById('euroofficeMacros')?.checked || false
				const protection = document.querySelector("input[type='radio'][name='protection']:checked")?.id.replace('euroofficeProtection_', '') || ''

				const watermarkSettings = {
					enabled: document.getElementById('euroofficeWatermark_enabled')?.checked || false,
				}
				if (watermarkSettings.enabled) {
					const watermarkTextInput = document.getElementById('euroofficeWatermark_text')
					watermarkSettings.text = watermarkTextInput ? watermarkTextInput.value.trim() : ''

					const watermarkLabels = [
						'allGroups',
						'allTags',
						'linkAll',
						'linkRead',
						'linkSecure',
						'linkTags',
						'shareAll',
						'shareRead',
					]
					watermarkLabels.forEach((watermarkLabel) => {
						const checkbox = document.getElementById('euroofficeWatermark_' + watermarkLabel)
						watermarkSettings[watermarkLabel] = checkbox ? checkbox.checked : false
					})

					watermarkGroupLists.concat(watermarkTagLists).forEach((watermarkList) => {
						const checkbox = document.getElementById('euroofficeWatermark_' + watermarkList)
						const listElement = document.getElementById('euroofficeWatermark_' + watermarkList + 'List')
						const list = (checkbox?.checked && listElement) ? listElement.value : ''
						watermarkSettings[watermarkList + 'List'] = list ? list.split('|') : []
					})
				}

				axios.put(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/settings/security'), {
					watermarks: watermarkSettings,
					plugins,
					macros,
					protection,
				})
					.then((response) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')
						if (response.data) {
							OCP.Toast.success(t(OCA.Eurooffice.AppName, 'Security settings have been successfully updated'))
						}
					})
					.catch((error) => {
						const sectionEl = document.querySelector('.section-eurooffice')
						if (sectionEl) sectionEl.classList.remove('icon-loading')
						OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to save settings'))
					})
			})
		}

		document.querySelectorAll('.section-eurooffice-addr input').forEach((input) => {
			input.addEventListener('keypress', function(e) {
				const code = e.keyCode || e.which
				if (code === 13) {
					const addrSaveBtn = document.getElementById('euroofficeAddrSave')
					if (addrSaveBtn) addrSaveBtn.click()
				}
			})
		})

		const secretShowButton = document.getElementById('euroofficeSecret-show')
		if (secretShowButton) {
			secretShowButton.addEventListener('click', function() {
				const secretInput = document.getElementById('euroofficeSecret')
				if (secretInput) {
					if (secretInput.type === 'password') {
						secretInput.type = 'text'
					} else {
						secretInput.type = 'password'
					}
				}
			})
		}

		const clearVersionHistoryButton = document.getElementById('euroofficeClearVersionHistory')
		if (clearVersionHistoryButton) {
			clearVersionHistoryButton.addEventListener('click', function() {
				OC.dialogs.confirm(
					t(OCA.Eurooffice.AppName, 'Are you sure you want to clear metadata?'),
					t(OCA.Eurooffice.AppName, 'Confirm metadata removal'),
					(clicked) => {
						if (!clicked) {
							return
						}

						const section = document.querySelector('.section-eurooffice')
						if (section) section.classList.add('icon-loading')

						axios.delete(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/settings/history'))
							.then((response) => {
								const sectionEl = document.querySelector('.section-eurooffice')
								if (sectionEl) sectionEl.classList.remove('icon-loading')
								if (response.data) {
									OCP.Toast.success(t(OCA.Eurooffice.AppName, 'All history successfully deleted'))
								}
							})
							.catch((error) => {
								const sectionEl = document.querySelector('.section-eurooffice')
								if (sectionEl) sectionEl.classList.remove('icon-loading')
								OCP.Toast.error(error.message || t(OCA.Eurooffice.AppName, 'Failed to clear history'))
							})
					},
				)
			})
		}

		const addTemplateInput = document.getElementById('euroofficeAddTemplate')
		if (addTemplateInput) {
			addTemplateInput.addEventListener('change', function() {
				const file = this.files[0]
				const data = new FormData()

				data.append('file', file)

				const section = document.querySelector('.section-eurooffice')
				if (section) section.classList.add('icon-loading')
				OCA.Eurooffice.AddTemplate(file, (template, error) => {

					const sectionEl = document.querySelector('.section-eurooffice')
					if (sectionEl) sectionEl.classList.remove('icon-loading')
					const message = error
						? t(OCA.Eurooffice.AppName, 'Error') + ': ' + error
						: t(OCA.Eurooffice.AppName, 'Template successfully added')

					if (error) {
						OCP.Toast.error(message)
						return
					}

					if (template) {
						OCA.Eurooffice.AttachItemTemplate(template)
					}
					OCP.Toast.success(message)
				})
			})
		}

		document.addEventListener('click', function(event) {
			if (event.target.classList.contains('eurooffice-template-delete')) {
				const item = event.target.closest('.eurooffice-template-item')
				const templateId = item ? item.getAttribute('data-id') : null

				if (!templateId) return

				const section = document.querySelector('.section-eurooffice')
				if (section) section.classList.add('icon-loading')
				OCA.Eurooffice.DeleteTemplate(templateId, (response) => {
					const sectionEl = document.querySelector('.section-eurooffice')
					if (sectionEl) sectionEl.classList.remove('icon-loading')

					const message = response.error
						? t(OCA.Eurooffice.AppName, 'Error') + ': ' + response.error
						: t(OCA.Eurooffice.AppName, 'Template successfully deleted')
					if (response.error) {
						OCP.Toast.error(message)
						return
					}

					if (item && item.parentNode) {
						item.parentNode.removeChild(item)
					}
					OCP.Toast.success(message)
				})
			}

			if (event.target.matches('.eurooffice-template-item p')) {
				const item = event.target.closest('.eurooffice-template-item')
				const templateId = item ? item.getAttribute('data-id') : null

				if (!templateId) return

				const url = OC.generateUrl('/apps/' + OCA.Eurooffice.AppName + '/{fileId}?template={template}',
					{
						fileId: templateId,
						template: 'true',
					})

				window.open(url)
			}

			if (event.target.classList.contains('eurooffice-template-download')) {
				const item = event.target.closest('.eurooffice-template-item')
				const templateId = item ? item.getAttribute('data-id') : null

				if (!templateId) return

				const downloadLink = OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/downloadas?fileId={fileId}&template={template}', {
					fileId: templateId,
					template: 'true',
				})

				location.href = downloadLink
			}
		})

		const sameTabCheckbox = document.getElementById('euroofficeSameTab')
		const sharingBlock = document.getElementById('euroofficeEnableSharingBlock')
		const sharingCheckbox = document.getElementById('euroofficeEnableSharing')

		if (sameTabCheckbox) {
			sameTabCheckbox.addEventListener('click', function() {
				const isChecked = sameTabCheckbox.checked
				if (sharingBlock) {
					sharingBlock.style.display = isChecked ? 'none' : 'block'
				}
				if (sharingCheckbox) {
					sharingCheckbox.checked = isChecked ? sharingCheckbox.checked : false
				}
			})
		}

		// Mount FontManager Vue component.
		// Recent servers move the whole server-rendered settings markup into a
		// Vue-managed container (see SettingsContentWrapper.vue in the settings
		// app), so re-resolve the mount point on the next frame and mount into
		// the node that actually ended up in the document.
		requestAnimationFrame(function() {
			const fontManagerEl = document.getElementById('eurooffice-font-manager')
			if (!fontManagerEl || fontManagerEl.dataset.euroofficeMounted === 'true') {
				return
			}
			fontManagerEl.dataset.euroofficeMounted = 'true'
			const FontManager = defineAsyncComponent(() => import('./views/FontManager.vue'))
			createApp(FontManager).mount(fontManagerEl)
		})
	})

})(OC)
