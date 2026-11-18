<!--
  (c) Copyright Ascensio System SIA 2026

  This program is a free software product.
  You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
  (AGPL) version 3 as published by the Free Software Foundation.
  In accordance with Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
  that Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.

  This program is distributed WITHOUT ANY WARRANTY;
  without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html

  You can contact Ascensio System SIA at 20A-12 Ernesta Birznieka-Upisha street, Riga, Latvia, EU, LV-1050.

  The interactive user interfaces in modified source and object code versions of the Program
  must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.

  All the Product's GUI elements, including illustrations and icon sets, as well as technical
  writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
  See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
-->
<template>
	<div class="eurooffice-share-tab">
		<div>{{ t('eurooffice', 'Provide advanced document permissions using Nextcloud Office') }}</div>
		<ul class="eurooffice-share-container">
			<NcListItem v-for="extra in collection"
				:key="extra.share_id"
				:name="shareName(extra)"
				:force-display-actions="true">
				<template #icon>
					<div v-if="extra.type === ShareType.Link" class="eurooffice-share-link-avatar">
						<img :src="linkIcon">
					</div>
					<NcAvatar v-else
						:user="isUserShare(extra) ? extra.shareWith : undefined"
						:is-guest="!isUserShare(extra)"
						:display-name="extra.shareWith"
						:size="32"
						:disable-menu="true"
						:disable-tooltip="true"
						:show-user-status="false" />
				</template>
				<template #actions>
					<NcActionCheckbox v-for="attr in attributes(extra)"
						:key="attr.key"
						:model-value="attr.checked"
						:disabled="saving"
						@update:model-value="value => setPermission(extra, attr.key, value)">
						{{ attr.label }}
					</NcActionCheckbox>
				</template>
			</NcListItem>
		</ul>
	</div>
</template>

<script>
import axios from '@nextcloud/axios'
import { t } from '@nextcloud/l10n'
import { generateOcsUrl, imagePath } from '@nextcloud/router'
import { ShareType } from '@nextcloud/sharing'
import NcActionCheckbox from '@nextcloud/vue/components/NcActionCheckbox'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcListItem from '@nextcloud/vue/components/NcListItem'

const Permissions = {
	None: 0,
	Review: 1,
	Comment: 2,
	FillForms: 4,
	ModifyFilter: 8,
}

export default {
	name: 'ShareTab',

	components: { NcActionCheckbox, NcAvatar, NcListItem },

	props: {
		node: {
			type: Object,
			default: null,
		},
		active: {
			type: Boolean,
			default: false,
		},
	},

	data() {
		return {
			ShareType,
			collection: [],
			format: {},
			fileId: null,
			saving: false,
			linkIcon: imagePath('core', 'actions/public.svg'),
		}
	},

	watch: {
		node() {
			this.load()
		},
		active() {
			this.load()
		},
	},

	mounted() {
		this.load()
	},

	methods: {
		t,

		async load() {
			if (!this.active || !this.node || !this.node.id) {
				return
			}
			const fileId = this.node.id
			if (fileId === this.fileId) {
				return
			}
			this.fileId = fileId
			this.collection = []
			this.format = OCA.Eurooffice.setting.formats[OCA.Eurooffice.getFileExtension(this.node.basename)] || {}

			const response = await axios.get(generateOcsUrl('apps/eurooffice/api/v1/shares/{fileId}', { fileId }))
			if (this.fileId === fileId) {
				this.collection = response.data.ocs.data
			}
		},

		isUserShare(extra) {
			return extra.type !== ShareType.Link
				&& extra.type !== ShareType.Group
				&& extra.type !== ShareType.Room
		},

		shareName(extra) {
			if (extra.type === ShareType.Link) {
				return t('eurooffice', 'Share link')
			}
			if (extra.type === ShareType.Group) {
				return extra.shareWith + ' (' + t('eurooffice', 'group') + ')'
			}
			if (extra.type === ShareType.Room) {
				return extra.shareWith + ' (' + t('eurooffice', 'conversation') + ')'
			}
			return extra.shareWithName
		},

		attributes(extra) {
			const attributes = []
			const has = (value, flag) => (value & flag) === flag

			if (this.format.review && has(extra.available, Permissions.Review)) {
				attributes.push({ key: Permissions.Review, label: t('eurooffice', 'Review only'), checked: has(extra.permissions, Permissions.Review) })
			}
			if (this.format.comment && has(extra.available, Permissions.Comment)) {
				attributes.push({ key: Permissions.Comment, label: t('eurooffice', 'Comment only'), checked: has(extra.permissions, Permissions.Comment) })
			}
			if (this.format.fillForms && has(extra.available, Permissions.FillForms)) {
				attributes.push({ key: Permissions.FillForms, label: t('eurooffice', 'Form filling'), checked: has(extra.permissions, Permissions.FillForms) })
			}
			if (this.format.modifyFilter && has(extra.available, Permissions.ModifyFilter)) {
				attributes.push({ key: Permissions.ModifyFilter, label: t('eurooffice', 'Global filter'), checked: has(extra.permissions, Permissions.ModifyFilter) })
			}

			return attributes
		},

		async setPermission(extra, key, value) {
			const values = {}
			for (const flag of [Permissions.Review, Permissions.Comment, Permissions.FillForms, Permissions.ModifyFilter]) {
				values[flag] = (extra.permissions & flag) === flag
			}
			values[key] = value

			let permissions = Permissions.None
			if (values[Permissions.Review]) {
				permissions |= Permissions.Review
			}
			if (values[Permissions.Comment]
				&& (permissions & Permissions.Review) !== Permissions.Review
				&& (permissions & Permissions.ModifyFilter) !== Permissions.ModifyFilter) {
				permissions |= Permissions.Comment
			}
			if (values[Permissions.FillForms]
				&& (permissions & Permissions.Review) !== Permissions.Review) {
				permissions |= Permissions.FillForms
			}
			if (values[Permissions.ModifyFilter]
				&& (permissions & Permissions.Comment) !== Permissions.Comment) {
				permissions |= Permissions.ModifyFilter
			}

			this.saving = true
			try {
				const response = await axios.put(generateOcsUrl('apps/eurooffice/api/v1/shares'), {
					extraId: extra.id,
					shareId: extra.share_id,
					fileId: this.fileId,
					permissions,
				})
				const updated = response.data.ocs.data
				extra.id = updated.id
				extra.permissions = updated.permissions
				extra.available = updated.available
			} finally {
				this.saving = false
			}
		},
	},
}
</script>
