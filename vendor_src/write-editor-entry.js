// The story editor of the native /write page (builder_src/write_*.js): TipTap
// without a framework. Same document format as the old editor, so old posts open and
// the published page reads new ones: an inline <img> with alt (the caption),
// data-align, data-float and object-position, and div[data-type=image-group].
// Built to public/builder_assets/vendor/write-editor.min.js by `yarn build:write-editor`.
import { Editor, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { Plugin } from '@tiptap/pm/state'

const IMAGE_DRAG_PX = 3

function el(tag, className, text) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text) node.textContent = text
	return node
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
	const dom = el('span', 'mna-w-image')
	const box = el('span', 'mna-w-image-box')
	const img = el('img')
	const status = el('span', 'mna-w-image-status')
	const caption = el('input', 'mna-w-caption')
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

	// A button that turns the caption line on.
	const toggle = el('button', 'mna-w-image-caption-btn', 'Caption')
	toggle.type = 'button'
	toggle.setAttribute('aria-label', 'Toggle caption')
	toggle.addEventListener('mousedown', (event) => event.preventDefault())
	toggle.addEventListener('click', () => {
		dom.classList.add('caption-on')
		render()
		caption.focus()
	})
	box.appendChild(toggle)

	return {
		dom,
		stopEvent: (event) =>
			event.target === caption || event.target === toggle || (event.type === 'mousedown' && event.target === img),
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
		const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
		const type = view.state.schema.nodes.image
		const placeholder = type.create({ loading: true, uploadId })
		const pos = position == null ? view.state.selection.from : position
		view.dispatch(view.state.tr.insert(pos, placeholder))
		upload(file).then(
			(done) => {
				finish(view, uploadId, { src: done.file_url, loading: false })
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

window.MnaWriteEditor = { Editor, StarterKit, Placeholder, TextAlign, Image, ImageGroup }
