// The native post editor, part 2: the page you write on: status line,
// toolbar, title, story and tags.
;(function () {
	'use strict'

	var W = window.CAFE.write
	var BUBBLE_GAP = 8
	var TAG_SUGGESTIONS = ['Design', 'UX/UI', 'Minimalism']
	var editor = null
	var dom = {}

	function splitTags(value) {
		return (value || '')
			.split(',')
			.map(function (t) {
				return t.trim()
			})
			.filter(Boolean)
	}

	function hasTag(list, value) {
		var lower = value.toLowerCase()
		return list.some(function (t) {
			return t.toLowerCase() === lower
		})
	}

	function tagChip(label, onRemove) {
		var node = W.el('span', 'cafe-w-tag-chip')
		node.appendChild(document.createTextNode(label))
		var remove = W.el('button', 'cafe-w-tag-x')
		remove.type = 'button'
		remove.setAttribute('aria-label', 'Remove ' + label)
		remove.appendChild(W.icon('x', 'cafe-w-small'))
		remove.addEventListener('click', onRemove)
		node.appendChild(remove)
		return node
	}

	// A pill + dropdown tag picker. Tags stay a comma-separated string in
	// W.state.form.tags (what the backend stores); TAG_SUGGESTIONS only
	// drives the dropdown, typing anything else and pressing Enter/, still
	// adds it as a free tag.
	function buildTags() {
		var tagList = []
		var wrap = W.el('div', 'cafe-w-tags')
		wrap.appendChild(W.el('label', '', 'Tags'))
		var box = W.el('div', 'cafe-w-tag-box')
		dom.tagChips = W.el('div', 'cafe-w-tag-chips')
		dom.tagInput = W.el('input')
		dom.tagInput.type = 'text'
		dom.tagInput.placeholder = 'Design, UX/UI, Minimalism'
		dom.tagInput.id = 'cafe-w-tags'
		dom.tagInput.autocomplete = 'off'
		wrap.firstChild.setAttribute('for', 'cafe-w-tags')
		dom.tagResults = W.el('div', 'cafe-w-tag-results')
		dom.tagResults.hidden = true

		function sync() {
			W.state.form.tags = tagList.join(', ')
		}
		function drawChips() {
			dom.tagChips.replaceChildren()
			tagList.forEach(function (label, index) {
				dom.tagChips.appendChild(
					tagChip(label, function () {
						tagList.splice(index, 1)
						drawChips()
						sync()
					})
				)
			})
		}
		function drawResults() {
			var query = dom.tagInput.value.trim().toLowerCase()
			var options = TAG_SUGGESTIONS.filter(function (name) {
				return !hasTag(tagList, name) && (!query || name.toLowerCase().indexOf(query) !== -1)
			})
			dom.tagResults.replaceChildren()
			dom.tagResults.hidden = !options.length
			options.forEach(function (name) {
				var option = W.el('button', 'cafe-w-tag-option', name)
				option.type = 'button'
				option.addEventListener('mousedown', function (event) {
					event.preventDefault()
				})
				option.addEventListener('click', function () {
					addTag(name)
					dom.tagInput.focus()
				})
				dom.tagResults.appendChild(option)
			})
		}
		function addTag(label) {
			label = (label || '').trim()
			if (label && !hasTag(tagList, label)) {
				tagList.push(label)
				sync()
			}
			drawChips()
			dom.tagInput.value = ''
			drawResults()
		}
		dom.tagInput.addEventListener('input', drawResults)
		dom.tagInput.addEventListener('focus', drawResults)
		dom.tagInput.addEventListener('blur', function () {
			dom.tagResults.hidden = true
		})
		dom.tagInput.addEventListener('keydown', function (event) {
			if (event.key === 'Enter' || event.key === ',') {
				event.preventDefault()
				addTag(dom.tagInput.value)
			} else if (event.key === 'Backspace' && !dom.tagInput.value && tagList.length) {
				tagList.pop()
				drawChips()
				sync()
			} else if (event.key === 'Escape') {
				dom.tagResults.hidden = true
			}
		})
		dom.setTags = function (value) {
			tagList = splitTags(value)
			drawChips()
		}

		box.appendChild(dom.tagChips)
		box.appendChild(dom.tagInput)
		wrap.appendChild(box)
		wrap.appendChild(dom.tagResults)
		return wrap
	}

	var MARKS = [
		['bold', 'Bold', 'toggleBold', 'bold'],
		['italic', 'Italic', 'toggleItalic', 'italic'],
		['underline', 'Underline', 'toggleUnderline', 'underline'],
		['strikethrough', 'Strikethrough', 'toggleStrike', 'strike'],
	]
	var BLOCKS = [
		['quote', 'Blockquote', 'toggleBlockquote', 'blockquote'],
		['list', 'Bullet list', 'toggleBulletList', 'bulletList'],
		['list-ordered', 'Numbered list', 'toggleOrderedList', 'orderedList'],
	]
	var HEADINGS = [
		[
			'heading-2',
			'Heading 2',
			function (c) {
				return c.toggleHeading({ level: 2 })
			},
			['heading', { level: 2 }],
		],
		[
			'heading-3',
			'Heading 3',
			function (c) {
				return c.toggleHeading({ level: 3 })
			},
			['heading', { level: 3 }],
		],
		[
			'heading-4',
			'Heading 4',
			function (c) {
				return c.toggleHeading({ level: 4 })
			},
			['heading', { level: 4 }],
		],
		[
			'pilcrow',
			'Paragraph',
			function (c) {
				return c.setParagraph()
			},
			['paragraph'],
		],
	]
	var ALIGNS = [
		['align-left', 'Align left', 'left'],
		['align-center', 'Align center', 'center'],
		['align-right', 'Align right', 'right'],
	]

	W.editor = function () {
		return editor
	}

	function tool(icon, label, onClick, extra) {
		var button = W.el('button', 'cafe-w-tool' + (extra && extra.label ? ' with-label' : ''))
		button.type = 'button'
		button.title = label
		button.setAttribute('aria-label', label)
		button.appendChild(W.icon(icon, 'cafe-w-small'))
		if (extra && extra.label) button.appendChild(W.el('span', '', extra.label))
		// Keep the cursor in the story while you press a button.
		button.addEventListener('mousedown', function (event) {
			event.preventDefault()
		})
		button.addEventListener('click', function () {
			onClick(button)
		})
		return button
	}

	function separator() {
		return W.el('span', 'cafe-w-sep')
	}

	// ---- Toolbar ----

	var actives = []

	function toggleTool(item) {
		var button = tool(item[0], item[1], function () {
			editor.chain().focus()[item[2]]().run()
		})
		actives.push(function () {
			button.classList.toggle('on', editor.isActive(item[3]))
		})
		return button
	}

	function menuTool(icon, label, items, isActive) {
		var button = tool(icon, label, function (anchor) {
			W.menu(anchor, items)
		})
		actives.push(function () {
			button.setAttribute('aria-pressed', isActive() ? 'true' : 'false')
		})
		return button
	}

	function headingItems() {
		return HEADINGS.map(function (h) {
			return {
				label: h[1],
				icon: h[0],
				active: false,
				onClick: function () {
					h[2](editor.chain().focus()).run()
				},
			}
		})
	}

	function alignItems() {
		return ALIGNS.map(function (a) {
			return {
				label: a[1],
				icon: a[0],
				onClick: function () {
					editor.chain().focus().setTextAlign(a[2]).run()
				},
			}
		})
	}

	function pickImages() {
		var input = W.el('input')
		input.type = 'file'
		input.accept = 'image/*'
		input.multiple = true
		input.addEventListener('change', function () {
			if (input.files && input.files.length) editor.commands.uploadImages(input.files)
		})
		input.click()
	}

	// The address you type for a link. Empty removes the link.
	function linkDialog() {
		var current = editor.getAttributes('link').href || ''
		CAFE.form({
			title: 'Link',
			submitLabel: 'Apply',
			values: { url: current },
			fields: [{ name: 'url', label: 'Address', required: false }],
			onSubmit: function (values) {
				var chain = editor.chain().focus()
				if (!values.url) chain.extendMarkRange('link').unsetLink().run()
				else
					chain
						.extendMarkRange('link')
						.setLink({
							href: /^(https?:|mailto:|\/)/i.test(values.url) ? values.url : 'https://' + values.url,
						})
						.run()
				return Promise.resolve()
			},
		})
	}

	function buildToolbar() {
		var bar = W.el('div', 'cafe-w-toolbar')
		MARKS.forEach(function (item) {
			bar.appendChild(toggleTool(item))
		})
		bar.appendChild(separator())
		bar.appendChild(
			menuTool('heading', 'Heading', headingItems(), function () {
				return editor.isActive('heading')
			})
		)
		BLOCKS.forEach(function (item) {
			bar.appendChild(toggleTool(item))
		})
		bar.appendChild(separator())
		bar.appendChild(
			menuTool('align-left', 'Align', alignItems(), function () {
				return ['center', 'right'].some(function (a) {
					return editor.isActive({ textAlign: a })
				})
			})
		)
		bar.appendChild(tool('image', 'Insert image', pickImages))
		bar.appendChild(tool('link', 'Link', linkDialog))
		return bar
	}

	// The little bar that floats over selected text.
	function buildBubble() {
		var bubble = W.el('div', 'cafe-w-bubble')
		bubble.hidden = true
		MARKS.forEach(function (item) {
			bubble.appendChild(toggleTool(item))
		})
		bubble.appendChild(tool('link', 'Link', linkDialog))
		bubble.appendChild(separator())
		ALIGNS.forEach(function (a) {
			bubble.appendChild(
				tool(a[0], a[1], function () {
					editor.chain().focus().setTextAlign(a[2]).run()
				})
			)
		})
		document.body.appendChild(bubble)
		function place() {
			var selection = editor.state.selection
			if (selection.empty || !editor.isFocused || selection.node) {
				bubble.hidden = true
				return
			}
			var start = editor.view.coordsAtPos(selection.from)
			var end = editor.view.coordsAtPos(selection.to)
			bubble.hidden = false
			var width = bubble.offsetWidth
			var left = (start.left + end.right) / 2 - width / 2
			bubble.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px'
			bubble.style.top = Math.max(8, start.top - bubble.offsetHeight - BUBBLE_GAP) + 'px'
		}
		editor.on('selectionUpdate', place)
		editor.on('blur', function () {
			setTimeout(function () {
				if (!bubble.contains(document.activeElement)) bubble.hidden = true
			}, 100)
		})
		editor.on('update', place)
	}

	// ---- The page ----

	W.setStatusLine = function () {
		var S = W.state
		dom.status.hidden = !S.savedAt
		if (S.savedAt) dom.status.textContent = S.status + ' · Last saved ' + W.timeAgo(S.savedAt)
	}

	W.setBusy = function (message) {
		dom.error.textContent = message || ''
		dom.error.hidden = !message
	}

	// Fills the page from a loaded post, or leaves it empty for a new one.
	W.fill = function (doc) {
		var S = W.state
		var form = S.form
		if (doc) {
			form.title = doc.title || ''
			form.post_type = doc.post_type || 'Blog'
			form.attachment = doc.attachment || ''
			form.images = (doc.images || []).map(function (row) {
				return { image: row.image }
			})
			form.cover_image = doc.cover_image || ''
			form.excerpt = doc.excerpt || ''
			form.display_title = doc.display_title || ''
			form.tags = doc.tags || ''
			S.status = doc.status || 'Draft'
			S.savedAt = doc.modified ? new Date(doc.modified.replace(' ', 'T')) : null
		}
		dom.title.value = form.title
		dom.setTags(form.tags)
		editor.commands.setContent(doc ? W.ensureHtml(doc.content) : '', false)
		dom.loading.hidden = true
		dom.form.hidden = false
		W.setStatusLine()
		dom.title.focus()
	}

	W.showLoading = function () {
		dom.loading.hidden = false
		dom.form.hidden = true
	}

	W.content = function () {
		return editor.getHTML()
	}
	W.isEmpty = function () {
		return editor.isEmpty
	}

	W.build = function (root) {
		var M = window.CafeWriteEditor
		dom.scroll = W.el('div', 'cafe-w-scroll')
		var page = W.el('div', 'cafe-w-page')
		dom.loading = W.el('div', 'cafe-w-loading')
		for (var i = 0; i < 10; i++) dom.loading.appendChild(W.el('div', 'cafe-skeleton'))
		dom.loading.hidden = true
		dom.form = W.el('div', 'cafe-w-form')
		dom.status = W.el('p', 'cafe-w-status')
		dom.status.hidden = true
		var host = W.el('div', 'cafe-w-editor')
		editor = new M.Editor({
			element: host,
			extensions: [
				M.StarterKit.configure({
					heading: { levels: [1, 2, 3, 4, 5, 6] },
					link: { openOnClick: false, autolink: true },
				}),
				M.Placeholder.configure({ placeholder: 'Tell your story…' }),
				M.TextAlign.configure({ types: ['heading', 'paragraph'] }),
				M.Image.configure({ upload: W.uploadStory }),
				M.ImageGroup,
			],
			editorProps: { attributes: { class: 'cafe-w-prose', 'aria-label': 'Story' } },
			onTransaction: function () {
				actives.forEach(function (run) {
					run()
				})
			},
		})
		dom.title = W.el('input', 'cafe-w-title')
		dom.title.type = 'text'
		dom.title.placeholder = 'Give your story a title'
		dom.title.setAttribute('aria-label', 'Title')
		dom.title.addEventListener('input', function () {
			W.state.form.title = dom.title.value
		})
		dom.title.addEventListener('keydown', function (event) {
			if (event.key === 'Enter') {
				event.preventDefault()
				editor.view.dom.focus()
				editor.chain().focus('start').run()
			}
		})
		var tags = buildTags()
		dom.error = W.el('p', 'cafe-w-error')
		dom.error.hidden = true
		;[dom.status, buildToolbar(), dom.title, host, tags, dom.error].forEach(function (node) {
			dom.form.appendChild(node)
		})
		page.appendChild(dom.loading)
		page.appendChild(dom.form)
		dom.scroll.appendChild(page)
		root.replaceChildren(dom.scroll)
		buildBubble()
		setInterval(W.setStatusLine, 30000)
	}
})()
