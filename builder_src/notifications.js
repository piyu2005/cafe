// Notifications: the panel that opens from the bell (rail on a desktop, top
// bar on a phone), the unread count on the bells, and live updates. Every
// page loads this script. Needs ui.js and shell.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var ICONS = '@@ICONS@@'
	// Matches list_notifications' own server-side cap (cafe/follow.py) - the
	// panel's own first load behaves exactly as it always did; this only
	// adds the ability to scroll for anything past it.
	var PAGE_SIZE = 50
	var TYPES = {
		Like: { icon: 'heart', color: '#e03434' },
		Comment: { icon: 'message-circle', color: '#0c8ef8' },
		Mention: { icon: 'at-sign', color: '#3bbde5' },
		'Group Invite': { icon: 'users', color: '#df9310' },
		'Publication Invite': { icon: 'newspaper', color: '#7757ee' },
		Repost: { icon: 'repeat-2', color: '#1c9d6f' },
	}
	var OTHER_TYPE = { icon: 'bell', color: '#383838' }
	var RESPOND = {
		'Group Invite': 'cafe.chat.respond_to_group_invite',
		'Publication Invite': 'cafe.api.respond_to_publication_invite',
	}
	var UNITS = [
		['year', 31536000],
		['month', 2592000],
		['day', 86400],
		['hour', 3600],
		['minute', 60],
	]

	var el = function (tag, className, text) {
		return CAFE.el(tag, className, text)
	}

	function icon(name, className) {
		var holder = el('span', className)
		holder.innerHTML = ICONS[name] || ''
		return holder
	}

	function timeAgo(value) {
		if (!value) return ''
		var seconds = Math.floor((Date.now() - new Date(value.replace(' ', 'T'))) / 1000)
		for (var i = 0; i < UNITS.length; i++) {
			var count = Math.floor(seconds / UNITS[i][1])
			if (count >= 1) return count + ' ' + UNITS[i][0] + (count > 1 ? 's' : '') + ' ago'
		}
		return 'just now'
	}

	function routeOf(n) {
		// n.post is the post to land on either way - for a Post reference
		// that's n.reference_name itself; for a Post Comment (which has no
		// page of its own, e.g. a like or reply on a comment) the server
		// resolves it to the post that comment is on. The hash scrolls to
		// and highlights the exact comment once the post page loads.
		if (n.post)
			return (
				'/posts/' +
				encodeURIComponent(n.post) +
				(n.reference_doctype === 'Post Comment' ? '#comment-' + encodeURIComponent(n.reference_name) : '')
			)
		if (n.reference_doctype === 'Conversation') return '/messages/' + encodeURIComponent(n.reference_name)
		if (n.actor) return '/profile/' + encodeURIComponent(n.actor_username || n.actor)
		return ''
	}

	// ---- The rows ----

	function avatar(n) {
		var wrap = el('div', 'cafe-np-avatar-wrap')
		var circle = el('span', 'cafe-np-avatar')
		var name = n.actor_name || 'Someone'
		if (/^(\/|https?:\/\/)/.test(n.actor_image || '')) {
			var image = el('img')
			image.src = n.actor_image
			image.alt = ''
			circle.appendChild(image)
		} else {
			circle.textContent = name.trim().charAt(0)
		}
		var type = TYPES[n.type] || OTHER_TYPE
		var badge = el('span', 'cafe-np-type')
		badge.style.background = type.color
		badge.appendChild(icon(type.icon, 'cafe-np-type-icon'))
		wrap.appendChild(circle)
		wrap.appendChild(badge)
		return wrap
	}

	function button(label, kind, onClick) {
		var node = el('button', 'cafe-btn cafe-btn-' + kind, label)
		node.type = 'button'
		node.addEventListener('click', function (event) {
			event.stopPropagation()
			onClick(node)
		})
		return node
	}

	// ---- The panel ----

	function Panel() {
		this.list = null
		this.node = null
		this.isOpen = false
		this.request = 0
		// Paging state for "load more as you scroll the panel" - cursor is
		// the last-seen row's own `creation` (see list_notifications'
		// docstring for why not a row count), not reset until the panel
		// actually reloads from scratch (open/markAll/realtime refresh).
		this.cursor = null
		this.hasMore = false
		this.loadingMore = false
		this.sentinel = null
		this.observer = null
	}

	Panel.prototype.build = function () {
		var self = this
		var node = el('div', 'cafe-np')
		node.setAttribute('role', 'dialog')
		node.setAttribute('aria-label', 'Notifications')
		var header = el('div', 'cafe-np-header')
		header.appendChild(el('h2', 'cafe-np-title', 'Notifications'))
		var actions = el('div', 'cafe-np-header-actions')
		var markAll = el('button', 'cafe-np-icon-btn cafe-np-mark-all')
		markAll.type = 'button'
		markAll.setAttribute('aria-label', 'Mark all as read')
		CAFE.tooltip(markAll, 'Mark all as read')
		markAll.appendChild(icon('check-check', 'cafe-np-icon'))
		markAll.addEventListener('click', function () {
			self.markAll(true)
		})
		var close = el('button', 'cafe-np-icon-btn cafe-np-close')
		close.type = 'button'
		close.setAttribute('aria-label', 'Close')
		close.appendChild(icon('x', 'cafe-np-icon'))
		close.addEventListener('click', function () {
			self.close()
		})
		actions.appendChild(markAll)
		actions.appendChild(close)
		header.appendChild(actions)
		this.list = el('div', 'cafe-np-list')
		node.appendChild(header)
		node.appendChild(this.list)
		document.body.appendChild(node)
		this.node = node

		this.sentinel = el('div', 'cafe-np-sentinel')
		if ('IntersectionObserver' in window) {
			this.observer = new IntersectionObserver(
				function (entries) {
					if (entries[0].isIntersecting && self.hasMore && !self.loadingMore) self.loadMore()
				},
				// root scoped to the panel's own scroll area (.cafe-np-list),
				// not the page viewport - this sentinel never reaches the
				// latter, the panel is a fixed-size dropdown.
				{ root: this.list, rootMargin: '200px' }
			)
		}
	}

	Panel.prototype.open = function () {
		if (!this.node) this.build()
		if (CAFE.closeMenu) CAFE.closeMenu()
		this.isOpen = true
		this.node.classList.add('open')
		document.body.classList.add('cafe-np-open')
		document.querySelectorAll('[data-bell]').forEach(function (bell) {
			bell.classList.add('active')
		})
		this.load(true)
	}

	Panel.prototype.close = function () {
		if (!this.isOpen) return
		this.isOpen = false
		this.node.classList.remove('open')
		document.body.classList.remove('cafe-np-open')
		document.querySelectorAll('[data-bell]').forEach(function (bell) {
			bell.classList.remove('active')
		})
	}

	Panel.prototype.toggle = function () {
		if (this.isOpen) this.close()
		else this.open()
	}

	// Opening the panel counts as seeing what is in it, so it marks everything
	// read first, then lists them.
	Panel.prototype.load = function (markRead) {
		var self = this
		var request = ++this.request
		this.cursor = null
		this.hasMore = false
		if (!this.list.children.length) this.showSkeleton()
		var start = markRead
			? CAFE.api('cafe.follow.mark_notification_read', {}).catch(function () {})
			: Promise.resolve()
		start
			.then(function () {
				return CAFE.get('cafe.follow.list_notifications')
			})
			.then(
				function (rows) {
					if (request !== self.request) return
					rows = rows || []
					self.hasMore = rows.length > PAGE_SIZE
					rows = rows.slice(0, PAGE_SIZE)
					if (rows.length) self.cursor = rows[rows.length - 1].creation
					self.render(rows)
					if (CAFE.refreshBadges) CAFE.refreshBadges()
				},
				function () {
					if (request !== self.request) return
					self.showMessage("Couldn't load your notifications. Please try again.")
				}
			)
	}

	// Appends the next page as the panel is scrolled - same cursor the
	// initial load leaves behind, never a row count (see the constructor's
	// own comment on why).
	Panel.prototype.loadMore = function () {
		var self = this
		var request = this.request
		this.loadingMore = true
		CAFE.get('cafe.follow.list_notifications', { before: this.cursor })
			.then(
				function (rows) {
					if (request !== self.request) return
					rows = rows || []
					self.hasMore = rows.length > PAGE_SIZE
					rows = rows.slice(0, PAGE_SIZE)
					if (rows.length) {
						self.cursor = rows[rows.length - 1].creation
						self.appendRows(rows)
					}
				},
				function () {}
			)
			.then(function () {
				self.loadingMore = false
			})
	}

	Panel.prototype.markAll = function (announce) {
		var self = this
		var node = this.node.querySelector('.cafe-np-mark-all')
		node.disabled = true
		CAFE.api('cafe.follow.mark_notification_read', {}).then(
			function () {
				node.disabled = false
				if (announce) CAFE.toast('All notifications marked as read')
				// Like the other Frappe apps: once everything is read, the list clears.
				self.request++
				self.render([])
				if (CAFE.refreshBadges) CAFE.refreshBadges()
			},
			function () {
				node.disabled = false
				CAFE.toast("Couldn't mark them as read. Please try again.", 'error')
			}
		)
	}

	Panel.prototype.showSkeleton = function () {
		this.list.replaceChildren()
		var box = el('div', 'cafe-np-skeleton')
		for (var i = 0; i < 6; i++) box.appendChild(el('div', 'cafe-skeleton'))
		this.list.appendChild(box)
	}

	Panel.prototype.showMessage = function (text) {
		this.list.replaceChildren()
		this.list.appendChild(el('p', 'cafe-np-error', text))
	}

	Panel.prototype.render = function (rows) {
		if (this.observer) this.observer.unobserve(this.sentinel)
		this.list.replaceChildren()
		if (!rows.length) {
			var empty = el('div', 'cafe-np-empty')
			empty.appendChild(icon('bell', 'cafe-np-empty-icon'))
			empty.appendChild(el('p', '', "You're all caught up."))
			this.list.appendChild(empty)
			return
		}
		this.appendRows(rows)
	}

	// Adds rows without disturbing what's already there - render() (a fresh
	// load) calls this too, right after clearing the list, so the sentinel
	// only ever needs placing in this one spot.
	Panel.prototype.appendRows = function (rows) {
		var self = this
		if (this.observer) this.observer.unobserve(this.sentinel)
		// The sentinel must stay last - pull it out first (a no-op if it
		// isn't in the list yet) so appending more rows after it doesn't
		// leave it stranded in the middle.
		if (this.sentinel.parentNode) this.sentinel.remove()
		rows.forEach(function (n) {
			self.list.appendChild(self.row(n))
		})
		this.list.appendChild(this.sentinel)
		if (this.observer && this.hasMore) this.observer.observe(this.sentinel)
	}

	Panel.prototype.row = function (n) {
		var self = this
		var row = el('div', 'cafe-np-row')
		row.appendChild(avatar(n))
		var text = el('div', 'cafe-np-text')
		var message = el('p', 'cafe-np-msg' + (n.is_read ? ' read' : ''))
		message.appendChild(el('span', 'cafe-np-actor', n.actor_name || 'Someone'))
		message.appendChild(document.createTextNode(' ' + (n.message || '')))
		text.appendChild(message)
		text.appendChild(el('div', 'cafe-np-time', timeAgo(n.creation)))
		if (RESPOND[n.type] && n.request_status === 'Pending') {
			var actions = el('div', 'cafe-np-actions')
			actions.appendChild(
				button('Accept', 'solid', function (node) {
					self.respond(n, true, node)
				})
			)
			actions.appendChild(
				button('Decline', 'outline', function (node) {
					self.respond(n, false, node)
				})
			)
			text.appendChild(actions)
		} else if (RESPOND[n.type] && n.request_status) {
			text.appendChild(el('span', 'cafe-np-status', n.request_status))
		}
		row.appendChild(text)
		if (!n.is_read) row.appendChild(el('span', 'cafe-np-dot'))
		row.addEventListener('click', function () {
			self.go(n)
		})
		return row
	}

	// A click on a row marks it read and goes to what it is about.
	Panel.prototype.go = function (n) {
		if (!n.is_read) {
			n.is_read = 1
			CAFE.api('cafe.follow.mark_notification_read', { name: n.name }).then(
				function () {
					if (CAFE.refreshBadges) CAFE.refreshBadges()
				},
				function () {}
			)
		}
		var route = routeOf(n)
		if (!route) return
		this.close()
		location.assign(route)
	}

	Panel.prototype.respond = function (n, accept, node) {
		var self = this
		node.disabled = true
		node.parentNode.classList.add('busy')
		CAFE.api(RESPOND[n.type], { name: n.reference_name, accept: accept ? 1 : 0 }).then(
			function (data) {
				if (accept && data && data.conversation)
					location.assign('/messages/' + encodeURIComponent(data.conversation))
				// Publications is hidden for now (keep in sync with
				// blocks.PUBLICATIONS_ENABLED) - its page is unpublished, so
				// don't send someone who still had a pending invite into a 404.
				else self.load(false)
			},
			function (error) {
				node.disabled = false
				node.parentNode.classList.remove('busy')
				CAFE.toast(error.message, 'error')
			}
		)
	}

	// ---- Live updates ----

	// Other scripts (the chat) share this page's live connection.
	var socketWaiters = []
	CAFE.onSocket = function (callback) {
		if (CAFE.socket) callback(CAFE.socket)
		else socketWaiters.push(callback)
	}

	var SOCKET_SCRIPT = '/assets/cafe/builder_assets/vendor/socket.io.min.js'

	function connectRealtime(panel) {
		var script = document.createElement('script')
		script.src = SOCKET_SCRIPT
		script.onload = function () {
			var port = location.port ? ':9000' : ''
			var url = (port ? 'http' : 'https') + '://' + location.hostname + port + '/' + location.hostname
			var socket = window.io(url, { withCredentials: true })
			CAFE.socket = socket
			socketWaiters.splice(0).forEach(function (callback) {
				callback(socket)
			})
			socket.on('notification:new', function (payload) {
				if (panel.isOpen) {
					if (CAFE.refreshBadges) CAFE.refreshBadges()
					panel.load(true)
				} else {
					CAFE.toast((payload.actor_name || 'Someone') + ' ' + payload.message, 'info')
					// Seeing the toast counts as seeing the notification - mark it
					// read right away rather than leaving an unread dot in the panel
					// for something already shown on screen. Refresh the badge only
					// after that confirms, so the unread count doesn't flicker up
					// and immediately back down.
					CAFE.api('cafe.follow.mark_notification_read', { name: payload.name }).then(
						function () {
							if (CAFE.refreshBadges) CAFE.refreshBadges()
						},
						function () {}
					)
				}
			})
			socket.on('chat:new_message', function (payload) {
				if (CAFE.refreshBadges) CAFE.refreshBadges()
				var here = location.pathname === '/messages/' + payload.conversation
				if (!here) CAFE.toast(payload.sender_name + ': ' + (payload.content || 'sent an attachment'), 'info')
			})
		}
		document.head.appendChild(script)
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (!document.querySelector('[data-bell]')) return
		var panel = new Panel()
		CAFE.closeNotifications = function () {
			panel.close()
		}
		document.addEventListener('click', function (event) {
			var bell = event.target.closest('[data-bell]')
			if (bell) panel.toggle()
		})
		setTimeout(function () {
			connectRealtime(panel)
		}, 1500)
	})
})()
