/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* global process */
/* eslint-disable no-console, n/no-process-exit */

import {
	configureNextcloud,
	docker,
	getContainer,
	runOcc,
	setSystemConfig,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/e2e-test-server/docker'

const SERVER_BRANCH = process.env.SERVER_BRANCH ?? 'stable34'
const NEXTCLOUD_PORT = 8089
const DOCUMENTSERVER_PORT = Number(process.env.DOCUMENTSERVER_PORT ?? 8099)
const DOCUMENTSERVER_IMAGE = process.env.DOCUMENTSERVER_IMAGE ?? 'ghcr.io/euro-office/documentserver:latest'
const DOCUMENTSERVER_CONTAINER = 'nextcloud-e2e-eurooffice-documentserver'
const JWT_SECRET = 'eurooffice-e2e-secret-32-characters'

async function isUp(url) {
	try {
		return (await fetch(url)).ok
	} catch {
		return false
	}
}

// Both containers only run together after a completed setup: a failed or
// interrupted one removes them again.
async function isServerRunning() {
	return await isUp(`http://127.0.0.1:${NEXTCLOUD_PORT}/status.php`)
		&& await isUp(`http://127.0.0.1:${DOCUMENTSERVER_PORT}/healthcheck`)
}

async function bridgeIp(container) {
	const { NetworkSettings } = await container.inspect()
	return NetworkSettings.Networks.bridge.IPAddress
}

async function pull(image) {
	const stream = await docker.pull(image)
	await new Promise((resolve, reject) => docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve()))
}

async function removeDocumentServer() {
	await docker.getContainer(DOCUMENTSERVER_CONTAINER).remove({ force: true }).catch(() => {})
}

// The document server downloads files from and posts callbacks to Nextcloud
// over the docker bridge; the browser loads the editor through the published port.
async function startDocumentServer() {
	console.log('Starting Euro-Office document server container… 🚀')
	await pull(DOCUMENTSERVER_IMAGE)
	await removeDocumentServer()
	const container = await docker.createContainer({
		Image: DOCUMENTSERVER_IMAGE,
		name: DOCUMENTSERVER_CONTAINER,
		Env: ['JWT_ENABLED=true', `JWT_SECRET=${JWT_SECRET}`],
		// The image does not declare the port, and Docker Engine only publishes declared ones.
		ExposedPorts: { '80/tcp': {} },
		HostConfig: {
			PortBindings: { '80/tcp': [{ HostPort: String(DOCUMENTSERVER_PORT) }] },
		},
	})
	await container.start()

	for (let tries = 0; tries < 150; tries++) {
		if (await isUp(`http://127.0.0.1:${DOCUMENTSERVER_PORT}/healthcheck`)) {
			console.log('└─ Document server is ready')
			return bridgeIp(container)
		}
		await new Promise((resolve) => setTimeout(resolve, 2000))
	}
	const logs = await container.logs({ stdout: true, stderr: true, tail: 100 })
	console.error(logs.toString())
	throw new Error('Document server did not become ready')
}

async function configureEurooffice(nextcloudIp, documentServerIp) {
	await setSystemConfig('allow_local_remote_servers', 'true')
	await runOcc(['config:system:set', 'trusted_domains', '1', `--value=${nextcloudIp}`])
	await runOcc(['config:app:set', 'eurooffice', 'DocumentServerUrl', `--value=http://localhost:${DOCUMENTSERVER_PORT}/`])
	await runOcc(['config:app:set', 'eurooffice', 'DocumentServerInternalUrl', `--value=http://${documentServerIp}/`])
	await runOcc(['config:app:set', 'eurooffice', 'StorageUrl', `--value=http://${nextcloudIp}/`])
	await runOcc(['config:app:set', 'eurooffice', 'jwt_secret', `--value=${JWT_SECRET}`])
	await runOcc(['eurooffice:documentserver', '--check'], { verbose: true, failOnError: true })
}

async function start() {
	// Never reuse a leftover Nextcloud container: it may be half configured.
	const ip = await startNextcloud(SERVER_BRANCH, true, { exposePort: NEXTCLOUD_PORT, forceRecreate: true })
	await waitOnNextcloud(ip)
	await configureNextcloud(['viewer', 'files_pdfviewer', 'spreed', 'eurooffice'], SERVER_BRANCH)

	const nextcloudIp = await bridgeIp(getContainer())
	const documentServerIp = await startDocumentServer()
	await configureEurooffice(nextcloudIp, documentServerIp)
	console.log('└─ Euro-Office e2e environment is ready')
}

// Only tear down what this process started, so an already running server
// survives a test run that merely reused it.
let started = false

async function stop(exitCode = 0) {
	if (started) {
		process.stderr.write('Stopping Nextcloud server…\n')
		await removeDocumentServer()
		await stopNextcloud()
	}
	process.exit(exitCode)
}

process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())

if (await isServerRunning()) {
	console.log('└─ Euro-Office e2e environment is ready')
} else {
	started = true
	await start().catch(async (error) => {
		console.error(error)
		await stop(1)
	})
}

// Idle to wait for shutdown
while (true) {
	await new Promise((resolve) => setTimeout(resolve, 5000))
}
