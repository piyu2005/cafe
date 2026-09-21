// The native chat, part 4: the open conversation on the right.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var MESSAGE_LIMIT = 50
	var dom = {}
	var openToken = 0

	// ---- A small menu that opens next to a button ----
	var openMenu = null
	function closeMenu() {
		if (openMenu) {
			openMenu.remove()
			openMenu = null
		}
	}
	document.addEventListener('mousedown', function (event) {
		if (openMenu && !openMenu.contains(event.target)) closeMenu()
	})
	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') closeMenu()
	})

	C.menu = function (anchor, items, side) {
		closeMenu()
		var menu = C.el('div', 'mna-c-menu')
		items.forEach(function (item) {
			var button = C.el('button', 'mna-c-menu-item' + (item.danger ? ' danger' : ''))
			button.type = 'button'
			button.appendChild(C.icon(item.icon, 'mna-c-small'))
			button.appendChild(C.el('span', '', item.label))
			button.addEventListener('click', function () {
				closeMenu()
				item.onClick()
			})
			menu.appendChild(button)
		})
		document.body.appendChild(menu)
		var rect = anchor.getBoundingClientRect()
		var width = menu.offsetWidth
		var left = side === 'left' ? rect.left - width + rect.width : rect.right - width
		menu.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px'
		menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px'
		openMenu = menu
	}

	// ---- The header ----
	function renderHeader() {
		var c = C.state.conversation
		dom.header.replaceChildren()
		if (!c) return
		var left = C.el('div', 'mna-c-head-left')
		var back = C.el('button', 'mna-c-back')
		back.type = 'button'
		back.setAttribute('aria-label', 'Back')
		back.appendChild(C.icon('arrow-left', 'mna-c-medium'))
		back.addEventListener('click', function () {
			C.open(null)
		})
		left.appendChild(back)
		left.appendChild(C.avatar(c.display_image, c.display_name, 'md'))
		var name = C.el('div', 'mna-c-head-name')
		if (c.other_user) {
			var link = C.el('a', 'mna-c-head-link', c.display_name)
			link.href = '/profile/' + encodeURIComponent(c.other_user_username || c.other_user)
			name.appendChild(link)
		} else {
			name.appendChild(C.el('div', 'mna-c-head-title', c.display_name))
		}
		var typing = C.el('div', 'mna-c-typing', 'typing…')
		typing.hidden = !C.state.typing
		dom.typing = typing
		name.appendChild(typing)
		left.appendChild(name)
		var right = C.el('div', 'mna-c-head-right')
		var search = C.el('button', 'mna-c-head-search')
		search.type = 'button'
		search.setAttribute('aria-label', 'Search in this conversation')
		search.appendChild(C.icon('search', 'mna-c-small'))
		search.addEventListener('click', function () {
			if (C.toggleSearch) C.toggleSearch()
		})
		var more = C.el('button', 'mna-c-more-btn')
		more.type = 'button'
		more.setAttribute('aria-label', 'More')
		more.appendChild(C.icon('ellipsis', 'mna-c-small'))
		more.addEventListener('click', function () {
			C.menu(more, threadOptions(), 'left')
		})
		right.appendChild(search)
		right.appendChild(more)
		dom.header.appendChild(left)
		dom.header.appendChild(right)
	}

	C.setTyping = function (on) {
		C.state.typing = on
		if (dom.typing) dom.typing.hidden = !on
	}

	function threadOptions() {
		var c = C.state.conversation
		var id = C.state.active
		var items = []
		if (c.is_group && C.groupInfo) items.push({ label: 'Group info', icon: 'users', onClick: C.groupInfo })
		items.push({
			label: c.muted ? 'Unmute' : 'Mute',
			icon: c.muted ? 'bell' : 'bell-off',
			onClick: function () {
				C.call('mute_conversation', { conversation: id, muted: c.muted ? 0 : 1 }).then(function () {
					reloadConversation()
					C.loadConversations()
				}, C.errorToast)
			},
		})
		if (c.other_user) {
			if (c.i_blocked_them) {
				items.push({
					label: 'Unblock',
					icon: 'shield-check',
					onClick: function () {
						C.call('unblock_user', { user: c.other_user }).then(function () {
							MNA.toast('User unblocked')
							reloadConversation()
						}, C.errorToast)
					},
				})
			} else {
				items.push({
					label: 'Block',
					icon: 'shield-ban',
					onClick: function () {
						MNA.confirm({
							title: 'Block this user?',
							message: 'They will no longer be able to message you.',
							confirmLabel: 'Block',
							danger: true,
						}).then(function (ok) {
							if (ok)
								C.call('block_user', { user: c.other_user }).then(function () {
									MNA.toast('User blocked')
									reloadConversation()
								}, C.errorToast)
						})
					},
				})
			}
		}
		return items
	}

	// ---- Banners under the header ----
	function renderBanner() {
		var c = C.state.conversation
		dom.banner.replaceChildren()
		dom.banner.hidden = true
		if (!c) return
		if (c.is_blocked) {
			dom.banner.hidden = false
			dom.banner.textContent = c.i_blocked_them
				? "You've blocked this user. Unblock them to send messages."
				: "You can't reply to this conversation."
		} else if (c.my_status === 'Pending') {
			dom.banner.hidden = false
			dom.banner.classList.add('request')
			dom.banner.appendChild(
				C.el(
					'span',
					'',
					c.display_name + ' wants to message you. Accept to start chatting, or decline to ignore.'
				)
			)
			var actions = C.el('div', 'mna-c-banner-actions')
			var reply = function (accept, label, kind) {
				var button = C.el('button', 'mna-btn mna-btn-' + kind, label)
				button.type = 'button'
				button.addEventListener('click', function () {
					respond(accept)
				})
				actions.appendChild(button)
			}
			reply(0, 'Decline', 'outline')
			reply(1, 'Accept', 'solid')
			dom.banner.appendChild(actions)
		}
		if (dom.banner.hidden) dom.banner.classList.remove('request')
	}

	function respond(accept) {
		C.call('respond_to_message_request', { conversation: C.state.active, accept: accept }).then(function (data) {
			C.loadConversations()
			C.loadRequests()
			if (data && data.status === 'Declined') C.open(null)
			else reloadConversation()
		}, C.errorToast)
	}

	// ---- The messages ----
	function lastOwn() {
		var own = C.state.messages.filter(function (m) {
			return m.sender === C.me
		})
		return own.length ? own[own.length - 1] : null
	}

	function seenByOther() {
		var mine = lastOwn()
		var other = C.state.conversation && C.state.conversation.other_last_read
		return !!(mine && other && new Date(other) >= new Date(mine.creation))
	}

	C.scrollToBottom = function () {
		requestAnimationFrame(function () {
			dom.scroll.scrollTop = dom.scroll.scrollHeight
		})
	}

	C.renderMessages = function () {
		dom.list.replaceChildren()
		var mine = lastOwn()
		var seen = seenByOther()
		C.state.messages.forEach(function (m) {
			dom.list.appendChild(C.renderMessage(m, seen && mine && m.name === mine.name))
		})
	}

	function skeletonThread() {
		dom.list.replaceChildren()
		var wrap = C.el('div', 'mna-c-skeleton')
		for (var i = 0; i < 6; i++) wrap.appendChild(C.el('div', 'mna-skeleton'))
		dom.list.appendChild(wrap)
	}

	function reloadConversation() {
		var id = C.state.active
		return C.fetch('get_conversation', { conversation: id }).then(
			function (data) {
				if (id !== C.state.active) return
				C.state.conversation = data
				renderHeader()
				renderBanner()
				C.emit('conversation-changed')
			},
			function () {}
		)
	}
	C.reloadConversation = reloadConversation

	// ---- Opening and closing ----
	function show(id) {
		dom.root.setAttribute('data-view', id ? 'thread' : 'list')
		document.documentElement.setAttribute('data-chat-view', id ? 'thread' : 'list')
		dom.empty.hidden = !!id
		dom.pane.hidden = !id
	}

	function open(id) {
		var token = ++openToken
		var S = C.state
		S.active = id
		S.conversation = null
		S.messages = []
		S.replyingTo = null
		S.editing = null
		S.typing = false
		show(id)
		C.emit('opened', id)
		if (!id) return
		dom.header.replaceChildren()
		dom.banner.hidden = true
		skeletonThread()
		var conversation = C.fetch('get_conversation', { conversation: id })
		var messages = C.fetch('get_messages', { conversation: id, limit: MESSAGE_LIMIT })
		Promise.all([conversation, messages]).then(
			function (results) {
				if (token !== openToken) return
				S.conversation = results[0]
				S.messages = results[1] || []
				renderHeader()
				renderBanner()
				C.renderMessages()
				C.scrollToBottom()
				C.emit('thread-ready')
				C.call('mark_read', { conversation: id }).then(
					function () {
						C.loadConversations()
						if (window.MNA.refreshBadges) window.MNA.refreshBadges()
					},
					function () {}
				)
			},
			function (error) {
				if (token !== openToken) return
				dom.list.replaceChildren(C.el('p', 'mna-c-empty', "Couldn't open this conversation."))
				if (error && window.console) console.warn(error)
			}
		)
	}

	// A new message from anywhere (yours, sent from here, or someone's, live).
	C.addMessage = function (m) {
		C.state.messages.push(m)
		C.renderMessages()
		C.scrollToBottom()
	}

	C.buildThread = function (root, host) {
		dom.root = root
		dom.empty = C.el('div', 'mna-c-empty-pane')
		dom.empty.appendChild(C.el('p', '', 'Select a conversation to start messaging.'))
		dom.pane = C.el('div', 'mna-c-pane')
		dom.header = C.el('div', 'mna-c-head')
		dom.searchHost = C.el('div', 'mna-c-search-host')
		dom.searchHost.hidden = true
		dom.banner = C.el('div', 'mna-c-banner')
		dom.scroll = C.el('div', 'mna-c-messages')
		dom.list = C.el('div', 'mna-c-message-list')
		dom.scroll.appendChild(dom.list)
		dom.composerHost = C.el('div', 'mna-c-composer-host')
		;[dom.header, dom.searchHost, dom.banner, dom.scroll, dom.composerHost].forEach(function (node) {
			dom.pane.appendChild(node)
		})
		host.appendChild(dom.empty)
		host.appendChild(dom.pane)
		C.dom = dom
		C.on('open', open)
		show(null)
	}
})()
