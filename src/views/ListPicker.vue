<!--
   SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
   SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="eurooffice-picker">
		<NcSelectTags
			v-if="type === 'tags'"
			:input-label="label"
			:limit="null"
			:model-value="selection"
			@update:model-value="update" />
		<NcSettingsSelectGroup
			v-else
			:label="label"
			:model-value="selection"
			@update:model-value="update" />
	</div>
</template>

<script>
import NcSelectTags from '@nextcloud/vue/components/NcSelectTags'
import NcSettingsSelectGroup from '@nextcloud/vue/components/NcSettingsSelectGroup'

/**
 * Group / system tag picker for the admin settings.
 *
 * The server-rendered settings page keeps a hidden input per list holding a
 * "|"-separated value. This component reads that input for its initial state
 * and writes back to it on every change, so the existing save handlers in
 * settings.js keep working unchanged.
 */
export default {
	name: 'ListPicker',

	components: {
		NcSelectTags,
		NcSettingsSelectGroup,
	},

	props: {
		/**
		 * id of the hidden input holding the "|"-separated value
		 */
		target: {
			type: String,
			required: true,
		},

		/**
		 * Accessible label for the picker
		 */
		label: {
			type: String,
			required: true,
		},

		/**
		 * Either 'groups' (provisioning API) or 'tags' (system tags)
		 */
		type: {
			type: String,
			default: 'groups',
			validator: (type) => ['groups', 'tags'].includes(type),
		},
	},

	data() {
		return {
			selection: [],
		}
	},

	computed: {
		input() {
			return document.getElementById(this.target)
		},
	},

	created() {
		const raw = this.input ? this.input.value : ''
		const values = raw ? raw.split('|').filter((entry) => entry !== '') : []

		// System tag ids are integers, group ids are strings.
		this.selection = this.type === 'tags'
			? values.map(Number).filter((id) => Number.isInteger(id))
			: values
	},

	methods: {
		/**
		 * Persist the selection back into the hidden input.
		 *
		 * @param {Array} value ids of the selected groups or tags
		 */
		update(value) {
			this.selection = value
			if (this.input) {
				this.input.value = value.join('|')
			}
		},
	},
}
</script>

<style scoped>
.eurooffice-picker {
	max-width: 400px;
	margin-block: 6px 16px;
	margin-inline-start: 18px;
}
</style>
