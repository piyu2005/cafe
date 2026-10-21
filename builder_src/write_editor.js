// The native post editor, part 2: the page you write on: status line,
// toolbar, title and story. Tags live in the Story Preview dialog now
// (write_preview.js), alongside the rest of the pre-publish metadata.
;(function () {
	'use strict'

	var W = window.CAFE.write
	var BUBBLE_GAP = 8
	var editor = null
	var dom = {}

	var MARKS = [
		['bold', 'Bold', 'toggleBold', 'bold'],
		['italic', 'Italic', 'toggleItalic', 'italic'],
		['underline', 'Underline', 'toggleUnderline', 'underline'],
		['strikethrough', 'Strikethrough', 'toggleStrike', 'strike'],
	]
	var QUOTE = ['quote', 'Blockquote', 'toggleBlockquote', 'blockquote']
	var BULLET_LIST = ['list', 'Bullet list', 'toggleBulletList', 'bulletList']
	var ORDERED_LIST = ['list-ordered', 'Numbered list', 'toggleOrderedList', 'orderedList']
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
	W.editor = function () {
		return editor
	}

	function tool(icon, label, onClick, extra) {
		var button = W.el('button', 'cafe-w-tool' + (extra && extra.label ? ' with-label' : ''))
		button.type = 'button'
		button.setAttribute('aria-label', label)
		CAFE.tooltip(button, label)
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

	// The address you type for a link. Empty removes the link. Exposed on W so
	// write_live.js can reopen it on load if a draft survived a refresh - it
	// applies to whatever the selection is when Apply is clicked, same as a
	// normal open, so there's no stale selection to restore.
	W.linkDialog = linkDialog
	function linkDialog() {
		var current = editor.getAttributes('link').href || ''
		CAFE.form({
			title: 'Link',
			persistKey: 'editor-link',
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

	// The selection toolbar: appears over a text selection, Medium-style -
	// marks, then every block-type action that reads naturally off a
	// selection (Heading, Quote, the two lists). No alignment (Cafe doesn't
	// offer it anywhere now) and no Image (that isn't a thing you do to a
	// selection - it lives in the "+" menu below instead).
	function buildBubble() {
		var bubble = W.el('div', 'cafe-w-bubble')
		bubble.hidden = true
		MARKS.forEach(function (item) {
			bubble.appendChild(toggleTool(item))
		})
		bubble.appendChild(separator())
		bubble.appendChild(
			menuTool('heading', 'Heading', headingItems(), function () {
				return editor.isActive('heading')
			})
		)
		bubble.appendChild(toggleTool(QUOTE))
		bubble.appendChild(toggleTool(BULLET_LIST))
		bubble.appendChild(toggleTool(ORDERED_LIST))
		bubble.appendChild(separator())
		bubble.appendChild(tool('link', 'Link', linkDialog))
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
		// Closing the Link dialog refocuses the editor without the selection
		// itself changing (applying a link doesn't move it) - selectionUpdate
		// only fires on an actual change, so without this the bubble stayed
		// hidden from the dialog's own blur until you made a new selection.
		editor.on('focus', place)
		editor.on('blur', function () {
			setTimeout(function () {
				if (!bubble.contains(document.activeElement)) bubble.hidden = true
			}, 100)
		})
		editor.on('update', place)
	}

	// Medium's "+": a button that floats to the left of an empty paragraph
	// (never a heading/list/quote line - same restriction Medium applies).
	// Lists moved into the selection toolbar above, so Image is the only
	// thing left here - genuinely a thing you do to an empty line, not a
	// selection - and with just the one option, the button triggers it
	// directly rather than opening a menu with a single item in it.
	function buildPlusMenu() {
		var button = tool('plus', 'Add', pickImages)
		button.classList.add('cafe-w-plus')
		button.hidden = true
		document.body.appendChild(button)
		function place() {
			var selection = editor.state.selection
			var atEmptyParagraph =
				selection.empty &&
				editor.isFocused &&
				selection.$from.depth === 1 &&
				selection.$from.parent.type.name === 'paragraph' &&
				selection.$from.parent.content.size === 0
			if (!atEmptyParagraph) {
				button.hidden = true
				return
			}
			var coords = editor.view.coordsAtPos(selection.from)
			var proseLeft = editor.view.dom.getBoundingClientRect().left
			button.hidden = false
			button.style.left = proseLeft - button.offsetWidth - 8 + 'px'
			button.style.top = (coords.top + coords.bottom) / 2 - button.offsetHeight / 2 + 'px'
		}
		editor.on('selectionUpdate', place)
		// A click that lands the cursor exactly where it already was (e.g. the
		// very first click into a brand-new, still-empty post) changes nothing,
		// so selectionUpdate never fires - focus does, and covers that case.
		editor.on('focus', place)
		editor.on('blur', function () {
			// Clicking the button itself, or an item in the menu it opens, never
			// fires this (both use mousedown preventDefault, same as the
			// bubble's own buttons) - this only catches focus leaving some other
			// way, e.g. Tab, where it has to check for real.
			setTimeout(function () {
				var active = document.activeElement
				if (active !== button && !(active && active.closest('.cafe-w-menu'))) button.hidden = true
			}, 100)
		})
		editor.on('update', place)
	}

	// Typing "[[" opens this instead of typing the query inline in the
	// document (vendor's PostLinkTrigger swallows both brackets and calls
	// W.openPostLinkSearch, assigned below - see write-editor-entry.js's own
	// comment for why). Built once, reused for every "[[".
	function buildPostLinkSearch() {
		var box = W.el('div', 'cafe-w-link-search')
		box.hidden = true
		var input = W.el('input')
		input.type = 'text'
		input.placeholder = 'Search posts…'
		input.setAttribute('aria-label', 'Search posts to link')
		var results = W.el('div', 'cafe-w-link-results')
		box.appendChild(input)
		box.appendChild(results)
		document.body.appendChild(box)

		var at = null
		var timer = null
		var request = 0

		function close() {
			box.hidden = true
			at = null
			clearTimeout(timer)
		}

		function render(posts) {
			results.replaceChildren()
			if (!posts.length) {
				results.appendChild(W.el('p', 'cafe-w-link-empty', 'No posts found.'))
				return
			}
			posts.forEach(function (post) {
				var item = W.el('button', 'cafe-w-link-option', post.display_title || post.title || 'Untitled')
				item.type = 'button'
				item.addEventListener('mousedown', function (event) {
					event.preventDefault()
				})
				item.addEventListener('click', function () {
					var pos = at
					close()
					editor
						.chain()
						.focus()
						.insertPostLink(
							pos,
							post.display_title || post.title || 'Untitled',
							'/posts/' + encodeURIComponent(post.name)
						)
						.run()
				})
				results.appendChild(item)
			})
		}

		function search(query) {
			var id = ++request
			CAFE.get('cafe.api.search_posts', { query: query }).then(
				function (posts) {
					if (id === request) render(posts || [])
				},
				function () {
					if (id === request) render([])
				}
			)
		}

		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(function () {
				search(input.value.trim())
			}, 200)
		})
		input.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				event.preventDefault()
				close()
				editor.view.focus()
			}
		})
		document.addEventListener('mousedown', function (event) {
			if (!box.hidden && !box.contains(event.target)) close()
		})

		W.openPostLinkSearch = function (view, from) {
			at = from
			var coords = view.coordsAtPos(from)
			box.hidden = false
			var width = box.offsetWidth
			box.style.left = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8)) + 'px'
			box.style.top = coords.bottom + 4 + 'px'
			input.value = ''
			render([])
			input.focus()
		}
	}

	// "@" mentions: unlike "[[" above, the query is typed live into the
	// document itself (same approach as the chat composer's own mentions,
	// chat_mentions.js) and searched on cafe.api.list_people - the same
	// endpoint the post page's own "Share" dialog already uses to find
	// people, server-side-filtered as you type rather than a client-side
	// filter over a prefetched list.
	function buildMentionSearch() {
		var box = W.el('div', 'cafe-w-mentions')
		box.hidden = true
		document.body.appendChild(box)

		var range = null
		var matches = []
		var chosen = 0
		var timer = null
		var request = 0

		function close() {
			box.hidden = true
			range = null
			matches = []
			clearTimeout(timer)
		}

		function draw() {
			box.replaceChildren()
			if (!matches.length) {
				box.appendChild(W.el('p', 'cafe-w-mention-empty', 'No people found.'))
				return
			}
			matches.forEach(function (item, i) {
				var option = W.el('button', 'cafe-w-mention-option' + (i === chosen ? ' on' : ''))
				option.type = 'button'
				option.appendChild(W.el('span', 'cafe-w-mention-label', '@' + (item.username || item.name)))
				if (item.full_name) option.appendChild(W.el('span', 'cafe-w-mention-name', item.full_name))
				option.addEventListener('mousedown', function (event) {
					event.preventDefault()
					insert(item)
				})
				box.appendChild(option)
			})
		}

		function place(pos) {
			var coords = editor.view.coordsAtPos(pos)
			box.hidden = false
			var width = box.offsetWidth || 280
			box.style.left = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8)) + 'px'
			box.style.top = coords.bottom + 4 + 'px'
		}

		function insert(item) {
			var at = range
			close()
			editor
				.chain()
				.focus()
				.insertContentAt(at, [
					{ type: 'mention', attrs: { id: item.name, label: item.username || item.name } },
					{ type: 'text', text: ' ' },
				])
				.run()
		}

		function search(query) {
			var id = ++request
			CAFE.get('cafe.api.list_people', { query: query }).then(
				function (people) {
					if (id !== request) return
					matches = people || []
					chosen = 0
					draw()
				},
				function () {
					if (id === request) {
						matches = []
						draw()
					}
				}
			)
		}

		function checkMention() {
			var selection = editor.state.selection
			if (!selection.empty) {
				close()
				return
			}
			var end = selection.from
			var before = editor.state.doc.textBetween(Math.max(0, end - 40), end, '\n', '￼')
			var found = /(^|\s)@([\w.\-]*)$/.exec(before)
			if (!found) {
				close()
				return
			}
			range = { from: end - found[2].length - 1, to: end }
			place(range.from)
			clearTimeout(timer)
			timer = setTimeout(function () {
				search(found[2])
			}, 200)
		}

		document.addEventListener('mousedown', function (event) {
			if (!box.hidden && !box.contains(event.target)) close()
		})

		W.checkMention = checkMention
		W.mentionKey = function (event) {
			if (box.hidden) return false
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault()
				if (matches.length)
					chosen = (chosen + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
				draw()
				return true
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				if (matches.length) {
					event.preventDefault()
					insert(matches[chosen])
				}
				return true
			}
			if (event.key === 'Escape') {
				close()
				return true
			}
			return false
		}
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
			form.publication = doc.publication || ''
			S.status = doc.status || 'Draft'
			S.savedAt = doc.modified ? new Date(doc.modified.replace(' ', 'T')) : null
			S.modified = doc.modified || null
			S.scheduledAt = doc.scheduled_at ? doc.scheduled_at.replace(' ', 'T') : null
		}
		dom.title.value = form.title
		// Tags themselves (the dropdown/chip widget) only exist inside the
		// Story Preview dialog now, rebuilt fresh from form.tags whenever it
		// opens - same as the publication picker already does for
		// form.publication - so there's no live widget to push a value into
		// here, just the form.tags assignment above.
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
		// Assigns W.openPostLinkSearch, read by PostLinkTrigger.configure below -
		// built before the editor so that reference is already there by the
		// time the extensions array is evaluated.
		buildPostLinkSearch()
		buildMentionSearch()
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
			// Individually listed, not M.StarterKit - no Code/CodeBlock among
			// them at all (see vendor_src/write-editor-entry.js's own comment on
			// why that file imports pieces individually instead of the kit:
			// StarterKit bundles those two unconditionally, a `code: false`
			// config only skips using them, it doesn't stop them shipping).
			// Order matches StarterKit's own internal push order, minus those two.
			extensions: [
				M.Bold,
				M.Blockquote,
				M.BulletList,
				M.DocNode,
				M.Dropcursor,
				M.Gapcursor,
				M.HardBreak,
				M.Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
				M.UndoRedo,
				M.HorizontalRule,
				M.Italic,
				M.ListItem,
				M.ListKeymap,
				M.Link.configure({ openOnClick: false, autolink: true }),
				M.OrderedList,
				M.Paragraph,
				M.Strike,
				M.TextNode,
				M.Underline,
				M.Placeholder.configure({ placeholder: 'Tell your story…' }),
				M.TextAlign.configure({ types: ['heading', 'paragraph'] }),
				M.Image.configure({ upload: W.uploadStory }),
				M.ImageGroup,
				M.Mention,
				M.PostLinkTrigger.configure({ onTrigger: W.openPostLinkSearch }),
			],
			editorProps: { attributes: { class: 'cafe-w-prose', 'aria-label': 'Story' } },
			onTransaction: function () {
				actives.forEach(function (run) {
					run()
				})
			},
		})
		editor.on('selectionUpdate', W.checkMention)
		editor.on('update', W.checkMention)
		// Capture, so the mention popup's own arrows/Enter/Escape reach it
		// before the editor's own key handling (same as chat_mentions.js).
		host.addEventListener(
			'keydown',
			function (event) {
				if (W.mentionKey(event)) event.stopPropagation()
			},
			true
		)
		dom.title = W.el('input', 'cafe-w-title')
		dom.title.type = 'text'
		dom.title.placeholder = 'Give your story a title'
		dom.title.maxLength = 140 // matches Post.title's own DB column limit
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
		dom.error = W.el('p', 'cafe-w-error')
		dom.error.hidden = true
		;[dom.status, dom.title, host, dom.error].forEach(function (node) {
			dom.form.appendChild(node)
		})
		page.appendChild(dom.loading)
		page.appendChild(dom.form)
		dom.scroll.appendChild(page)
		root.replaceChildren(dom.scroll)
		buildBubble()
		buildPlusMenu()
		setInterval(W.setStatusLine, 30000)
	}
})()
