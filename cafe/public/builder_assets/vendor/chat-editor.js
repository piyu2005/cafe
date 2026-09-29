// The message composer of the native chat (builder_src/chat_composer.js): the
// TipTap editor without any framework, plus DOMPurify for the messages it shows.
//
// TipTap and DOMPurify load from esm.sh as native ES modules (mentor's call —
// no bundler for it), pinned to the exact version this file was written
// against. esm.sh, not jsDelivr's `/+esm`: jsDelivr's automatic ESM conversion
// pulls each package's shared ProseMirror internals independently, so two
// non-identical copies of the same class end up loaded side by side, and the
// editor throws "Adding different instances of a keyed plugin" the moment it
// mounts. esm.sh resolves the whole dependency graph together, so there's
// exactly one copy. This file is copied as-is to
// public/builder_assets/vendor/chat-editor.js by `yarn build:chat-editor` and
// served with `type="module"`, unbundled.
import { Editor, Node, mergeAttributes } from 'https://esm.sh/@tiptap/core@3.31.3'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@3.31.3'
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@3.31.3'
import Highlight from 'https://esm.sh/@tiptap/extension-highlight@3.31.3'
import DOMPurify from 'https://esm.sh/dompurify@3.4.15'

// Same markup as frappe-ui's mention node: the server finds mentions by it
// (`<span class="mention" data-type="mention" data-id=...>`).
const Mention = Node.create({
	name: 'mention',
	group: 'inline',
	inline: true,
	selectable: true,
	atom: true,
	addAttributes() {
		return {
			id: {
				default: null,
				parseHTML: (e) => e.getAttribute('data-id'),
				renderHTML: (a) => (a.id ? { 'data-id': a.id } : {}),
			},
			label: {
				default: null,
				parseHTML: (e) => e.getAttribute('data-label'),
				renderHTML: (a) => (a.label ? { 'data-label': a.label } : {}),
			},
		}
	},
	parseHTML() {
		return [{ tag: 'span[data-type="mention"]' }]
	},
	renderHTML({ node, HTMLAttributes }) {
		return [
			'span',
			mergeAttributes({ class: 'mention', 'data-type': 'mention' }, HTMLAttributes),
			`@${node.attrs.label || node.attrs.id}`,
		]
	},
	renderText({ node }) {
		return `@${node.attrs.label || node.attrs.id}`
	},
})

const ALLOWED_TAGS = [
	'p',
	'br',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'a',
	'span',
	'mark',
]

window.CafeEditor = {
	Editor,
	StarterKit,
	Placeholder,
	Highlight,
	Mention,
	// A message's HTML is written by other people: only text formatting and links get through.
	sanitize(html) {
		return DOMPurify.sanitize(html || '', {
			ALLOWED_TAGS,
			ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-type', 'data-id', 'data-label'],
			ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
		})
	},
}
