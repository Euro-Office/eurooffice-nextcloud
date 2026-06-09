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

/**
 * @param {object} OCA Nextcloud OCA object
 */
(function(OCA) {
	if (OCA.Eurooffice) {
		return
	}

	OCA.Eurooffice = {
		AppName: 'eurooffice',
		frameSelector: null,
		setting: {},
	}

	OCA.Eurooffice.setting = OCP.InitialState.loadState(OCA.Eurooffice.AppName, 'settings')

	const EuroofficeViewerVue = {
		name: 'EuroofficeViewerVue',
		render(createElement) {
			const self = this

			return createElement('iframe', {
				attrs: {
					id: 'euroofficeViewerFrame',
					scrolling: 'no',
					src: self.url + '&inframe=true&inviewer=true',
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
		},
		data() {
			return {
				url: OC.generateUrl('/apps/' + OCA.Eurooffice.AppName + '/{fileId}?filePath={filePath}',
					{
						fileId: this.fileid,
						filePath: this.filename,
					}),
			}
		},
	}

	if (OCA.Viewer) {
		OCA.Eurooffice.frameSelector = '#euroofficeViewerFrame'

		const mimes = Object.values(OCA.Eurooffice.setting.formats)
			.filter(format => format.def)
			.map(format => format.mime)
			.flat()
		OCA.Viewer.registerHandler({
			id: OCA.Eurooffice.AppName,
			group: null,
			mimes,
			component: EuroofficeViewerVue,
		})
	}

})(OCA)
