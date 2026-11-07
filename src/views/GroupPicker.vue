<!--
   SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
   SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div>
		<label :for="inputId" class="hidden-visually">{{ label }}</label>
		<NcSelect
			:input-id="inputId"
			:placeholder="label"
			:options="options"
			:model-value="selected"
			:filter-by="filterGroups"
			:loading="loading"
			label="displayname"
			multiple
			:close-on-select="false"
			@search="onSearch"
			@update:model-value="update" />
	</div>
</template>

<script>
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import NcSelect from '@nextcloud/vue/components/NcSelect'

let instances = 0

/**
 * Group picker backed by the app's own group search.
 *
 * NcSettingsSelectGroup queries cloud/groups/details, which Nextcloud only
 * allows for full admins and delegates of the Sharing or Users settings.
 * The app endpoint is authorized for delegates of the security settings too.
 */
export default {
	name: 'GroupPicker',

	components: {
		NcSelect,
	},

	props: {
		/**
		 * Accessible label and placeholder
		 */
		label: {
			type: String,
			required: true,
		},

		/**
		 * ids of the selected groups
		 */
		modelValue: {
			type: Array,
			default: () => [],
		},
	},

	emits: ['update:modelValue'],

	data() {
		instances++
		return {
			inputId: 'eurooffice-group-picker-' + instances,
			groups: {},
			loading: false,
			searchTimeout: null,
		}
	},

	computed: {
		selected() {
			return this.modelValue.map((id) => this.groups[id] || { id, displayname: id })
		},

		options() {
			return Object.values(this.groups).filter((group) => !this.modelValue.includes(group.id))
		},
	},

	mounted() {
		this.search('')
		// Resolve the display names of selected groups beyond the first page.
		this.modelValue.forEach((id) => this.search(id))
	},

	beforeUnmount() {
		clearTimeout(this.searchTimeout)
	},

	methods: {
		/**
		 * Load groups matching the query into the cache
		 *
		 * @param {string} query part of the group id or display name
		 */
		async search(query) {
			this.loading = true
			try {
				const response = await axios.get(generateUrl('/apps/eurooffice/ajax/settings/groups'), {
					params: { search: query },
				})
				const found = Object.fromEntries(response.data.map((group) => [group.id, group]))
				this.groups = { ...this.groups, ...found }
			} catch (error) {
				console.error('Unable to search groups', error)
			} finally {
				this.loading = false
			}
		},

		/**
		 * Debounce the search to reduce requests
		 *
		 * @param {string} query part of the group id or display name
		 */
		onSearch(query) {
			clearTimeout(this.searchTimeout)
			this.searchTimeout = setTimeout(() => this.search(query), 200)
		},

		/**
		 * Match on id and display name
		 *
		 * @param {object} option group
		 * @param {string} label display name
		 * @param {string} search current search text
		 */
		filterGroups(option, label, search) {
			return `${label || ''} ${option.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
		},

		/**
		 * @param {object[]} value selected groups
		 */
		update(value) {
			this.$emit('update:modelValue', value.map((group) => group.id))
		},
	},
}
</script>
