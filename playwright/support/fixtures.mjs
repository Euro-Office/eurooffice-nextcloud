/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createRandomUser, login } from '@nextcloud/e2e-test-server/playwright'
import { test as base } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/**
 * A fresh user per test, logged in, with a helper to upload a file from the
 * repository into their root folder.
 */
export const test = base.extend({
	// eslint-disable-next-line no-empty-pattern
	account: async ({}, use) => {
		await use(await createRandomUser())
	},
	page: async ({ account, browser, baseURL }, use) => {
		const page = await loggedInPage(browser, baseURL, account)
		// Cookie-authenticated DAV requests need the CSRF token.
		const { token } = await (await page.request.get('./csrftoken', { failOnStatusCode: true })).json()
		await page.context().setExtraHTTPHeaders({ requesttoken: token })
		await use(page)
		await page.close()
	},
	upload: async ({ account, page }, use) => {
		await use(async (path, target) => {
			const data = await readFile(new URL(`../../${path}`, import.meta.url))
			await page.request.put(`../remote.php/dav/files/${account.userId}/${target}`, {
				data,
				failOnStatusCode: true,
			})
		})
	},
})

/**
 * Share a file of the logged in user through the OCS API
 *
 * @param {import('@playwright/test').Page} page page of the logged in owner
 * @param {object} share OCS share parameters, e.g. `{ path, shareType, shareWith, permissions }`
 * @return {Promise<string>} the share token
 */
export async function createShare(page, share) {
	const response = await page.request.post('../ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
		headers: { 'OCS-APIREQUEST': 'true' },
		form: share,
		failOnStatusCode: true,
	})
	return (await response.json()).ocs.data.token
}

/**
 * A new page logged in as the given user
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string} baseURL the base URL
 * @param {import('@nextcloud/e2e-test-server').User} user the user to log in
 */
export async function loggedInPage(browser, baseURL, user) {
	const page = await browser.newPage({ storageState: undefined, baseURL })
	await login(page.request, user)
	return page
}

export { expect } from '@playwright/test'
