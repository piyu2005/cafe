// The message composer of the native chat (builder_src/chat_composer.js): the
// TipTap editor without any framework, plus DOMPurify for
// the messages it shows. Built to public/builder_assets/vendor/chat-editor.min.js
// by `yarn build:chat-editor`.
import { Editor, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import DOMPurify from 'dompurify'

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
