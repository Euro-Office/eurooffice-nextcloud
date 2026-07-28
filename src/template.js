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

import axios from '@nextcloud/axios'
import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import { defineAsyncComponent } from 'vue'

/**
 * @param {object} OC Nextcloud OCA object
 */
(function(OC) {

	OCA.Eurooffice = Object.assign({
		AppName: 'eurooffice',
		templates: null,
	}, OCA.Eurooffice)

	OCA.Eurooffice.OpenTemplatePicker = function(name, extension, type) {
		spawnDialog(
			defineAsyncComponent(() => import('./views/TemplatePickerDialog.vue')),
			{
				fileName: name + extension,
				type,
			},
		)
	}

	OCA.Eurooffice.GetTemplates = function() {
		if (OCA.Eurooffice.templates != null) {
			return
		}

		axios.get(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/template'))
			.then((response) => {
				const data = response.data
				if (data.error) {
					OC.Notification.show(data.error, {
						type: 'error',
						timeout: 3,
					})
					return
				}

				OCA.Eurooffice.templates = data
			})
			.catch((error) => {
				console.error('Eurooffice: failed to fetch templates list', error)
				OCA.Eurooffice.templates = []
			})
	}

	OCA.Eurooffice.AddTemplate = function(file, callback) {
		const data = new FormData()
		data.append('file', file)

		axios.post(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/template'), data)
			.then((response) => {
				const data = response.data
				if (data.error) {
					callback(null, data.error)
					return
				}

				callback(data, null)
			})
			.catch((error) => {
				callback(null, error.message || 'Failed to add template')
			})
	}

	OCA.Eurooffice.DeleteTemplate = function(templateId, callback) {
		axios.delete(OC.generateUrl('apps/' + OCA.Eurooffice.AppName + '/ajax/template?templateId={templateId}',
			{
				templateId,
			}))
			.then((response) => {
				if (response.data) {
					callback(response.data)
				}
			})
	}

	OCA.Eurooffice.AttachItemTemplate = function(template) {
		axios.get(OC.filePath(OCA.Eurooffice.AppName, 'templates', 'templateItem.html'))
			.then((response) => {
				const tempDiv = document.createElement('div')
				tempDiv.innerHTML = response.data
				const item = tempDiv.firstElementChild

				item.setAttribute('data-id', template.id)
				const img = item.querySelector('img')
				if (img) {
					img.setAttribute('src', template.icon)
				}
				const p = item.querySelector('p')
				if (p) {
					p.textContent = template.name
				}

				const container = document.querySelector('.eurooffice-template-container')
				if (container) {
					container.appendChild(item)
				}
			})
	}

	OCA.Eurooffice.TemplateExist = function(type) {
		const isExist = OCA.Eurooffice.templates.some((template) => {
			return template.type === type
		})

		return isExist
	}

})(OC)
