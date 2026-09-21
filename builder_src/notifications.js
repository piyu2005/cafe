// Notifications: the panel that opens from the bell (rail on a desktop, top
// bar on a phone), the unread count on the bells, and live updates. Every
// page loads this script. Needs ui.js and shell.js.
;(function () {
	'use strict'

	var MNA = (window.MNA = window.MNA || {})
	var ICONS = '@@ICONS@@'
	var TYPES = {
		Like: { icon: 'heart', color: '#e03434' },
		Comment: { icon: 'message-circle', color: '#0c8ef8' },
		Mention: { icon: 'at-sign', color: '#3bbde5' },
		'Group Invite': { icon: 'users', color: '#df9310' },
		'Publication Invite': { icon: 'newspaper', color: '#7757ee' },
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
		return MNA.el(tag, className, text)
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
		if (n.reference_doctype === 'Post') return '/posts/' + encodeURIComponent(n.reference_name)
		if (n.reference_doctype === 'Conversation') return '/messages/' + encodeURIComponent(n.reference_name)
		if (n.actor) return '/profile/' + encodeURIComponent(n.actor_username || n.actor)
		return ''
	}

	// ---- The rows ----

	function avatar(n) {
		var wrap = el('div', 'mna-np-avatar-wrap')
		var circle = el('span', 'mna-np-avatar')
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
		var badge = el('span', 'mna-np-type')
		badge.style.background = type.color
		badge.appendChild(icon(type.icon, 'mna-np-type-icon'))
		wrap.appendChild(circle)
		wrap.appendChild(badge)
		return wrap
	}

	function button(label, kind, onClick) {
		var node = el('button', 'mna-btn mna-btn-' + kind, label)
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
	}

	Panel.prototype.build = function () {
		var self = this
		var node = el('div', 'mna-np')
		node.setAttribute('role', 'dialog')
		node.setAttribute('aria-label', 'Notifications')
		var header = el('div', 'mna-np-header')
		header.appendChild(el('h2', 'mna-np-title', 'Notifications'))
		var actions = el('div', 'mna-np-header-actions')
		var markAll = el('button', 'mna-np-icon-btn mna-np-mark-all')
		markAll.type = 'button'
		markAll.title = 'Mark all as read'
		markAll.setAttribute('aria-label', 'Mark all as read')
		markAll.appendChild(icon('check-check', 'mna-np-icon'))
		markAll.addEventListener('click', function () {
			self.markAll(true)
		})
		var close = el('button', 'mna-np-icon-btn mna-np-close')
		close.type = 'button'
		close.setAttribute('aria-label', 'Close')
		close.appendChild(icon('x', 'mna-np-icon'))
		close.addEventListener('click', function () {
			self.close()
		})
		actions.appendChild(markAll)
		actions.appendChild(close)
		header.appendChild(actions)
		this.list = el('div', 'mna-np-list')
		node.appendChild(header)
		node.appendChild(this.list)
		document.body.appendChild(node)
		this.node = node
	}

	Panel.prototype.open = function () {
		if (!this.node) this.build()
		if (MNA.closeMenu) MNA.closeMenu()
		this.isOpen = true
		this.node.classList.add('open')
		document.body.classList.add('mna-np-open')
		document.querySelectorAll('[data-bell]').forEach(function (bell) {
			bell.classList.add('active')
		})
		this.load(true)
	}

	Panel.prototype.close = function () {
		if (!this.isOpen) return
		this.isOpen = false
		this.node.classList.remove('open')
		document.body.classList.remove('mna-np-open')
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
		if (!this.list.children.length) this.showSkeleton()
		var start = markRead
			? MNA.api('cafe.follow.mark_notification_read', {}).catch(function () {})
			: Promise.resolve()
		start
			.then(function () {
				return MNA.get('cafe.follow.list_notifications')
			})
			.then(
				function (rows) {
					if (request !== self.request) return
					self.render(rows || [])
					if (MNA.refreshBadges) MNA.refreshBadges()
				},
				function () {
					if (request !== self.request) return
					self.showMessage("Couldn't load your notifications. Please try again.")
				}
			)
	}

	Panel.prototype.markAll = function (announce) {
		var self = this
		var node = this.node.querySelector('.mna-np-mark-all')
		node.disabled = true
		MNA.api('cafe.follow.mark_notification_read', {}).then(
			function () {
				node.disabled = false
				if (announce) MNA.toast('All notifications marked as read')
				self.load(false)
			},
			function () {
				node.disabled = false
				MNA.toast("Couldn't mark them as read. Please try again.")
			}
		)
	}

	Panel.prototype.showSkeleton = function () {
		this.list.replaceChildren()
		var box = el('div', 'mna-np-skeleton')
		for (var i = 0; i < 6; i++) box.appendChild(el('div', 'mna-skeleton'))
		this.list.appendChild(box)
	}

	Panel.prototype.showMessage = function (text) {
		this.list.replaceChildren()
		this.list.appendChild(el('p', 'mna-np-error', text))
	}

	Panel.prototype.render = function (rows) {
		this.list.replaceChildren()
		if (!rows.length) {
			var empty = el('div', 'mna-np-empty')
			empty.appendChild(icon('bell', 'mna-np-empty-icon'))
			empty.appendChild(el('p', '', "You're all caught up."))
			this.list.appendChild(empty)
			return
		}
		var self = this
		rows.forEach(function (n) {
			self.list.appendChild(self.row(n))
		})
	}

	Panel.prototype.row = function (n) {
		var self = this
		var row = el('div', 'mna-np-row')
		row.appendChild(avatar(n))
		var text = el('div', 'mna-np-text')
		var message = el('p', 'mna-np-msg' + (n.is_read ? ' read' : ''))
		message.appendChild(el('span', 'mna-np-actor', n.actor_name || 'Someone'))
		message.appendChild(document.createTextNode(' ' + (n.message || '')))
		text.appendChild(message)
		text.appendChild(el('div', 'mna-np-time', timeAgo(n.creation)))
		if (RESPOND[n.type] && n.request_status === 'Pending') {
			var actions = el('div', 'mna-np-actions')
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
			text.appendChild(el('span', 'mna-np-status', n.request_status))
		}
		row.appendChild(text)
		if (!n.is_read) row.appendChild(el('span', 'mna-np-dot'))
		row.addEventListener('click', function () {
			self.go(n)
		})
		return row
	}

	// A click on a row marks it read and goes to what it is about.
	Panel.prototype.go = function (n) {
		if (!n.is_read) {
			n.is_read = 1
			MNA.api('cafe.follow.mark_notification_read', { name: n.name }).then(
				function () {
					if (MNA.refreshBadges) MNA.refreshBadges()
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
		MNA.api(RESPOND[n.type], { name: n.reference_name, accept: accept ? 1 : 0 }).then(
			function (data) {
				if (accept && data && data.conversation)
					location.assign('/messages/' + encodeURIComponent(data.conversation))
				else if (accept && data && data.publication)
					location.assign('/publications/' + encodeURIComponent(data.publication))
				else self.load(false)
			},
			function (error) {
				node.disabled = false
				node.parentNode.classList.remove('busy')
				MNA.toast(error.message)
			}
		)
	}

	// ---- Live updates ----

	// Other scripts (the chat) share this page's live connection.
	var socketWaiters = []
	MNA.onSocket = function (callback) {
		if (MNA.socket) callback(MNA.socket)
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
			MNA.socket = socket
			socketWaiters.splice(0).forEach(function (callback) {
				callback(socket)
			})
			socket.on('notification:new', function (payload) {
				if (MNA.refreshBadges) MNA.refreshBadges()
				if (panel.isOpen) panel.load(true)
				else MNA.toast((payload.actor_name || 'Someone') + ' ' + payload.message)
			})
			socket.on('chat:new_message', function (payload) {
				if (MNA.refreshBadges) MNA.refreshBadges()
				var here = location.pathname === '/messages/' + payload.conversation
				if (!here) MNA.toast(payload.sender_name + ': ' + (payload.content || 'sent an attachment'))
			})
		}
		document.head.appendChild(script)
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (!document.querySelector('[data-bell]')) return
		var panel = new Panel()
		MNA.closeNotifications = function () {
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
