// Publications, part 1: what the three pages share (P). Load order: pub_core,
// then the page's own script. Needs ui.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var P = (CAFE.pub = {})
	var WORDS_PER_MINUTE = 200

	P.ICONS = '@@ICONS@@'
	P.API = 'cafe.api.'

	P.el = function (tag, className, text) {
		return CAFE.el(tag, className, text)
	}

	P.icon = function (name, className) {
		var span = document.createElement('span')
		span.className = 'cafe-p-icon ' + (className || '')
		span.innerHTML = (P.ICONS && P.ICONS[name]) || ''
		return span
	}

	P.svg = function (name) {
		return (P.ICONS && P.ICONS[name]) || ''
	}

	P.get = function (method, params) {
		return CAFE.get(P.API + method, params)
	}
	P.call = function (method, args) {
		return CAFE.api(P.API + method, args)
	}

	P.me = (function () {
		var match = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
		return match ? decodeURIComponent(match[1]) : ''
	})()

	// The handle: from /publications/<handle>[/members], or the page's own attribute (Builder's Preview).
	P.handle = function (root) {
		var match = location.pathname.match(/^\/publications\/([^/]+)/)
		return match ? decodeURIComponent(match[1]) : root.getAttribute('data-handle') || ''
	}

	P.avatar = function (image, label, size) {
		var box = P.el('span', 'cafe-p-avatar cafe-p-avatar-' + (size || 'md'))
		if (/^(\/|https?:\/\/)/.test(image || '')) {
			var img = P.el('img')
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

	// A small pill: kind is 'solid-green', 'blue' or 'gray'.
	P.badge = function (label, kind) {
		return P.el('span', 'cafe-p-badge ' + (kind || 'gray'), label)
	}

	P.plainText = function (html) {
		return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '').trim()
	}
	P.excerpt = function (html, length) {
		var text = P.plainText(html)
		return text.length > length ? text.slice(0, length) + '…' : text
	}
	P.readTime = function (html) {
		var words = P.plainText(html).split(/\s+/).filter(Boolean).length
		return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
	}
	P.date = function (value) {
		if (!value) return ''
		return new Date(value.replace(' ', 'T')).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})
	}

	P.errorToast = function (error) {
		CAFE.toast((error && error.message) || CAFE.DEFAULT_ERROR, 'error')
	}

	// Names on the page, whichever page it is.
	P.setTitle = function (title, alsoMobile) {
		var crumb = document.getElementById('cafe-p-crumb')
		if (crumb) crumb.textContent = title
		var mobile = document.querySelector('.cafe-mobile-title')
		if (alsoMobile && mobile) mobile.textContent = title
	}

	P.skeleton = function (lines) {
		var wrap = P.el('div', 'cafe-p-skeleton')
		for (var i = 0; i < lines; i++) wrap.appendChild(P.el('div', 'cafe-skeleton'))
		return wrap
	}
})()
