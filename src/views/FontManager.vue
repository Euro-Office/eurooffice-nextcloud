<!--
   SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
   SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="font-manager">
		<!-- Upload area -->
		<div class="font-manager__upload">
			<label class="font-manager__upload-label button" :class="{ disabled: uploading }">
				<span class="icon-upload" aria-hidden="true" />
				{{ uploading ? t('eurooffice', 'Uploading…') : t('eurooffice', 'Add font') }}
				<input
					ref="fileInput"
					type="file"
					accept=".ttf,.otf,.ttc,.woff,.woff2"
					class="hidden-visually"
					:disabled="uploading"
					@change="onFileSelected" />
			</label>

			<NcButton
				:disabled="regenerating"
				:aria-label="t('eurooffice', 'Regenerate font cache')"
				@click="triggerRegenerate">
				<template #icon>
					<span class="icon-history" aria-hidden="true" />
				</template>
				{{ regenerating ? t('eurooffice', 'Regenerating…') : t('eurooffice', 'Regenerate') }}
			</NcButton>
		</div>

		<!-- Status bar -->
		<NcNoteCard v-if="statusMessage" :type="statusType" class="font-manager__status">
			{{ statusMessage }}
		</NcNoteCard>

		<!-- Font list -->
		<div v-if="loading" class="font-manager__loading">
			<NcLoadingIcon :size="24" />
			<span>{{ t('eurooffice', 'Loading fonts…') }}</span>
		</div>

		<div v-else-if="fonts.length === 0" class="font-manager__empty">
			{{ t('eurooffice', 'No custom fonts installed. Upload TTF, OTF, TTC, WOFF or WOFF2 files to add them.') }}
		</div>

		<ul v-else class="font-manager__list">
			<li v-for="font in fonts" :key="font.name" class="font-manager__item">
				<span class="font-manager__item-icon icon-font" aria-hidden="true" />
				<span class="font-manager__item-name" :title="font.name">{{ font.name }}</span>
				<span class="font-manager__item-size">{{ formatSize(font.size) }}</span>
				<NcButton
					type="tertiary-destructive"
					:aria-label="t('eurooffice', 'Delete {name}', { name: font.name })"
					:disabled="deletingName === font.name"
					@click="deleteFont(font.name)">
					<template #icon>
						<span :class="deletingName === font.name ? 'icon-loading-small' : 'icon-delete'" aria-hidden="true" />
					</template>
				</NcButton>
			</li>
		</ul>
	</div>
</template>

<script>
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'

const POLL_INTERVAL_MS = 2000
const ALLOWED_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2'])

export default {
	name: 'FontManager',

	components: { NcButton, NcLoadingIcon, NcNoteCard },

	data() {
		return {
			fonts: [],
			loading: true,
			uploading: false,
			regenerating: false,
			deletingName: null,
			statusMessage: '',
			statusType: 'info',
		}
	},

	created() {
		// Timer handle is not reactive — declare here rather than in data()
		// to avoid Vue 3's dev-mode warning about _-prefixed properties.
		this._pollTimer = null
	},

	mounted() {
		this.loadFonts()
	},

	beforeUnmount() {
		this.stopPolling()
	},

	methods: {
		t,

		async loadFonts() {
			try {
				const res = await axios.get(generateUrl('/apps/eurooffice/ajax/fonts'))
				this.fonts = res.data.fonts || []
			} catch (e) {
				const msg = e.response?.data?.error || e.message
				this.showStatus(t('eurooffice', 'Failed to load fonts: {error}', { error: msg }), 'error')
			} finally {
				this.loading = false
			}
		},

		onFileSelected(event) {
			const file = event.target.files[0]
			if (!file) return

			const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
			if (!ALLOWED_EXTENSIONS.has(ext)) {
				this.showStatus(
					t('eurooffice', 'Unsupported file type. Please upload TTF, OTF, TTC, WOFF or WOFF2 fonts.'),
					'error',
				)
				event.target.value = ''
				return
			}

			this.uploadFont(file)
			event.target.value = ''
		},

		async uploadFont(file) {
			this.uploading = true
			this.clearStatus()
			const form = new FormData()
			form.append('font', file, file.name)
			try {
				await axios.post(generateUrl('/apps/eurooffice/ajax/fonts'), form, {
					headers: { 'Content-Type': 'multipart/form-data' },
				})
				this.showStatus(t('eurooffice', '"{name}" uploaded successfully.', { name: file.name }), 'success')
				await this.loadFonts()
			} catch (e) {
				const msg = e.response?.data?.error || e.message
				this.showStatus(t('eurooffice', 'Upload failed: {error}', { error: msg }), 'error')
			} finally {
				this.uploading = false
			}
		},

		async deleteFont(name) {
			this.deletingName = name
			this.clearStatus()
			try {
				await axios.delete(generateUrl('/apps/eurooffice/ajax/fonts/{name}', { name }))
				this.showStatus(t('eurooffice', '"{name}" deleted.', { name }), 'success')
				await this.loadFonts()
			} catch (e) {
				const msg = e.response?.data?.error || e.message
				this.showStatus(t('eurooffice', 'Delete failed: {error}', { error: msg }), 'error')
			} finally {
				this.deletingName = null
			}
		},

		async triggerRegenerate() {
			if (this.regenerating) return
			this.regenerating = true
			this.clearStatus()
			try {
				await axios.post(generateUrl('/apps/eurooffice/ajax/fonts/regenerate'))
				this.showStatus(t('eurooffice', 'Font regeneration started. This may take a moment…'), 'info')
				this.startPolling()
			} catch (e) {
				const msg = e.response?.data?.error || e.message
				this.showStatus(t('eurooffice', 'Regeneration failed: {error}', { error: msg }), 'error')
				this.regenerating = false
			}
		},

		startPolling() {
			this.stopPolling()
			this._pollTimer = setInterval(() => this.pollStatus(), POLL_INTERVAL_MS)
		},

		stopPolling() {
			if (this._pollTimer !== null) {
				clearInterval(this._pollTimer)
				this._pollTimer = null
			}
		},

		async pollStatus() {
			try {
				const res = await axios.get(generateUrl('/apps/eurooffice/ajax/fonts/status'))
				const { status, error } = res.data
				if (status === 'running') return
				this.stopPolling()
				this.regenerating = false
				if (status === 'done') {
					this.showStatus(t('eurooffice', 'Font regeneration completed successfully.'), 'success')
				} else {
					// 'error' or unexpected status (e.g. adminpanel restarted mid-regen → 'idle')
					this.showStatus(
						t('eurooffice', 'Regeneration error: {error}', { error: error || 'unknown' }),
						'error',
					)
				}
			} catch {
				// transient network error — keep polling
			}
		},

		formatSize(bytes) {
			if (bytes < 1024) return bytes + ' B'
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
			return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
		},

		showStatus(message, type = 'info') {
			this.statusMessage = message
			this.statusType = type
		},

		clearStatus() {
			this.statusMessage = ''
		},
	},
}
</script>

<style scoped lang="scss">
.font-manager {
	display: flex;
	flex-direction: column;
	gap: 12px;

	&__upload {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;

		&-label {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			cursor: pointer;

			&.disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		}
	}

	&__status {
		margin: 0;
	}

	&__loading {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-text-maxcontrast);
	}

	&__empty {
		color: var(--color-text-maxcontrast);
		font-style: italic;
	}

	&__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	&__item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid var(--color-border);

		&:last-child {
			border-bottom: none;
		}

		&-icon {
			flex-shrink: 0;
			opacity: 0.6;
		}

		&-name {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-family: monospace;
			font-size: 0.9em;
		}

		&-size {
			flex-shrink: 0;
			color: var(--color-text-maxcontrast);
			font-size: 0.85em;
			min-width: 56px;
			text-align: right;
		}
	}
}
</style>
