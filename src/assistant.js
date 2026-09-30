/**
 * Markdown to HTML, for Assistant results on their way into a document.
 *
 * Language models answer in markdown, and pasting that as plain text throws away
 * headings, lists and emphasis. The editors insert HTML via
 * pluginMethod_PasteHtml, so convert here, on the Nextcloud origin, before handing
 * the result over.
 *
 * Deliberately dependency-free and escape-first: every character is escaped before
 * any markup is produced, so model output cannot inject HTML.
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
