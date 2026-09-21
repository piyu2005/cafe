// The native chat, part 5: the box you write in, and sending.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var E = function () {
		return window.MnaEditor
	}
	var TYPING_EVERY_MS = 2000
	var UPLOAD_OPTIONS = { optimize: '1', max_width: '1600', max_height: '1600' }
	var editor = null
	var dom = {}
	var pending = [] // uploaded files waiting for a send
	var uploading = 0
	var sending = false
	var lastTyping = 0
	var tempSeq = 0

	// ---- The tiptap editor ----
	function makeEditor(host) {
		var M = E()
		return new M.Editor({
			element: host,
			extensions: [
				M.StarterKit.configure({
					heading: false,
					horizontalRule: false,
					link: { openOnClick: false, autolink: true },
				}),
				M.Placeholder.configure({ placeholder: 'Write a message…' }),
				M.Highlight,
				M.Mention,
			],
			editorProps: { attributes: { class: 'mna-c-prose', 'aria-label': 'Write a message' } },
			onUpdate: onType,
		})
	}

	function onType() {
		C.emit('composer-input', editor)
		var now = Date.now()
		if (!C.state.active || now - lastTyping < TYPING_EVERY_MS || editor.isEmpty) return
		lastTyping = now
		C.call('set_typing', { conversation: C.state.active }).catch(function () {})
	}

	C.editor = function () {
		return editor
	}

	function blocked() {
		return !!(C.state.conversation && C.state.conversation.is_blocked)
	}

	// ---- The reply / edit bar ----
	function renderBar() {
		var S = C.state
		dom.bar.replaceChildren()
		dom.bar.hidden = !(S.replyingTo || S.editing)
		if (dom.bar.hidden) return
		var text = C.el('div', 'mna-c-bar-text')
		text.appendChild(
			C.el('div', 'mna-c-bar-title', S.editing ? 'Editing message' : 'Replying to ' + S.replyingTo.sender_name)
		)
		if (S.replyingTo) text.appendChild(C.el('div', 'mna-c-bar-preview', C.previewText(S.replyingTo)))
		var close = C.el('button', 'mna-c-icon-btn')
		close.type = 'button'
		close.setAttribute('aria-label', S.editing ? 'Cancel edit' : 'Cancel reply')
		close.appendChild(C.icon('x', 'mna-c-tiny'))
		close.addEventListener('click', function () {
			S.editing ? C.cancelEdit() : C.cancelReply()
		})
		dom.bar.appendChild(text)
		dom.bar.appendChild(close)
	}

	C.startReply = function (m) {
		C.state.editing = null
		C.state.replyingTo = m
		renderBar()
		renderTools()
		editor.commands.focus()
	}
	C.cancelReply = function () {
		C.state.replyingTo = null
		renderBar()
	}

	C.startEdit = function (m) {
		C.state.replyingTo = null
		C.state.editing = m
		editor.commands.setContent(m.content || '')
		renderBar()
		renderTools()
		editor.commands.focus('end')
	}
	C.cancelEdit = function () {
		C.state.editing = null
		editor.commands.clearContent()
		renderBar()
		renderTools()
	}

	// ---- Files waiting to be sent ----
	function renderPending() {
		dom.files.replaceChildren()
		dom.files.hidden = !pending.length
		pending.forEach(function (a, i) {
			var card = C.el('div', 'mna-c-pending')
			if (C.isImageFile(a.file_name)) {
				var img = C.el('img', 'mna-c-pending-thumb')
				img.src = a.file_url
				img.alt = ''
				card.appendChild(img)
			} else {
				var round = C.el('div', 'mna-c-pending-thumb file')
				round.appendChild(C.icon('file', 'mna-c-tiny'))
				card.appendChild(round)
			}
			var info = C.el('div', 'mna-c-pending-info')
			info.appendChild(C.el('div', 'mna-c-pending-name', a.file_name))
			info.appendChild(C.el('div', 'mna-c-pending-size', C.formatBytes(a.file_size)))
			var remove = C.el('button', 'mna-c-icon-btn')
			remove.type = 'button'
			remove.setAttribute('aria-label', 'Remove ' + a.file_name)
			remove.appendChild(C.icon('trash-2', 'mna-c-tiny'))
			remove.addEventListener('click', function () {
				pending.splice(i, 1)
				renderPending()
			})
			card.appendChild(info)
			card.appendChild(remove)
			dom.files.appendChild(card)
		})
	}

	function upload(file) {
		var form = new FormData()
		form.append('file', file, file.name)
		form.append('is_private', '1')
		Object.keys(UPLOAD_OPTIONS).forEach(function (key) {
			form.append(key, UPLOAD_OPTIONS[key])
		})
		return fetch(location.origin + '/api/method/upload_file', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-Frappe-CSRF-Token': (window.frappe && window.frappe.csrf_token) || '' },
			body: form,
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {}
				})
				.then(function (body) {
					if (!response.ok || !body.message) throw new Error('Error uploading ' + file.name)
					var doc = body.message
					return { file_url: doc.file_url, file_name: doc.file_name, file_size: doc.file_size }
				})
		})
	}

	// One at a time, so a slow file doesn't fail the rest.
	function attach(files) {
		var queue = Array.prototype.slice.call(files)
		uploading++
		renderTools()
		queue
			.reduce(function (chain, file) {
				return chain.then(function () {
					return upload(file).then(
						function (doc) {
							pending.push(doc)
							renderPending()
						},
						function (error) {
							MNA.toast(error.message)
						}
					)
				})
			}, Promise.resolve())
			.then(function () {
				uploading--
				renderTools()
			})
	}

	// ---- Sending ----
	function optimistic(content, attachments, replyTo) {
		tempSeq++
		return {
			name: 'temp-' + Date.now() + '-' + tempSeq,
			sender: C.me,
			sender_name: null,
			sender_image: null,
			content: content,
			reply_to: replyTo ? replyTo.name : null,
			reply_to_preview: replyTo
				? {
						name: replyTo.name,
						sender_name: replyTo.sender_name,
						content: C.previewText(replyTo),
						is_deleted: replyTo.is_deleted ? 1 : 0,
				  }
				: null,
			is_edited: 0,
			is_deleted: 0,
			attachments: attachments,
			shared_post: null,
			poll: null,
			poll_data: null,
			link_url: null,
			link_title: null,
			link_description: null,
			link_image: null,
			creation: new Date().toISOString(),
			reactions: [],
		}
	}

	function replaceMessage(tempName, real) {
		var list = C.state.messages
		for (var i = 0; i < list.length; i++) {
			if (list[i].name === tempName) {
				if (real) list[i] = real
				else list.splice(i, 1)
				break
			}
		}
		C.renderMessages()
	}

	function send() {
		var S = C.state
		if (!S.active || blocked() || sending) return
		if (S.editing) return saveEdit()
		if (uploading) return
		var empty = editor.isEmpty
		if (empty && !pending.length) return
		var content = empty ? null : editor.getHTML()
		var attachments = pending.slice()
		var replyTo = S.replyingTo
		var conversation = S.active
		var temp = optimistic(content, attachments, replyTo)
		C.addMessage(temp)
		editor.commands.clearContent()
		pending = []
		S.replyingTo = null
		renderPending()
		renderBar()
		C.call('send_message', {
			conversation: conversation,
			content: content,
			attachments: attachments.map(function (a) {
				return { file_url: a.file_url, file_name: a.file_name, file_size: a.file_size }
			}),
			reply_to: replyTo ? replyTo.name : null,
		}).then(
			function (result) {
				if (conversation !== S.active) return
				replaceMessage(temp.name, result)
				C.loadConversations()
			},
			function (error) {
				C.errorToast(error)
				if (conversation !== S.active) return
				replaceMessage(temp.name, null)
				if (content) editor.commands.setContent(content)
				pending = attachments
				S.replyingTo = replyTo
				renderPending()
				renderBar()
			}
		)
	}

	function saveEdit() {
		var S = C.state
		if (editor.isEmpty) return
		var target = S.editing
		sending = true
		renderTools()
		C.call('edit_message', { message: target.name, content: editor.getHTML() }).then(
			function (result) {
				sending = false
				// The answer is just the new text; the rest of the message stays.
				var list = S.messages
				for (var i = 0; i < list.length; i++)
					if (list[i].name === target.name) {
						list[i].content = result.content
						list[i].is_edited = result.is_edited
					}
				S.editing = null
				editor.commands.clearContent()
				renderBar()
				renderTools()
				C.renderMessages()
				C.loadConversations()
			},
			function (error) {
				sending = false
				renderTools()
				C.errorToast(error)
			}
		)
	}

	// ---- The tool row ----
	function toolButton(icon, label, onClick) {
		var button = C.el('button', 'mna-c-tool')
		button.type = 'button'
		button.title = label
		button.setAttribute('aria-label', label)
		button.appendChild(C.icon(icon, 'mna-c-small'))
		// Pressing a tool never takes the cursor out of the message.
		button.addEventListener('mousedown', function (event) {
			event.preventDefault()
		})
		button.addEventListener('click', onClick)
		return button
	}

	function renderTools() {
		var S = C.state
		var locked = blocked()
		dom.attach.disabled = uploading > 0 || locked || !!S.editing
		dom.format.disabled = locked
		dom.mention.disabled = locked
		dom.emoji.disabled = locked
		dom.poll.disabled = locked || !!S.editing
		dom.send.disabled = locked
		dom.send.replaceChildren(C.icon(S.editing ? 'check' : 'send', 'mna-c-small'))
		dom.send.setAttribute('aria-label', S.editing ? 'Save edit' : 'Send')
		editor.setEditable(!locked)
		dom.box.classList.toggle('locked', locked)
	}

	var FORMATS = [
		['bold', 'Bold', 'toggleBold'],
		['italic', 'Italic', 'toggleItalic'],
		['underline', 'Underline', 'toggleUnderline'],
		['strikethrough', 'Strikethrough', 'toggleStrike'],
		['highlighter', 'Highlight', 'toggleHighlight'],
		['code', 'Code', 'toggleCode'],
		['braces', 'Code block', 'toggleCodeBlock'],
		['list', 'Bullet list', 'toggleBulletList'],
		['list-ordered', 'Numbered list', 'toggleOrderedList'],
		['quote', 'Quote', 'toggleBlockquote'],
	]
	var ACTIVE = {
		toggleBold: 'bold',
		toggleItalic: 'italic',
		toggleUnderline: 'underline',
		toggleStrike: 'strike',
		toggleHighlight: 'highlight',
		toggleCode: 'code',
		toggleCodeBlock: 'codeBlock',
		toggleBulletList: 'bulletList',
		toggleOrderedList: 'orderedList',
		toggleBlockquote: 'blockquote',
	}

	function buildFormatting() {
		var row = C.el('div', 'mna-c-format')
		row.hidden = true
		var buttons = FORMATS.map(function (item) {
			var button = toolButton(item[0], item[1], function () {
				editor.chain().focus()[item[2]]().run()
			})
			button.setAttribute('data-command', item[2])
			row.appendChild(button)
			return button
		})
		var clear = toolButton('remove-formatting', 'Clear formatting', function () {
			editor.chain().focus().unsetAllMarks().run()
		})
		row.appendChild(clear)
		C.on('composer-input', refresh)
		editor.on('selectionUpdate', refresh)
		function refresh() {
			buttons.forEach(function (button) {
				button.classList.toggle('on', editor.isActive(ACTIVE[button.getAttribute('data-command')]))
			})
		}
		return row
	}

	function onKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !(C.mentionOpen && C.mentionOpen())) {
			event.preventDefault()
			send()
		} else if (event.key === 'Escape' && !(C.mentionOpen && C.mentionOpen())) {
			if (C.state.editing) C.cancelEdit()
			else if (C.state.replyingTo) C.cancelReply()
		}
	}

	// Pasted screenshots become attachments; pasted text is left to the editor.
	function onPaste(event) {
		if (blocked()) return
		var items = Array.prototype.slice.call((event.clipboardData && event.clipboardData.items) || [])
		var images = items.filter(function (item) {
			return item.kind === 'file' && item.type.indexOf('image/') === 0
		})
		if (!images.length) return
		event.preventDefault()
		attach(
			images
				.map(function (item) {
					return item.getAsFile()
				})
				.filter(Boolean)
		)
	}

	C.buildComposer = function (host) {
		dom.bar = C.el('div', 'mna-c-bar')
		dom.bar.hidden = true
		dom.files = C.el('div', 'mna-c-pendings')
		dom.files.hidden = true
		var editorHost = C.el('div', 'mna-c-editor')
		editor = makeEditor(editorHost)
		editorHost.addEventListener('keydown', onKeydown, true)
		editorHost.addEventListener('paste', onPaste, true)

		var input = C.el('input')
		input.type = 'file'
		input.multiple = true
		input.hidden = true
		input.addEventListener('change', function () {
			var files = input.files
			if (files && files.length) attach(files)
			input.value = ''
		})

		dom.attach = toolButton('paperclip', 'Attach file', function () {
			input.click()
		})
		dom.format = toolButton('type', 'Formatting', function () {
			dom.formatRow.hidden = !dom.formatRow.hidden
			dom.format.classList.toggle('on', !dom.formatRow.hidden)
		})
		dom.mention = toolButton('at-sign', 'Mention', function () {
			editor.chain().focus().insertContent('@').run()
		})
		dom.emoji = toolButton('smile-plus', 'Emoji', function () {
			if (C.emojiPicker)
				C.emojiPicker(dom.emoji, function (e) {
					editor.chain().focus().insertContent(e).run()
				})
		})
		dom.poll = toolButton('bar-chart-2', 'Poll', function () {
			if (C.pollDialog) C.pollDialog()
		})
		dom.send = C.el('button', 'mna-c-send')
		dom.send.type = 'button'
		dom.send.addEventListener('click', send)

		var tools = C.el('div', 'mna-c-tools')
		var left = C.el('div', 'mna-c-tools-left')
		;[dom.attach, dom.format, dom.mention, dom.emoji, C.el('span', 'mna-c-sep'), dom.poll].forEach(function (node) {
			left.appendChild(node)
		})
		tools.appendChild(left)
		tools.appendChild(dom.send)

		dom.formatRow = buildFormatting()
		dom.box = C.el('div', 'mna-c-box')
		;[dom.bar, dom.files, dom.formatRow, editorHost, tools, input].forEach(function (node) {
			dom.box.appendChild(node)
		})
		host.appendChild(dom.box)

		C.on('open', function () {
			pending = []
			editor.commands.clearContent()
			renderPending()
			renderBar()
		})
		C.on('thread-ready', function () {
			renderTools()
			renderBar()
			editor.commands.focus()
		})
		C.on('conversation-changed', renderTools)
		C.on('opened', function (id) {
			host.hidden = !id
		})
		host.hidden = true
		renderTools()
	}
})()
