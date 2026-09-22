// The native chat, part 1: what the other parts share. Everything is on
// CAFE.chat. Load order: chat_core, chat_list, chat_thread, chat_composer,
// chat_actions, chat_live. Needs ui.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var C = (CAFE.chat = {})

	C.ICONS = '@@ICONS@@'

	// Where the chat lives in the address bar.
	C.base = '/messages'

	C.me = (function () {
		var match = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
		return match ? decodeURIComponent(match[1]) : ''
	})()

	// What is on screen. The other parts read and change this, then emit.
	C.state = {
		conversations: null,
		requests: null,
		showRequests: false,
		search: '',
		people: null,
		active: null, // id of the open conversation
		conversation: null, // its details
		messages: [],
		replyingTo: null,
		editing: null,
		typing: false,
	}

	// ---- A small event bus ----
	var listeners = {}
	C.on = function (name, callback) {
		;(listeners[name] = listeners[name] || []).push(callback)
	}
	C.emit = function (name, payload) {
		;(listeners[name] || []).forEach(function (callback) {
			callback(payload)
		})
	}

	// ---- The server ----
	var PATH = 'cafe.chat.'
	C.call = function (method, args) {
		return CAFE.api(PATH + method, args || {})
	}
	C.fetch = function (method, params) {
		return CAFE.get(PATH + method, params || {})
	}

	// ---- Small helpers ----
	C.el = function (tag, className, text) {
		return CAFE.el(tag, className, text)
	}

	C.icon = function (name, className) {
		var span = document.createElement('span')
		span.className = 'cafe-c-icon ' + (className || '')
		span.innerHTML = (C.ICONS && C.ICONS[name]) || ''
		return span
	}

	// A round avatar with the person's picture or first letter.
	C.avatar = function (image, label, size) {
		var box = C.el('span', 'cafe-c-avatar cafe-c-avatar-' + (size || 'md'))
		if (/^(\/|https?:\/\/)/.test(image || '')) {
			var img = C.el('img')
			img.src = image
			img.alt = ''
			box.appendChild(img)
		} else {
			box.textContent = String(label || '?')
				.trim()
				.charAt(0)
		}
		return box
	}

	C.formatTime = function (value) {
		if (!value) return ''
		return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
	}

	// Links come from other people's messages: only web addresses and paths of this site.
	C.safeUrl = function (url) {
		return /^(https?:\/\/|\/(?!\/))/i.test(url || '') ? url : '#'
	}

	C.isHtml = function (text) {
		return /<[a-z][\s\S]*>/i.test(text || '')
	}

	C.plainText = function (html) {
		return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '')
			.replace(/\s+/g, ' ')
			.trim()
	}

	// What a message says in one line, for the list and for replies.
	C.previewText = function (m) {
		if (!m) return ''
		if (m.is_deleted) return 'This message was deleted'
		if (m.content) return C.isHtml(m.content) ? C.plainText(m.content) : m.content
		if (m.attachments && m.attachments.length) return 'Attachment'
		if (m.shared_post) return 'Shared post'
		if (m.poll_data) return 'Poll'
		return ''
	}

	C.isImageFile = function (name) {
		return /\.(jpe?g|png|gif|webp)$/i.test(name || '')
	}

	C.formatBytes = function (bytes) {
		if (!bytes && bytes !== 0) return ''
		if (bytes < 1024) return bytes + ' B'
		if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
		return (bytes / 1048576).toFixed(1) + ' MB'
	}

	C.isMobile = function () {
		return window.matchMedia('(max-width: 767px)').matches
	}

	// ---- The address ----

	C.address = function (id) {
		return C.base + (id ? '/' + encodeURIComponent(id) : '')
	}

	C.idFromAddress = function () {
		var match = location.pathname.match(new RegExp('^' + C.base + '/([^/]+)'))
		return match ? decodeURIComponent(match[1]) : null
	}

	// Opens a conversation (or the list, with no id) and keeps Back working.
	C.open = function (id, replace) {
		if (id === C.state.active) return
		if (window.top === window) history[replace ? 'replaceState' : 'pushState'](null, '', C.address(id))
		C.emit('open', id)
	}

	window.addEventListener('popstate', function () {
		C.emit('open', C.idFromAddress())
	})

	// ---- Reloading the two lists ----
	C.loadConversations = function () {
		return C.fetch('list_conversations').then(
			function (rows) {
				C.state.conversations = rows || []
				C.emit('conversations')
			},
			function () {}
		)
	}

	C.loadRequests = function () {
		return C.fetch('list_message_requests').then(
			function (rows) {
				C.state.requests = rows || []
				C.emit('conversations')
			},
			function () {}
		)
	}

	C.errorToast = function (error) {
		CAFE.toast((error && error.message) || CAFE.DEFAULT_ERROR, 'error')
	}
})()
