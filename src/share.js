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

import AppDarkSvg from '../img/app-dark.svg?raw'
import { FileType, registerSidebarTab } from '@nextcloud/files'
import { t } from '@nextcloud/l10n'
import { defineCustomElement } from 'vue'
import ShareTab from './views/ShareTab.vue'

const tagName = 'eurooffice-files-advanced-sidebar-tab'

registerSidebarTab({
	id: 'euroofficeSharingTabView',
	displayName: t('eurooffice', 'Advanced'),
	iconSvgInline: AppDarkSvg,
	tagName,
	order: 0,

	enabled({ node }) {
		if (node.type !== FileType.File) {
			return false
		}

		const ext = OCA.Eurooffice.getFileExtension(node.basename)
		const format = OCA.Eurooffice.setting.formats[ext]
		return !!(format && (format.review
			|| format.comment
			|| format.fillForms
			|| format.modifyFilter))
	},

	async onInit() {
		window.customElements.define(tagName, defineCustomElement(ShareTab, {
			shadowRoot: false,
		}))
	},
})
