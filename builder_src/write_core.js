// The native post editor, part 1: what the other parts share (W), the server
// and the small helpers. Load order: write_core, write_editor, write_preview,
// write_live. Needs ui.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var W = (CAFE.write = {})

	W.ICONS = '@@ICONS@@'
	W.base = '/write'
	var POSTS = '/api/v2/document/Post'
	var UPLOAD = { optimize: '1', max_width: '1600', max_height: '1600' }
	var WORDS_PER_MINUTE = 200
	var EXCERPT_LENGTH = 140

	// What is on screen.
	W.state = {
		postId: null,
		loaded: false,
		status: 'Draft',
		savedAt: null,
		saving: null, // the status being saved
		coverRemoved: false,
		form: {
			title: '',
			post_type: 'Blog',
			attachment: '',
			images: [],
			cover_image: '',
			excerpt: '',
			display_title: '',
			tags: '',
		},
	}

	var listeners = {}
	W.on = function (name, callback) {
		;(listeners[name] = listeners[name] || []).push(callback)
	}
	W.emit = function (name, payload) {
		;(listeners[name] || []).forEach(function (callback) {
			callback(payload)
		})
	}

	W.el = function (tag, className, text) {
		return CAFE.el(tag, className, text)
	}

	W.icon = function (name, className) {
		var span = document.createElement('span')
		span.className = 'cafe-w-icon ' + (className || '')
		span.innerHTML = (W.ICONS && W.ICONS[name]) || ''
		return span
	}

	W.isMobile = function () {
		return window.matchMedia('(max-width: 767px)').matches
	}

	// ---- Text helpers ----

	// Posts from before the rich editor are plain text with newlines.
	W.ensureHtml = function (raw) {
		if (!raw) return ''
		if (/<[a-z][\s\S]*>/i.test(raw)) return raw
		return raw
			.split(/\n{2,}/)
			.map(function (part) {
				return '<p>' + escapeHtml(part.trim()).replace(/\n/g, '<br>') + '</p>'
			})
			.join('')
	}

	function escapeHtml(text) {
		return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	}

	W.plainText = function (html) {
		return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || ''
	}

	W.readTime = function (html) {
		var words = W.plainText(html).trim().split(/\s+/).filter(Boolean).length
		return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
	}

	W.autoExcerpt = function (html) {
		var text = W.plainText(W.ensureHtml(html)).trim()
		return text.length > EXCERPT_LENGTH ? text.slice(0, EXCERPT_LENGTH) + '…' : text
	}

	W.firstImage = function (html) {
		var match = W.ensureHtml(html).match(/<img[^>]+src="([^"]+)"/)
		return match ? match[1].replace(/&amp;/g, '&') : ''
	}

	W.timeAgo = function (date) {
		var seconds = Math.floor((Date.now() - date.getTime()) / 1000)
		if (seconds < 30) return 'just now'
		if (seconds < 60) return seconds + 's ago'
		var minutes = Math.floor(seconds / 60)
		if (minutes < 60) return minutes + 'm ago'
		var hours = Math.floor(minutes / 60)
		if (hours < 24) return hours + 'h ago'
		return Math.floor(hours / 24) + 'd ago'
	}

	// ---- The server ----

	W.errorToast = function (error) {
		CAFE.toast((error && error.message) || CAFE.DEFAULT_ERROR, 'error')
	}

	W.load = function (id) {
		return CAFE.request('GET', POSTS + '/' + encodeURIComponent(id))
	}
	W.create = function (payload) {
		return CAFE.request('POST', POSTS, payload)
	}
	W.update = function (id, payload) {
		return CAFE.request('PUT', POSTS + '/' + encodeURIComponent(id), payload)
	}
	W.remove = function (id) {
		return CAFE.request('DELETE', POSTS + '/' + encodeURIComponent(id))
	}

	// Uploads a file and resolves with { file_url, file_name }. `options` are
	// extra form fields; pass {} for a file that is stored as it is.
	W.upload = function (file, options) {
		var form = new FormData()
		form.append('file', file, file.name)
		form.append('is_private', '1')
		var extra = options || UPLOAD
		Object.keys(extra).forEach(function (key) {
			form.append(key, extra[key])
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
					return { file_url: body.message.file_url, file_name: body.message.file_name }
				})
		})
	}
	W.uploadStory = function (file) {
		return W.upload(file, UPLOAD)
	}

	// ---- A small menu next to a button ----
	var openMenu = null
	function closeMenu() {
		if (openMenu) {
			openMenu.remove()
			openMenu = null
		}
	}
	document.addEventListener('mousedown', function (event) {
		if (openMenu && !openMenu.contains(event.target) && !event.target.closest('[data-menu-anchor]')) closeMenu()
	})
	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') closeMenu()
	})

	// items: { label, icon, onClick, danger, active }
	W.menu = function (anchor, items) {
		if (openMenu) {
			closeMenu()
			return
		}
		var menu = W.el('div', 'cafe-w-menu')
		anchor.setAttribute('data-menu-anchor', '')
		items.forEach(function (item) {
			var button = W.el(
				'button',
				'cafe-w-menu-item' + (item.danger ? ' danger' : '') + (item.active ? ' active' : '')
			)
			button.type = 'button'
			button.appendChild(W.icon(item.icon, 'cafe-w-small'))
			button.appendChild(W.el('span', '', item.label))
			// mousedown, so the editor keeps its selection until the command runs.
			button.addEventListener('mousedown', function (event) {
				event.preventDefault()
			})
			button.addEventListener('click', function () {
				closeMenu()
				item.onClick()
			})
			menu.appendChild(button)
		})
		document.body.appendChild(menu)
		var rect = anchor.getBoundingClientRect()
		var width = menu.offsetWidth
		menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px'
		menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px'
		openMenu = menu
	}
	W.closeMenu = closeMenu
})()
