/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { runOcc } from '@nextcloud/e2e-test-server/docker'
import { createRandomUser } from '@nextcloud/e2e-test-server/playwright'
import { createShare, expect, loggedInPage, test } from '../support/fixtures.mjs'

const SAMPLE_PDF = 'assets/document-templates/sample/sample.pdf'
const PDFVIEWER_FRAME = 'iframe[src*="/apps/files_pdfviewer/"]'
const EUROOFFICE_FRAME = '#euroofficeViewerFrame'

/**
 * Open a page once it reflects the PDF default set through occ, which the web
 * server may still serve from its config cache for a moment.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} path the app route to open
 * @param {boolean} pdfDefault whether Euro-Office is expected to be the PDF default
 */
async function gotoWithPdfDefault(page, path, pdfDefault) {
	await expect.poll(async () => {
		await page.goto(path)
		return page.evaluate(() => OCA.Eurooffice?.setting?.formats?.pdf?.def)
	}).toBe(pdfDefault)
}

/**
 * The id of the first Viewer handler for PDFs, which is the one the Viewer uses
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function pdfHandler(page) {
	await page.waitForFunction(() => OCA.Viewer?.availableHandlers.some((handler) => handler.id === 'pdf'))
	return page.evaluate(() => OCA.Viewer.availableHandlers.find((handler) => handler.mimes?.includes('application/pdf'))?.id)
}

/**
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name the file name
 */
async function openInFiles(page, name) {
	await page.locator(`[data-cy-files-list-row-name="${name}"] .files-list__row-name-link`).click()
}

/**
 * Assert that sample.pdf is shown in Euro-Office and not in files_pdfviewer
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function expectLoadedInEurooffice(page) {
	await expect(page.locator(EUROOFFICE_FRAME)).toBeVisible()
	await expect(page.locator(PDFVIEWER_FRAME)).toHaveCount(0)

	// The page count is only known once the document server loaded the file.
	const editor = page.frameLocator(EUROOFFICE_FRAME).frameLocator('iframe[name="frameEditor"]')
	await expect(editor.locator('#label-pages')).toHaveText('Page 1 of 7', { timeout: 60_000 })
}

/**
 * Open the actions menu of a file in the Files list
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name the file name
 */
async function openActions(page, name) {
	await page.locator(`[data-cy-files-list-row-name="${name}"]`).getByRole('button', { name: /actions/i }).click()
	return page.getByRole('menu')
}

/**
 * Share sample.pdf with a new user and open its actions menu as that user
 *
 * @param {import('@playwright/test').Page} page page of the logged in owner
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string} baseURL the base URL
 * @param {number} permissions OCS share permissions
 */
async function openSharedActions(page, browser, baseURL, permissions) {
	const recipient = await createRandomUser()
	await createShare(page, { path: '/sample.pdf', shareType: 0, shareWith: recipient.userId, permissions })

	const recipientPage = await loggedInPage(browser, baseURL, recipient)
	await gotoWithPdfDefault(recipientPage, 'apps/files/', false)
	return openActions(recipientPage, 'sample.pdf')
}

/**
 * Create a public link for a file and open it in a logged out page
 *
 * @param {import('@playwright/test').Page} page page of the logged in owner
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string} baseURL the base URL
 * @param {boolean} pdfDefault whether Euro-Office is expected to be the PDF default
 */
async function openPublicLink(page, browser, baseURL, pdfDefault) {
	const token = await createShare(page, { path: '/sample.pdf', shareType: 3 })
	const visitor = await browser.newPage({ storageState: undefined, baseURL })
	await gotoWithPdfDefault(visitor, `s/${token}`, pdfDefault)
	return visitor
}

test.describe('PDF with default settings', () => {
	test.beforeAll(async () => {
		await runOcc(['config:app:delete', 'eurooffice', 'defFormats'])
	})

	test.beforeEach(async ({ upload }) => {
		await upload(SAMPLE_PDF, 'sample.pdf')
	})

	test('opens in files_pdfviewer', async ({ page }) => {
		await gotoWithPdfDefault(page, 'apps/files/', false)
		await openInFiles(page, 'sample.pdf')

		await expect(page.locator(PDFVIEWER_FRAME)).toBeVisible()
		await expect(page.locator(EUROOFFICE_FRAME)).toHaveCount(0)
	})

	test('is handled by files_pdfviewer in Talk', async ({ page }) => {
		await gotoWithPdfDefault(page, 'apps/spreed/', false)

		expect(await pdfHandler(page)).toBe('pdf')
	})

	test('opens in files_pdfviewer from a public link', async ({ page, browser, baseURL }) => {
		const visitor = await openPublicLink(page, browser, baseURL, false)

		await expect(visitor.locator(PDFVIEWER_FRAME)).toBeVisible()
		await expect(visitor.locator(EUROOFFICE_FRAME)).toHaveCount(0)
	})

	test('offers editing in Euro-Office to the owner', async ({ page }) => {
		await gotoWithPdfDefault(page, 'apps/files/', false)

		const menu = await openActions(page, 'sample.pdf')
		await expect(menu.getByRole('menuitem', { name: 'Edit in Nextcloud Office' })).toBeVisible()
	})

	test('offers editing in Euro-Office on an editable share', async ({ page, browser, baseURL }) => {
		const menu = await openSharedActions(page, browser, baseURL, 3)

		await expect(menu.getByRole('menuitem', { name: 'Edit in Nextcloud Office' })).toBeVisible()
	})

	test('does not offer editing in Euro-Office on a read-only share', async ({ page, browser, baseURL }) => {
		const menu = await openSharedActions(page, browser, baseURL, 1)

		await expect(menu.getByRole('menuitem', { name: 'Download', exact: true })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Edit in Nextcloud Office' })).toHaveCount(0)
	})
})

test.describe('PDF enabled as Euro-Office default format', () => {
	test.beforeAll(async () => {
		await runOcc(['config:app:set', 'eurooffice', 'defFormats', '--value={"pdf":"true"}'])
	})

	test.afterAll(async () => {
		await runOcc(['config:app:delete', 'eurooffice', 'defFormats'])
	})

	test.beforeEach(async ({ upload }) => {
		await upload(SAMPLE_PDF, 'sample.pdf')
	})

	test('opens and loads in Euro-Office from Files', async ({ page }) => {
		await gotoWithPdfDefault(page, 'apps/files/', true)
		await openInFiles(page, 'sample.pdf')

		await expectLoadedInEurooffice(page)
	})

	test('is handled by Euro-Office in Talk', async ({ page }) => {
		await gotoWithPdfDefault(page, 'apps/spreed/', true)

		expect(await pdfHandler(page)).toBe('eurooffice')
	})

	test('opens and loads in Euro-Office from a public link', async ({ page, browser, baseURL }) => {
		const visitor = await openPublicLink(page, browser, baseURL, true)

		await expectLoadedInEurooffice(visitor)
	})
})
