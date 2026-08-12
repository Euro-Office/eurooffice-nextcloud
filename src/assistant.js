/**
 * Nextcloud Assistant bridge for the Euro-Office editors.
 *
 * The editor iframe cannot talk to Nextcloud directly: the TaskProcessing and
 * Reference OCS routes are user-scoped, carry no CORS headers, and the session
 * cookie does not travel cross-origin. This module runs on the Nextcloud origin
 * and performs those calls with the user's own session.
 *
 * It deliberately exposes *operations*, not URLs. The editor names an op from a
 * fixed allowlist and supplies parameters; it can never make us fetch an
 * arbitrary URL on the user's behalf.
 *
 * @copyright Copyright (c) 2026
 *
 * @license AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

/** Poll pacing. TaskProcessing is always asynchronous and offers no streaming. */
const POLL_FIRST_DELAY = 800
const POLL_MAX_DELAY = 5000
const POLL_BACKOFF = 1.5

/**
 * Hard deadline for a single task. Queue times of ~300s have been observed on
 * a loaded instance, but the editor blocks interaction while a task runs, so we
 * fail with a clear error rather than locking the document indefinitely.
 */
const TASK_DEADLINE = 180000

const TERMINAL = ['STATUS_SUCCESSFUL', 'STATUS_FAILED', 'STATUS_CANCELLED']

/** Tasks in flight, keyed by the editor's correlation id, so they can be cancelled. */
const inFlight = new Map()

const ocsConfig = {
	headers: {
		'OCS-APIRequest': 'true',
		Accept: 'application/json',
	},
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Unwrap the OCS envelope: {ocs: {meta, data}}. */
const ocsData = (response) => response?.data?.ocs?.data

/**
 * Escape text for safe inclusion in HTML.
 *
 * @param {string} s raw text
 * @return {string} escaped text
 */
function esc(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

/**
 * Convert the subset of Markdown that language models actually emit into HTML.
 *
 * This is deliberately a small, strict converter rather than a full Markdown
 * library: every character of the model's output is escaped first and we only
 * ever emit tags that we generate ourselves. Raw HTML in the model output is
 * therefore inert, which means the result needs no sanitiser and adds no
 * dependency. Anything unrecognised degrades to a plain paragraph.
 *
 * @param {string} md model output, possibly containing Markdown
 * @return {string} HTML suitable for pluginMethod_PasteHtml
 */
export function markdownToHtml(md) {
	const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n')
	const out = []
	let listType = null
	let para = []
	let inFence = false
	let fence = []

	const flushPara = () => {
		if (para.length) {
			out.push('<p>' + inline(para.join(' ')) + '</p>')
			para = []
		}
	}
	const flushList = () => {
		if (listType) {
			out.push('</' + listType + '>')
			listType = null
		}
	}

	for (const line of lines) {
		if (/^\s*```/.test(line)) {
			if (inFence) {
				out.push('<pre><code>' + esc(fence.join('\n')) + '</code></pre>')
				fence = []
				inFence = false
			} else {
				flushPara()
				flushList()
				inFence = true
			}
			continue
		}
		if (inFence) {
			fence.push(line)
			continue
		}

		const heading = line.match(/^(#{1,6})\s+(.*)$/)
		if (heading) {
			flushPara()
			flushList()
			const level = heading[1].length
			out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>')
			continue
		}

		const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
		const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
		if (bullet || numbered) {
			flushPara()
			const wanted = bullet ? 'ul' : 'ol'
			if (listType !== wanted) {
				flushList()
				out.push('<' + wanted + '>')
				listType = wanted
			}
			out.push('<li>' + inline((bullet || numbered)[1]) + '</li>')
			continue
		}

		if (/^\s*$/.test(line)) {
			flushPara()
			flushList()
			continue
		}

		flushList()
		para.push(line.trim())
	}

	if (inFence && fence.length) {
		out.push('<pre><code>' + esc(fence.join('\n')) + '</code></pre>')
	}
	flushPara()
	flushList()

	return out.join('')
}

/**
 * Inline Markdown (bold, italic, code, links) on already-escaped text.
 *
 * @param {string} text one logical line
 * @return {string} HTML fragment
 */
function inline(text) {
	let s = esc(text)
	// Code spans first so their contents are not further transformed. The
	// placeholder is a private-use code point, which cannot survive esc(),
	// so it can never collide with the model output.
	const codes = []
	s = s.replace(/`([^`]+)`/g, (_m, code) => {
		codes.push(code)
		return '\uE000' + (codes.length - 1) + '\uE000'
	})
	s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
	s = s.replace(/__([^_]+)__/g, '<b>$1</b>')
	s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
	s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<i>$2</i>')
	// Only http(s) links; the URL is already escaped, so quotes cannot break out.
	s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
	s = s.replace(/\uE000(\d+)\uE000/g, (_m, i) => '<code>' + codes[Number(i)] + '</code>')
	return s
}

/**
 * Schedule a TaskProcessing task and poll until it reaches a terminal state.
 *
 * @param {string} correlationId editor-supplied id, used for cancellation
 * @param {object} params {type, input, customId}
 * @return {Promise<object>} the task output map
 */
async function runTask(correlationId, params) {
	const { type, input, customId } = params || {}
	if (typeof type !== 'string' || !type) {
		throw new Error('run: "type" is required')
	}
	if (!input || typeof input !== 'object') {
		throw new Error('run: "input" must be an object')
	}

	const scheduled = await axios.post(
		generateOcsUrl('taskprocessing/schedule'),
		{ type, input, appId: 'eurooffice', customId: customId || '' },
		ocsConfig,
	)
	let task = ocsData(scheduled)?.task
	if (!task?.id) {
		throw new Error('run: the server did not return a task')
	}

	inFlight.set(correlationId, task.id)
	try {
		const deadline = Date.now() + TASK_DEADLINE
		let delay = POLL_FIRST_DELAY

		while (!TERMINAL.includes(task.status)) {
			if (Date.now() > deadline) {
				// Leave the task running server-side; the user can find it in the
				// Assistant. We only stop waiting on it here.
				throw new Error('The Assistant is taking too long. It is still running — check the Assistant for the result.')
			}
			await sleep(delay)
			delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_DELAY)

			if (!inFlight.has(correlationId)) {
				throw new Error('cancelled')
			}
			const polled = await axios.get(
				generateOcsUrl('taskprocessing/task/{id}', { id: task.id }),
				ocsConfig,
			)
			task = ocsData(polled)?.task ?? task
		}

		if (task.status !== 'STATUS_SUCCESSFUL') {
			throw new Error(task.userFacingErrorMessage || 'The Assistant could not complete this task.')
		}
		return { taskId: task.id, output: task.output || {} }
	} finally {
		inFlight.delete(correlationId)
	}
}

/**
 * Cancel an in-flight task, both locally and server-side.
 *
 * @param {string} correlationId the id the editor used when starting it
 * @return {Promise<object>} result marker
 */
async function cancelTask(correlationId) {
	const taskId = inFlight.get(correlationId)
	inFlight.delete(correlationId)
	if (taskId) {
		try {
			await axios.post(
				generateOcsUrl('taskprocessing/tasks/{taskId}/cancel', { taskId }),
				{},
				ocsConfig,
			)
		} catch (e) {
			console.debug('Assistant: cancelling the task failed', e)
		}
	}
	return { cancelled: true }
}

const OPS = {
	/** Which task types have a provider on this instance. */
	async taskTypes() {
		const response = await axios.get(generateOcsUrl('taskprocessing/tasktypes'), ocsConfig)
		return { types: ocsData(response)?.types ?? {} }
	},

	/** Schedule + poll one task, returning text and a formatted HTML rendering. */
	async run(params, correlationId) {
		const { taskId, output } = await runTask(correlationId, params)
		const text = typeof output.output === 'string' ? output.output : ''
		return {
			taskId,
			output,
			text,
			html: text ? markdownToHtml(text) : '',
		}
	},

	/**
	 * Abandon a running task. The id to cancel is the correlation id of the
	 * *original* run request, not of this cancel request.
	 */
	async cancel(params) {
		const targetId = params?.targetId
		if (!targetId) {
			throw new Error('cancel: "targetId" is required')
		}
		return cancelTask(targetId)
	},

	/** Turn a chosen link into a rich object we can label the insertion with. */
	async resolve(params) {
		const { url } = params || {}
		if (typeof url !== 'string' || !url) {
			throw new Error('resolve: "url" is required')
		}
		const response = await axios.get(generateOcsUrl('references/resolve'), {
			...ocsConfig,
			params: { reference: url },
		})
		return { references: ocsData(response)?.references ?? {} }
	},

	/** Fetch a task output file (e.g. a generated image) as a data URL. */
	async fetchFile(params) {
		const { taskId, fileId } = params || {}
		if (!taskId || !fileId) {
			throw new Error('fetchFile: "taskId" and "fileId" are required')
		}
		const response = await axios.get(
			generateOcsUrl('taskprocessing/tasks/{taskId}/file/{fileId}', { taskId, fileId }),
			{ ...ocsConfig, responseType: 'blob' },
		)
		const blob = response.data
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = () => reject(reader.error)
			reader.readAsDataURL(blob)
		})
		return { dataUrl, mime: blob.type }
	},
}

/**
 * Handle one editor→Nextcloud request and post the answer back to the editor.
 *
 * @param {object} request {id, op, params}
 * @param {Function} respond called with the reply envelope
 */
export async function handleAssistantRequest(request, respond) {
	const id = request?.id
	const op = request?.op
	const params = request?.params || {}

	if (!Object.prototype.hasOwnProperty.call(OPS, op)) {
		respond({ id, ok: false, error: 'Unsupported operation' })
		return
	}

	try {
		const data = await OPS[op](params, id)
		respond({ id, ok: true, data })
	} catch (error) {
		if (error?.message === 'cancelled') {
			respond({ id, ok: false, cancelled: true, error: 'Cancelled' })
			return
		}
		// Surface the server's own message when it has one; it is user-facing.
		const message = error?.response?.data?.ocs?.meta?.message
			|| error?.message
			|| 'The Assistant request failed.'
		console.debug('Assistant op failed', op, error)
		respond({ id, ok: false, error: message })
	}
}
