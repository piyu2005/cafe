// The story editor of the native /write page (builder_src/write_*.js): TipTap
// without a framework. Same document format as the old editor, so old posts open and
// the published page reads new ones: an inline <img> with alt (the caption),
// data-align, data-float and object-position, and div[data-type=image-group].
//
// TipTap loads from esm.sh as native ES modules (mentor's call — no bundler
// for it), pinned to the exact version this file was written against. esm.sh,
// not jsDelivr's `/+esm`: jsDelivr's automatic ESM conversion pulls each
// package's shared ProseMirror internals independently, so two non-identical
// copies of the same class end up loaded side by side, and the editor throws
// "Adding different instances of a keyed plugin" the moment it mounts. esm.sh
// resolves the whole dependency graph together, so there's exactly one copy.
// This file is copied as-is to public/builder_assets/vendor/write-editor.js
// by `yarn build:write-editor` and served with `type="module"`, unbundled.
import { Editor, Extension, Node, mergeAttributes } from 'https://esm.sh/@tiptap/core@3.31.3'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@3.31.3'
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@3.31.3'
import TextAlign from 'https://esm.sh/@tiptap/extension-text-align@3.31.3'
import TaskList from 'https://esm.sh/@tiptap/extension-task-list@3.31.3'
import TaskItem from 'https://esm.sh/@tiptap/extension-task-item@3.31.3'
import { Plugin, Selection } from 'https://esm.sh/@tiptap/pm@3.31.3/state'

const IMAGE_DRAG_PX = 3

function el(tag, className, text) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text) node.textContent = text
	return node
}

// Lucide icon paths (ellipsis, x, image), matching the ones blocks.py's svg()
// draws elsewhere in the app - this file is a plain copied vendor asset, not
// run through generate.py, so they're inlined here instead of shared.
const ICON_PATHS = {
	ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
	captions: '<rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
}
function icon(name) {
	const span = el('span')
	span.innerHTML =
		`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" ` +
		`stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`
	return span.firstChild
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}

function parsePosition(value) {
	const parts = String(value || '50% 50%')
		.split(' ')
		.map(parseFloat)
	return { x: Number.isNaN(parts[0]) ? 50 : parts[0], y: Number.isNaN(parts[1]) ? 50 : parts[1] }
}

// Sets the attributes of the image at `getPos()`.
function update(editor, getPos, attrs) {
	const pos = getPos()
	if (typeof pos !== 'number') return
	const node = editor.state.doc.nodeAt(pos)
	if (!node) return
	editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
}

// What an image looks like while you write: the 16:9 crop the published post
// uses, a caption line under it, and drag-to-choose which part shows.
function imageView({ node: initial, editor, getPos }) {
	let node = initial
	const dom = el('span', 'cafe-w-image')
	const box = el('span', 'cafe-w-image-box')
	const img = el('img')
	const status = el('span', 'cafe-w-image-status')
	const caption = el('input', 'cafe-w-caption')
	caption.type = 'text'
	caption.placeholder = 'Add caption'
	caption.setAttribute('aria-label', 'Media caption')
	box.appendChild(img)
	box.appendChild(status)
	dom.appendChild(box)
	dom.appendChild(caption)

	function render() {
		if (node.attrs.src) img.src = node.attrs.src
		else img.removeAttribute('src')
		img.alt = node.attrs.alt || ''
		img.style.objectPosition = node.attrs.objectPosition || ''
		dom.classList.toggle('loading', !!node.attrs.loading)
		dom.classList.toggle('failed', !!node.attrs.error)
		status.textContent = node.attrs.error ? node.attrs.error : node.attrs.loading ? 'Uploading…' : ''
		caption.hidden = !(node.attrs.alt || dom.classList.contains('caption-on')) || !!node.attrs.error
		if (document.activeElement !== caption) caption.value = node.attrs.alt || ''
	}
	render()

	caption.addEventListener('change', () => update(editor, getPos, { alt: caption.value }))
	caption.addEventListener('keydown', (event) => {
		event.stopPropagation()
		if (event.key === 'Enter') {
			event.preventDefault()
			caption.blur()
		}
		if (event.key === 'Backspace' && caption.value === '') {
			dom.classList.remove('caption-on')
			update(editor, getPos, { alt: null })
		}
	})

	// Drag inside the box to move the crop.
	let start = null
	img.addEventListener('mousedown', (event) => {
		if (node.attrs.loading || node.attrs.error) return
		event.preventDefault()
		const rect = img.getBoundingClientRect()
		start = {
			x: event.clientX,
			y: event.clientY,
			at: parsePosition(img.style.objectPosition || node.attrs.objectPosition),
			w: rect.width,
			h: rect.height,
			moved: false,
		}
		img.style.cursor = 'grabbing'
		const move = (e) => {
			const dx = e.clientX - start.x
			const dy = e.clientY - start.y
			if (!start.moved && Math.abs(dx) < IMAGE_DRAG_PX && Math.abs(dy) < IMAGE_DRAG_PX) return
			start.moved = true
			img.style.objectPosition = `${clamp(start.at.x + (dx / start.w) * 100, 0, 100)}% ${clamp(
				start.at.y + (dy / start.h) * 100,
				0,
				100
			)}%`
		}
		const up = () => {
			window.removeEventListener('mousemove', move)
			window.removeEventListener('mouseup', up)
			img.style.cursor = ''
			if (start.moved) update(editor, getPos, { objectPosition: img.style.objectPosition })
			else editor.commands.setNodeSelection(getPos())
			start = null
		}
		window.addEventListener('mousemove', move)
		window.addEventListener('mouseup', up)
	})

	// A hidden file input for "Replace image" - reuses the same upload option
	// and loading/error attrs the drag-and-drop/paste flow already has.
	const fileInput = el('input')
	fileInput.type = 'file'
	fileInput.accept = 'image/*'
	fileInput.hidden = true
	fileInput.addEventListener('change', () => {
		const file = fileInput.files && fileInput.files[0]
		fileInput.value = ''
		const upload = editor.extensionManager.extensions.find((e) => e.name === 'image').options.upload
		if (!file || !upload) return
		update(editor, getPos, { loading: true, error: null })
		upload(file).then(
			(done) => update(editor, getPos, { src: done.file_url, loading: false }),
			(error) =>
				update(editor, getPos, { loading: false, error: (error && error.message) || 'Failed to upload image' })
		)
	})
	dom.appendChild(fileInput)

	// The "..." menu: caption, replace, remove.
	function onOutsideClick(event) {
		if (!dom.contains(event.target)) closeMenu()
	}
	function closeMenu() {
		dom.classList.remove('menu-open')
		document.removeEventListener('mousedown', onOutsideClick, true)
	}
	function openMenu() {
		dom.classList.add('menu-open')
		document.addEventListener('mousedown', onOutsideClick, true)
	}
	function menuItem(name, label, onClick, danger) {
		const item = el('button', 'cafe-w-image-menu-item' + (danger ? ' danger' : ''))
		item.type = 'button'
		item.appendChild(icon(name))
		item.appendChild(el('span', null, label))
		item.addEventListener('mousedown', (event) => event.preventDefault())
		item.addEventListener('click', () => {
			closeMenu()
			onClick()
		})
		return item
	}

	const menuBtn = el('button', 'cafe-w-image-menu-btn')
	menuBtn.type = 'button'
	menuBtn.setAttribute('aria-label', 'Image options')
	menuBtn.appendChild(icon('ellipsis'))
	menuBtn.addEventListener('mousedown', (event) => event.preventDefault())
	menuBtn.addEventListener('click', () => {
		if (dom.classList.contains('menu-open')) closeMenu()
		else openMenu()
	})

	const menu = el('div', 'cafe-w-image-menu')
	menu.appendChild(
		menuItem('captions', 'Caption', () => {
			dom.classList.add('caption-on')
			render()
			caption.focus()
		})
	)
	menu.appendChild(menuItem('image', 'Replace image', () => fileInput.click()))
	menu.appendChild(
		menuItem(
			'x',
			'Remove image',
			() => {
				const pos = getPos()
				if (typeof pos !== 'number') return
				editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
			},
			true
		)
	)
	box.appendChild(menuBtn)
	box.appendChild(menu)

	return {
		dom,
		stopEvent: (event) =>
			event.target === caption ||
			!!event.target.closest('.cafe-w-image-menu-btn, .cafe-w-image-menu') ||
			(event.type === 'mousedown' && event.target === img),
		ignoreMutation: () => true,
		update(next) {
			if (next.type !== node.type) return false
			node = next
			render()
			return true
		},
		selectNode() {
			dom.classList.add('selected')
		},
		deselectNode() {
			dom.classList.remove('selected')
			closeMenu()
		},
	}
}

const UPLOAD_GAP_MS = 100

// Uploads picture files and puts them in the story, one after another.
function uploadImages(view, files, upload, at) {
	const queue = Array.from(files)
	let position = at
	function next() {
		const file = queue.shift()
		if (!file) return
		const isLast = queue.length === 0
		const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
		const type = view.state.schema.nodes.image
		const placeholder = type.create({ loading: true, uploadId })
		const pos = position == null ? view.state.selection.from : position
		view.dispatch(view.state.tr.insert(pos, placeholder))
		upload(file).then(
			(done) => {
				finish(view, uploadId, { src: done.file_url, loading: false })
				// Only after the last image of a batch - a multi-file drop/paste
				// stays contiguous, one paragraph break at the end, not one
				// between every image.
				if (isLast) placeCursorAfterImage(view, uploadId)
				position = null
				setTimeout(next, UPLOAD_GAP_MS)
			},
			(error) => {
				finish(view, uploadId, { loading: false, error: (error && error.message) || 'Failed to upload image' })
				setTimeout(next, UPLOAD_GAP_MS)
			}
		)
	}
	next()
}

// Gives the image its own line: splits its paragraph right after it (an
// empty new paragraph if the image was already the last thing there, or
// one holding whatever text followed it otherwise - split handles both the
// same way) and leaves the cursor at the start of what comes after, same as
// Medium/Notion do after inserting a block.
function placeCursorAfterImage(view, uploadId) {
	let end = null
	view.state.doc.descendants((n, pos) => {
		if (end != null || n.type.name !== 'image' || n.attrs.uploadId !== uploadId) return
		end = pos + n.nodeSize
	})
	if (end == null) return
	let tr = view.state.tr
	if (tr.doc.resolve(end).parent.type.name !== 'paragraph') return
	tr = tr.split(end)
	tr = tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(end)), 1))
	view.dispatch(tr)
	view.focus()
}

function finish(view, uploadId, attrs) {
	let done = false
	view.state.doc.descendants((n, pos) => {
		if (done || n.type.name !== 'image' || n.attrs.uploadId !== uploadId) return
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...attrs }))
		done = true
	})
}

const Image = Node.create({
	name: 'image',
	group: 'inline',
	inline: true,
	draggable: true,
	selectable: true,
	atom: true,
	addOptions() {
		return { upload: null }
	},
	addAttributes() {
		return {
			src: { default: null },
			alt: { default: null },
			title: { default: null },
			width: { default: null },
			height: { default: null },
			loading: { default: false, parseHTML: () => false, renderHTML: () => ({}) },
			uploadId: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
			error: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
			align: {
				default: 'center',
				parseHTML: (e) => {
					const value = (e.getAttribute('data-align') || e.getAttribute('align') || 'left').toLowerCase()
					return ['left', 'center', 'right'].includes(value) ? value : 'left'
				},
				renderHTML: (a) => ({ 'data-align': a.align || 'left' }),
			},
			float: {
				default: null,
				parseHTML: (e) => e.getAttribute('data-float') || null,
				renderHTML: (a) => (a.float ? { 'data-float': a.float } : {}),
			},
			objectPosition: {
				default: null,
				parseHTML: (e) => e.style.objectPosition || e.getAttribute('data-object-position') || null,
				renderHTML: (a) =>
					a.objectPosition
						? { style: `object-position: ${a.objectPosition}`, 'data-object-position': a.objectPosition }
						: {},
			},
		}
	},
	parseHTML() {
		return [{ tag: 'img[src]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return ['img', mergeAttributes(HTMLAttributes)]
	},
	addNodeView() {
		return imageView
	},
	addProseMirrorPlugins() {
		const upload = this.options.upload
		return [
			new Plugin({
				props: {
					handleDOMEvents: {
						drop: (view, event) => {
							const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []).filter(
								(f) => /image/i.test(f.type)
							)
							if (!upload || !files.length) return false
							event.preventDefault()
							const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
							uploadImages(view, files, upload, at ? at.pos : null)
							return true
						},
						paste: (view, event) => {
							const items = Array.from((event.clipboardData && event.clipboardData.items) || [])
							const files = items
								.filter((i) => i.kind === 'file' && i.type.indexOf('image/') !== -1)
								.map((i) => i.getAsFile())
								.filter(Boolean)
							if (!upload || !files.length) return false
							event.preventDefault()
							uploadImages(view, files, upload, null)
							return true
						},
					},
				},
			}),
		]
	},
	addCommands() {
		const upload = this.options.upload
		return {
			// Later, so this command's own (empty) transaction is applied first.
			uploadImages:
				(files) =>
				({ editor }) => {
					setTimeout(() => uploadImages(editor.view, files, upload, null), 0)
					return true
				},
		}
	},
})

// A row of pictures. Only read and kept here: the story shows and saves what an
// older post already has.
const ImageGroup = Node.create({
	name: 'imageGroup',
	group: 'block',
	content: 'image+',
	selectable: true,
	draggable: true,
	isolating: true,
	addAttributes() {
		return { columns: { default: 4 } }
	},
	parseHTML() {
		return [
			{
				tag: 'div[data-type="image-group"]',
				getAttrs: (e) => ({
					columns: e.getAttribute('data-columns') ? Number(e.getAttribute('data-columns')) : 4,
				}),
			},
		]
	},
	renderHTML({ HTMLAttributes, node }) {
		return [
			'div',
			mergeAttributes({ 'data-type': 'image-group', 'data-columns': node.attrs.columns }, HTMLAttributes),
			0,
		]
	},
})

// Cmd/Ctrl+Shift+V - inserts the clipboard's plain text instead of whatever
// rich formatting it carries (pasting from Word/Google Docs otherwise brings
// its fonts/colours along, which `cleanStyles`-style tools elsewhere strip
// after the fact; here nothing rich reaches the doc in the first place).
// Same plain-text-to-paragraphs shape as write_core.js's own W.ensureHtml -
// kept as its own copy rather than a cross-file dependency, since this file
// ships as a standalone vendor asset (see the module docstring above).
function plainTextToHtml(text) {
	return text
		.split(/\r?\n{2,}/)
		.map(
			(part) =>
				'<p>' +
				part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>') +
				'</p>'
		)
		.join('')
}

const PastePlainText = Extension.create({
	name: 'pastePlainText',
	addProseMirrorPlugins() {
		const editor = this.editor
		return [
			new Plugin({
				props: {
					handlePaste(view, event) {
						if (!event.shiftKey) return false
						const text = event.clipboardData && event.clipboardData.getData('text/plain')
						if (!text) return false
						event.preventDefault()
						editor.chain().focus().insertContent(plainTextToHtml(text)).run()
						return true
					},
				},
			}),
		]
	},
})

// Typing "[[" hands off to the app's own search popup (write_editor.js) rather
// than typing the query inline in the document - simpler and more robust than
// tracking a live incremental range, and avoids this vendor file (kept free
// of app-specific API calls) needing to know how to search posts itself.
const PostLinkTrigger = Extension.create({
	name: 'postLinkTrigger',
	addOptions() {
		return { onTrigger: null }
	},
	addProseMirrorPlugins() {
		const options = this.options
		return [
			new Plugin({
				props: {
					handleTextInput(view, from, to, text) {
						const { state } = view
						const before = state.doc.textBetween(Math.max(0, from - 1), from, '', '')
						if (before + text !== '[[' || !options.onTrigger) return false
						// The first "[" is already in the doc; returning true here stops
						// the second from being added too, so neither ends up typed.
						view.dispatch(state.tr.delete(from - 1, from))
						options.onTrigger(view, from - 1)
						return true
					},
				},
			}),
		]
	},
	addCommands() {
		return {
			insertPostLink:
				(pos, title, href) =>
				({ chain }) =>
					chain()
						.focus()
						.insertContentAt(pos, {
							type: 'text',
							marks: [{ type: 'link', attrs: { href } }],
							text: title,
						})
						.run(),
		}
	},
})

// Only a known-safe provider's own embed domain ever becomes an <iframe> src -
// never the pasted URL itself. What's actually stored/published is a plain
// placeholder div (see VideoEmbed.renderHTML below): frappe.sanitize_html
// doesn't allow a raw <iframe> through at all, so the published page rebuilds
// the real embed client-side (embeds.js) from this same provider+id, the
// same principle this node view already follows for its own live preview.
function parseEmbedUrl(raw) {
	let url
	try {
		url = new URL(String(raw || '').trim())
	} catch (e) {
		return null
	}
	const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
	if (host === 'youtube.com') {
		const id =
			url.pathname === '/watch'
				? url.searchParams.get('v')
				: (url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/) || [])[1]
		return id ? { provider: 'youtube', videoId: id } : null
	}
	if (host === 'youtu.be') {
		const id = url.pathname.slice(1)
		return id ? { provider: 'youtube', videoId: id } : null
	}
	if (host === 'vimeo.com' || host === 'player.vimeo.com') {
		const id = (url.pathname.match(/(\d+)/) || [])[1]
		return id ? { provider: 'vimeo', videoId: id } : null
	}
	return null
}
function embedSrc(provider, videoId) {
	if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
	if (provider === 'vimeo') return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`
	return null
}

const VideoEmbed = Node.create({
	name: 'videoEmbed',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: true,
	addAttributes() {
		return {
			provider: { default: null },
			videoId: { default: null, parseHTML: (e) => e.getAttribute('data-video-id') },
		}
	},
	parseHTML() {
		return [
			{
				tag: 'div[data-type="video-embed"]',
				getAttrs: (e) => ({
					provider: e.getAttribute('data-provider'),
					videoId: e.getAttribute('data-video-id'),
				}),
			},
		]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(
				{
					'data-type': 'video-embed',
					'data-provider': HTMLAttributes.provider,
					'data-video-id': HTMLAttributes.videoId,
				},
				{}
			),
		]
	},
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = el('div', 'cafe-w-embed')
			const src = embedSrc(node.attrs.provider, node.attrs.videoId)
			if (src) {
				const frame = el('iframe')
				frame.src = src
				frame.setAttribute(
					'allow',
					'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture'
				)
				frame.setAttribute('allowfullscreen', '')
				frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups')
				dom.appendChild(frame)
			} else {
				dom.appendChild(el('span', 'cafe-w-embed-error', "Couldn't load this embed."))
			}
			const remove = el('button', 'cafe-w-embed-remove')
			remove.type = 'button'
			remove.setAttribute('aria-label', 'Remove embed')
			remove.appendChild(icon('x'))
			remove.addEventListener('mousedown', (event) => event.preventDefault())
			remove.addEventListener('click', () => {
				const pos = getPos()
				if (typeof pos !== 'number') return
				editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
			})
			dom.appendChild(remove)
			return {
				dom,
				selectNode: () => dom.classList.add('selected'),
				deselectNode: () => dom.classList.remove('selected'),
			}
		}
	},
	addCommands() {
		return {
			insertVideoEmbed:
				(attrs) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs }),
		}
	},
})

window.CafeWriteEditor = {
	Editor,
	StarterKit,
	Placeholder,
	TextAlign,
	TaskList,
	TaskItem,
	Image,
	ImageGroup,
	PastePlainText,
	PostLinkTrigger,
	VideoEmbed,
	parseEmbedUrl,
}
