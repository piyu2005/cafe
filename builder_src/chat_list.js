// The native chat, part 2: the list of conversations on the left.
;(function () {
	'use strict'

	var C = window.CAFE.chat
	var DEBOUNCE_MS = 200
	var box,
		input,
		scroll,
		timer,
		searchToken = 0

	function row(avatar, name, preview, extra) {
		var button = C.el('button', 'cafe-c-row' + (extra && extra.active ? ' active' : ''))
		button.type = 'button'
		button.appendChild(avatar)
		var text = C.el('div', 'cafe-c-row-text')
		var title = C.el('div', 'cafe-c-row-title')
		title.appendChild(C.el('span', 'cafe-c-row-name', name))
		if (extra && extra.muted) title.appendChild(C.icon('bell-off', 'cafe-c-muted'))
		text.appendChild(title)
		if (preview !== null) text.appendChild(C.el('p', 'cafe-c-row-preview', preview))
		button.appendChild(text)
		if (extra && extra.unread > 0) button.appendChild(C.el('span', 'cafe-c-unread', String(extra.unread)))
		return button
	}

	function message(text) {
		return C.el('p', 'cafe-c-empty', text)
	}

	function skeleton() {
		var wrap = C.el('div', 'cafe-c-skeleton')
		for (var i = 0; i < 4; i++) wrap.appendChild(C.el('div', 'cafe-skeleton'))
		return wrap
	}

	function conversationRows(rows) {
		return rows.map(function (c) {
			var button = row(
				C.avatar(c.display_image, c.display_name, 'md'),
				c.display_name,
				c.last_message || 'No messages yet',
				{
					active: c.conversation === C.state.active,
					muted: c.muted,
					unread: c.unread_count,
				}
			)
			button.addEventListener('click', function () {
				C.open(c.conversation)
			})
			return button
		})
	}

	function requestsToggle() {
		var state = C.state
		var button = C.el('button', 'cafe-c-requests')
		button.type = 'button'
		var left = C.el('span', 'cafe-c-requests-left')
		left.appendChild(C.icon('inbox', 'cafe-c-small'))
		left.appendChild(document.createTextNode('Message requests'))
		var right = C.el('span', 'cafe-c-requests-right')
		if (state.requests && state.requests.length)
			right.appendChild(C.el('span', 'cafe-c-unread', String(state.requests.length)))
		right.appendChild(C.icon(state.showRequests ? 'chevron-up' : 'chevron-down', 'cafe-c-small cafe-c-faint'))
		button.appendChild(left)
		button.appendChild(right)
		button.addEventListener('click', function () {
			state.showRequests = !state.showRequests
			render()
		})
		return button
	}

	function peopleRows(people) {
		return people.map(function (p) {
			var button = row(C.avatar(p.user_image, p.full_name, 'md'), p.full_name, null, {})
			if (p.username)
				button.querySelector('.cafe-c-row-title').appendChild(C.el('span', 'cafe-c-row-handle', '@' + p.username))
			button.addEventListener('click', function () {
				button.disabled = true
				C.call('start_dm', { other_user: p.name }).then(
					function (data) {
						input.value = ''
						C.state.search = ''
						C.loadConversations()
						C.open(data.conversation)
						render()
					},
					function (error) {
						button.disabled = false
						C.errorToast(error)
					}
				)
			})
			return button
		})
	}

	function render() {
		var state = C.state
		scroll.replaceChildren()
		if (state.search.trim()) {
			if (state.people === null) scroll.appendChild(skeleton())
			else if (!state.people.length) scroll.appendChild(message('No people found.'))
			else
				peopleRows(state.people).forEach(function (node) {
					scroll.appendChild(node)
				})
			return
		}
		scroll.appendChild(requestsToggle())
		if (state.showRequests) {
			if (!state.requests || !state.requests.length) scroll.appendChild(message('No message requests.'))
			else
				conversationRows(state.requests).forEach(function (node) {
					scroll.appendChild(node)
				})
		} else if (state.conversations === null) {
			scroll.appendChild(skeleton())
		} else if (!state.conversations.length) {
			scroll.appendChild(message('No conversations yet.'))
		} else {
			conversationRows(state.conversations).forEach(function (node) {
				scroll.appendChild(node)
			})
		}
	}

	function searchPeople() {
		var token = ++searchToken
		var query = C.state.search.trim()
		if (!query) return
		C.state.people = null
		render()
		C.fetch('search_people_to_message', { query: query }).then(
			function (rows) {
				if (token !== searchToken) return
				C.state.people = rows || []
				render()
			},
			function () {
				if (token === searchToken) {
					C.state.people = []
					render()
				}
			}
		)
	}

	C.buildList = function (host) {
		box = host
		var searchBox = C.el('div', 'cafe-c-search')
		searchBox.appendChild(C.icon('search', 'cafe-c-search-icon'))
		input = C.el('input')
		input.type = 'text'
		input.placeholder = 'Search by name'
		input.setAttribute('aria-label', 'Search by name')
		input.autocomplete = 'off'
		input.addEventListener('input', function () {
			C.state.search = input.value
			clearTimeout(timer)
			if (!input.value.trim()) {
				searchToken++
				render()
				return
			}
			timer = setTimeout(searchPeople, DEBOUNCE_MS)
		})
		searchBox.appendChild(input)
		scroll = C.el('div', 'cafe-c-list-scroll')
		box.appendChild(searchBox)
		box.appendChild(scroll)
		C.on('conversations', render)
		C.on('opened', render)
		render()
		input.focus()
	}
})()
