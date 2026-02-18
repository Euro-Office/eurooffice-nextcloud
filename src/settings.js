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

/* global _ */

import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { getRequestToken } from '@nextcloud/auth'
import { generateFilePath } from '@nextcloud/router'
import { defineAsyncComponent } from 'vue'
import axios from '@nextcloud/axios'

/**
 * @param {object} OC Nextcloud OCA object
 */
(function(OC) {
	// eslint-disable-next-line
	__webpack_nonce__ = btoa(getRequestToken())

	// eslint-disable-next-line
	__webpack_public_path__ = generateFilePath('onlyoffice', '', 'js/')

	document.addEventListener('DOMContentLoaded', function() {
		OCA.Onlyoffice = _.extend({}, OCA.Onlyoffice)
		if (!OCA.Onlyoffice.AppName) {
			OCA.Onlyoffice = {
				AppName: 'onlyoffice',
			}
		}

		const advToogle = function() {
			const secretPanel = document.getElementById('onlyofficeSecretPanel')
			if (secretPanel) {
				secretPanel.classList.toggle('onlyoffice-hide')
			}
			const advIcon = document.querySelector('#onlyofficeAdv .icon')
			if (advIcon) {
				advIcon.classList.toggle('icon-triangle-s')
				advIcon.classList.toggle('icon-triangle-n')
			}
		}

		const internalUrl = document.getElementById('onlyofficeInternalUrl')
		const storageUrl = document.getElementById('onlyofficeStorageUrl')
		const jwtHeader = document.getElementById('onlyofficeJwtHeader')
		if ((internalUrl && internalUrl.value.length)
			|| (storageUrl && storageUrl.value.length)
			|| (jwtHeader && jwtHeader.value.length)) {
			advToogle()
		}

		const advButton = document.getElementById('onlyofficeAdv')
		if (advButton) {
			advButton.addEventListener('click', advToogle)
		}

		const groupsCheckbox = document.getElementById('onlyofficeGroups')
		const limitGroupsSelect = document.getElementById('onlyofficeLimitGroups')
		if (groupsCheckbox && limitGroupsSelect) {
			groupsCheckbox.checked = limitGroupsSelect.value !== ''
		}

		const groupListToggle = function() {
			if (groupsCheckbox && groupsCheckbox.checked) {
				OC.Settings.setupGroupsSelect(window.$(limitGroupsSelect))
			} else if (limitGroupsSelect) {
				window.$(limitGroupsSelect).select2('destroy')
			}
		}

		if (groupsCheckbox) {
			groupsCheckbox.addEventListener('click', groupListToggle)
			groupListToggle()
		}

		const demoCheckbox = document.getElementById('onlyofficeDemo')
		const demoToggle = function() {
			const addrInputs = document.querySelectorAll('#onlyofficeAddrSettings input:not(#onlyofficeStorageUrl)')
			const isChecked = demoCheckbox && demoCheckbox.checked
			addrInputs.forEach(input => {
				input.disabled = isChecked
			})
		}

		if (demoCheckbox) {
			demoCheckbox.addEventListener('click', demoToggle)
			demoToggle()
		}

		const watermarkEnabledCheckbox = document.getElementById('onlyofficeWatermark_enabled')
		const watermarkSettings = document.getElementById('onlyofficeWatermarkSettings')
		const watermarkToggle = function() {
			if (watermarkSettings) {
				const isChecked = watermarkEnabledCheckbox && watermarkEnabledCheckbox.checked
				watermarkSettings.classList.toggle('onlyoffice-hide', !isChecked)
			}
		}

		if (watermarkEnabledCheckbox) {
			watermarkEnabledCheckbox.addEventListener('click', watermarkToggle)
		}

		const watermarkShareAll = document.getElementById('onlyofficeWatermark_shareAll')
		if (watermarkShareAll) {
			watermarkShareAll.addEventListener('click', function() {
				const watermarkShareRead = document.getElementById('onlyofficeWatermark_shareRead')
				if (watermarkShareRead && watermarkShareRead.parentElement) {
					watermarkShareRead.parentElement.classList.toggle('onlyoffice-hide')
				}
			})
		}

		const watermarkLinkAll = document.getElementById('onlyofficeWatermark_linkAll')
		if (watermarkLinkAll) {
			watermarkLinkAll.addEventListener('click', function() {
				const watermarkLinkSensitive = document.getElementById('onlyofficeWatermark_link_sensitive')
				if (watermarkLinkSensitive) {
					watermarkLinkSensitive.classList.toggle('onlyoffice-hide')
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

		const watermarkNodeBehaviour = function(watermark) {
			const watermarkListToggle = function() {
				const watermarkCheckbox = document.getElementById('onlyofficeWatermark_' + watermark)
				if (watermarkCheckbox && watermarkCheckbox.checked) {
					if (watermark.indexOf('Group') >= 0) {
						const listElement = document.getElementById('onlyofficeWatermark_' + watermark + 'List')
						OC.Settings.setupGroupsSelect(window.$(listElement))
					} else {
						window.$('#onlyofficeWatermark_' + watermark + 'List').select2({
							allowClear: true,
							closeOnSelect: false,
							multiple: true,
							separator: '|',
							toggleSelect: true,
							placeholder: t(OCA.Onlyoffice.AppName, 'Select tag'),
							query: _.debounce(function(query) {
								query.callback({
									results: OC.SystemTags.collection.filterByName(query.term),
								})
							}, 100, true),
							initSelection(element, callback) {
								const selection = (element.value || '').split('|').map(function(tagId) {
									return OC.SystemTags.collection.get(tagId)
								})
								callback(selection)
							},
							formatResult(tag) {
								return OC.SystemTags.getDescriptiveTag(tag)
							},
							formatSelection(tag) {
								return tag.get('name')
							},
							sortResults(results) {
								results.sort(function(a, b) {
									return OC.Util.naturalSortCompare(a.get('name'), b.get('name'))
								})
								return results
							},
						})
					}
				} else {
					const listElement = document.getElementById('onlyofficeWatermark_' + watermark + 'List')
					if (listElement) {
						window.$(listElement).select2('destroy')
					}
				}
			}

			const watermarkCheckbox = document.getElementById('onlyofficeWatermark_' + watermark)
			if (watermarkCheckbox) {
				watermarkCheckbox.addEventListener('click', watermarkListToggle)
				watermarkListToggle()
			}
		}

		watermarkGroupLists.forEach((watermarkGroup) => {
			watermarkNodeBehaviour(watermarkGroup)
		})

		if (OC.SystemTags && OC.SystemTags.collection) {
			OC.SystemTags.collection.fetch({
				success() {
					watermarkTagLists.forEach((watermarkTag) => {
						watermarkNodeBehaviour(watermarkTag)
					})
				},
			})
		}

		const connectionErrorEl = document.getElementById('onlyofficeSettingsState')
		const connectionError = connectionErrorEl ? connectionErrorEl.value : ''
		if (connectionError !== '') {
			OCP.Toast.error(t(OCA.Onlyoffice.AppName, 'Error when trying to connect') + ' (' + connectionError + ')')
		}

		const addrSaveButton = document.getElementById('onlyofficeAddrSave')
		if (addrSaveButton) {
			addrSaveButton.addEventListener('click', function() {
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.add('icon-loading')

				const onlyofficeUrl = (document.getElementById('onlyofficeUrl').value || '').trim()

				if (!onlyofficeUrl.length) {
					const internalUrl = document.getElementById('onlyofficeInternalUrl')
					const storageUrl = document.getElementById('onlyofficeStorageUrl')
					const secret = document.getElementById('onlyofficeSecret')
					const jwtHeader = document.getElementById('onlyofficeJwtHeader')
					if (internalUrl) internalUrl.value = ''
					if (storageUrl) storageUrl.value = ''
					if (secret) secret.value = ''
					if (jwtHeader) jwtHeader.value = ''
				}

				const onlyofficeInternalUrl = (document.getElementById('onlyofficeInternalUrl')?.value || '').trim()
				const onlyofficeStorageUrl = (document.getElementById('onlyofficeStorageUrl')?.value || '').trim()
				const verifyPeerOffCheckbox = document.getElementById('onlyofficeVerifyPeerOff')
				const onlyofficeVerifyPeerOff = verifyPeerOffCheckbox ? verifyPeerOffCheckbox.checked : false
				const onlyofficeSecret = (document.getElementById('onlyofficeSecret')?.value || '').trim()
				const jwtHeader = (document.getElementById('onlyofficeJwtHeader')?.value || '').trim()
				const demoCheckbox = document.getElementById('onlyofficeDemo')
				const demo = demoCheckbox ? demoCheckbox.checked : false

			axios.put(OC.generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/settings/address'), {
				documentserver: onlyofficeUrl,
				documentserverInternal: onlyofficeInternalUrl,
				storageUrl: onlyofficeStorageUrl,
				verifyPeerOff: onlyofficeVerifyPeerOff,
				secret: onlyofficeSecret,
				jwtHeader,
				demo,
			})
				.then((response) => {
					const section = document.querySelector('.section-onlyoffice')
					if (section) section.classList.remove('icon-loading')

					const data = response.data
					if (data && (data.documentserver != null || demo)) {
						const urlInput = document.getElementById('onlyofficeUrl')
						const internalUrlInput = document.getElementById('onlyofficeInternalUrl')
						const storageUrlInput = document.getElementById('onlyofficeStorageUrl')
						const secretInput = document.getElementById('onlyofficeSecret')
						const jwtHeaderInput = document.getElementById('onlyofficeJwtHeader')
						if (urlInput) urlInput.value = data.documentserver
						if (internalUrlInput) internalUrlInput.value = data.documentserverInternal
						if (storageUrlInput) storageUrlInput.value = data.storageUrl
						if (secretInput) secretInput.value = data.secret
						if (jwtHeaderInput) jwtHeaderInput.value = data.jwtHeader

						const toggleSections = document.querySelectorAll('.section-onlyoffice-common, .section-onlyoffice-templates, .section-onlyoffice-watermark')
						const shouldHide = (data.documentserver == null && !demo) || !!data.error.length
						toggleSections.forEach(el => el.classList.toggle('onlyoffice-hide', shouldHide))

						const versionMessage = data.version ? (' (' + t(OCA.Onlyoffice.AppName, 'version') + ' ' + data.version + ')') : ''

						if (data.error) {
							OCP.Toast.error(t(OCA.Onlyoffice.AppName, 'Error when trying to connect') + ' (' + data.error + ')' + versionMessage)
						} else {
							if (data.secret !== null) {
								OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'Server settings have been successfully updated') + versionMessage)
							} else {
								spawnDialog(defineAsyncComponent(() => import('./views/EmptyJwtInfoDialog.vue')))
							}
						}
					} else {
						const hideSections = document.querySelectorAll('.section-onlyoffice-common, .section-onlyoffice-templates, .section-onlyoffice-watermark')
						hideSections.forEach(el => el.classList.add('onlyoffice-hide'))
					}
				})
				.catch((error) => {
					const section = document.querySelector('.section-onlyoffice')
					if (section) section.classList.remove('icon-loading')
					OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to save settings'))
				})
		})
	}

	const commonSaveButton = document.getElementById('onlyofficeCommonSave')
	if (commonSaveButton) {
		commonSaveButton.addEventListener('click', function() {
			const section = document.querySelector('.section-onlyoffice')
			if (section) section.classList.add('icon-loading')

			const defFormats = {}
			document.querySelectorAll('input[id^="onlyofficeDefFormat"]').forEach(function(input) {
				defFormats[input.name] = input.checked
			})

			const editFormats = {}
			document.querySelectorAll('input[id^="onlyofficeEditFormat"]').forEach(function(input) {
				editFormats[input.name] = input.checked
			})

			const sameTab = document.getElementById('onlyofficeSameTab')?.checked || false
			const enableSharing = document.getElementById('onlyofficeEnableSharing')?.checked || false
			const preview = document.getElementById('onlyofficePreview')?.checked || false
			const advanced = document.getElementById('onlyofficeAdvanced')?.checked || false
			const cronChecker = document.getElementById('onlyofficeCronChecker')?.checked || false
			const emailNotifications = document.getElementById('onlyofficeEmailNotifications')?.checked || false
			const versionHistory = document.getElementById('onlyofficeVersionHistory')?.checked || false

			const groupsCheckbox = document.getElementById('onlyofficeGroups')
			const limitGroupsElement = document.getElementById('onlyofficeLimitGroups')
			const limitGroupsString = (groupsCheckbox?.checked && limitGroupsElement) ? limitGroupsElement.value : ''
			const limitGroups = limitGroupsString ? limitGroupsString.split('|') : []

			const chat = document.getElementById('onlyofficeChat')?.checked || false
			const compactHeader = document.getElementById('onlyofficeCompactHeader')?.checked || false
			const feedback = document.getElementById('onlyofficeFeedback')?.checked || false
			const forcesave = document.getElementById('onlyofficeForcesave')?.checked || false
			const liveViewOnShare = document.getElementById('onlyofficeLiveViewOnShare')?.checked || false
			const help = document.getElementById('onlyofficeHelp')?.checked || false
			const reviewDisplay = document.querySelector("input[type='radio'][name='reviewDisplay']:checked")?.id.replace('onlyofficeReviewDisplay_', '') || ''
			const theme = document.querySelector("input[type='radio'][name='theme']:checked")?.id.replace('onlyofficeTheme_', '') || ''
			const unknownAuthorInput = document.getElementById('onlyofficeUnknownAuthor')
			const unknownAuthor = unknownAuthorInput ? unknownAuthorInput.value.trim() : ''

			axios.put(OC.generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/settings/common'), {
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
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')
				if (response.data) {
					OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'Common settings have been successfully updated'))
				}
			})
			.catch((error) => {
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')
				OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to save settings'))
			})
		})
	}

	const securitySaveButton = document.getElementById('onlyofficeSecuritySave')
	if (securitySaveButton) {
		securitySaveButton.addEventListener('click', function() {
			const section = document.querySelector('.section-onlyoffice')
			if (section) section.classList.add('icon-loading')

			const plugins = document.getElementById('onlyofficePlugins')?.checked || false
			const macros = document.getElementById('onlyofficeMacros')?.checked || false
			const protection = document.querySelector("input[type='radio'][name='protection']:checked")?.id.replace('onlyofficeProtection_', '') || ''

			const watermarkSettings = {
				enabled: document.getElementById('onlyofficeWatermark_enabled')?.checked || false,
			}
			if (watermarkSettings.enabled) {
				const watermarkTextInput = document.getElementById('onlyofficeWatermark_text')
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
					const checkbox = document.getElementById('onlyofficeWatermark_' + watermarkLabel)
					watermarkSettings[watermarkLabel] = checkbox ? checkbox.checked : false
				})

				watermarkGroupLists.concat(watermarkTagLists).forEach((watermarkList) => {
					const checkbox = document.getElementById('onlyofficeWatermark_' + watermarkList)
					const listElement = document.getElementById('onlyofficeWatermark_' + watermarkList + 'List')
					const list = (checkbox?.checked && listElement) ? listElement.value : ''
					watermarkSettings[watermarkList + 'List'] = list ? list.split('|') : []
				})
			}

			axios.put(OC.generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/settings/security'), {
				watermarks: watermarkSettings,
				plugins,
				macros,
				protection,
			})
			.then((response) => {
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')
				if (response.data) {
					OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'Security settings have been successfully updated'))
				}
			})
			.catch((error) => {
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')
				OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to save settings'))
			})
		})
	}

	document.querySelectorAll('.section-onlyoffice-addr input').forEach((input) => {
		input.addEventListener('keypress', function(e) {
			const code = e.keyCode || e.which
			if (code === 13) {
				const addrSaveButton = document.getElementById('onlyofficeAddrSave')
				if (addrSaveButton) addrSaveButton.click()
			}
		})
	})

	const secretShowButton = document.getElementById('onlyofficeSecret-show')
	if (secretShowButton) {
		secretShowButton.addEventListener('click', function() {
			const secretInput = document.getElementById('onlyofficeSecret')
			if (secretInput) {
				if (secretInput.type === 'password') {
					secretInput.type = 'text'
				} else {
					secretInput.type = 'password'
				}
			}
		})
	}

	const clearVersionHistoryButton = document.getElementById('onlyofficeClearVersionHistory')
	if (clearVersionHistoryButton) {
		clearVersionHistoryButton.addEventListener('click', function() {
			OC.dialogs.confirm(
				t(OCA.Onlyoffice.AppName, 'Are you sure you want to clear metadata?'),
				t(OCA.Onlyoffice.AppName, 'Confirm metadata removal'),
				(clicked) => {
					if (!clicked) {
						return
					}

					const section = document.querySelector('.section-onlyoffice')
					if (section) section.classList.add('icon-loading')

					axios.delete(OC.generateUrl('apps/' + OCA.Onlyoffice.AppName + '/ajax/settings/history'))
						.then((response) => {
							const section = document.querySelector('.section-onlyoffice')
							if (section) section.classList.remove('icon-loading')
							if (response.data) {
								OCP.Toast.success(t(OCA.Onlyoffice.AppName, 'All history successfully deleted'))
							}
						},
					)
					.catch((error) => {
						const section = document.querySelector('.section-onlyoffice')
						if (section) section.classList.remove('icon-loading')
						OCP.Toast.error(error.message || t(OCA.Onlyoffice.AppName, 'Failed to clear history'))
					})
				},
			)
		})
	}

	const addTemplateInput = document.getElementById('onlyofficeAddTemplate')
	if (addTemplateInput) {
		addTemplateInput.addEventListener('change', function() {
			const file = this.files[0]
			const data = new FormData()

			data.append('file', file)

			const section = document.querySelector('.section-onlyoffice')
			if (section) section.classList.add('icon-loading')
			OCA.Onlyoffice.AddTemplate(file, (template, error) => {

				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')
				const message = error
					? t(OCA.Onlyoffice.AppName, 'Error') + ': ' + error
					: t(OCA.Onlyoffice.AppName, 'Template successfully added')

				if (error) {
					OCP.Toast.error(message)
					return
				}

				if (template) {
					OCA.Onlyoffice.AttachItemTemplate(template)
				}
				OCP.Toast.success(message)
			})
		})
	}

	document.addEventListener('click', function(event) {
		if (event.target.classList.contains('onlyoffice-template-delete')) {
			const item = event.target.closest('.onlyoffice-template-item')
			const templateId = item ? item.getAttribute('data-id') : null

			if (!templateId) return

			const section = document.querySelector('.section-onlyoffice')
			if (section) section.classList.add('icon-loading')
			OCA.Onlyoffice.DeleteTemplate(templateId, (response) => {
				const section = document.querySelector('.section-onlyoffice')
				if (section) section.classList.remove('icon-loading')

				const message = response.error
					? t(OCA.Onlyoffice.AppName, 'Error') + ': ' + response.error
					: t(OCA.Onlyoffice.AppName, 'Template successfully deleted')
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

		if (event.target.matches('.onlyoffice-template-item p')) {
			const item = event.target.closest('.onlyoffice-template-item')
			const templateId = item ? item.getAttribute('data-id') : null

			if (!templateId) return

			const url = OC.generateUrl('/apps/' + OCA.Onlyoffice.AppName + '/{fileId}?template={template}',
				{
					fileId: templateId,
					template: 'true',
				})

			window.open(url)
		}

		if (event.target.classList.contains('onlyoffice-template-download')) {
			const item = event.target.closest('.onlyoffice-template-item')
			const templateId = item ? item.getAttribute('data-id') : null

			if (!templateId) return

			const downloadLink = OC.generateUrl('apps/' + OCA.Onlyoffice.AppName + '/downloadas?fileId={fileId}&template={template}', {
				fileId: templateId,
				template: 'true',
			})

			location.href = downloadLink
		}
	})

		const sameTabCheckbox = document.getElementById('onlyofficeSameTab')
		const sharingBlock = document.getElementById('onlyofficeEnableSharingBlock')
		const sharingCheckbox = document.getElementById('onlyofficeEnableSharing')

		sameTabCheckbox.onclick = function() {
			const isChecked = sameTabCheckbox.checked
			sharingBlock.style.display = isChecked ? 'none' : 'block'
			sharingCheckbox.checked = isChecked ? sharingCheckbox.checked : false
		}
	})

})(OC)
