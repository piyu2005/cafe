// Behaviour of the shared app shell (rail, bottom bar, logo menu). Needs ui.js.
// Builder runs client scripts before the page data and CSRF token exist, so
// everything that needs them runs inside event handlers or after DOMContentLoaded.
// API calls use location.origin because Builder's editor Preview adds a <base href>
// that can point at another origin (the site's host_name).
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})

	// The rail is either the narrow icon rail or the wide sidebar. The choice is
	// kept in this browser, and set on <html> as early as this script runs, so
	// the page is drawn with the right one.
	var SIDEBAR_KEY = 'cafe-sidebar'
	try {
		if (localStorage.getItem(SIDEBAR_KEY) === 'open')
			document.documentElement.setAttribute('data-cafe-sidebar', 'open')
	} catch (e) {
		/* storage may be blocked */
	}

	function setSidebar(open) {
		if (open) document.documentElement.setAttribute('data-cafe-sidebar', 'open')
		else document.documentElement.removeAttribute('data-cafe-sidebar')
		try {
			if (open) localStorage.setItem(SIDEBAR_KEY, 'open')
			else localStorage.removeItem(SIDEBAR_KEY)
		} catch (e) {
			/* storage may be blocked */
		}
	}

	function setupSidebarToggle() {
		document.addEventListener('click', function (event) {
			var button = event.target.closest('[data-sidebar-toggle]')
			if (!button) return
			setSidebar(button.getAttribute('data-sidebar-toggle') === 'open')
			// The button that was pressed is gone; keep its tooltip and focus ring from lingering.
			button.blur()
		})
	}

	var NAV_PATHS = {
		home: function (p) {
			return p === '/'
		},
		search: function (p) {
			return p === '/search' || p.indexOf('/search/') === 0 || p === '/invite'
		},
		messages: function (p) {
			return p.indexOf('/messages') === 0
		},
		profile: function (p) {
			return p.indexOf('/profile') === 0
		},
		settings: function (p) {
			return p.indexOf('/settings') === 0
		},
		notifications: function () {
			return false
		},
	}

	function markActiveNav() {
		var path = location.pathname.replace(/\/+$/, '') || '/'
		document.querySelectorAll('[data-nav]').forEach(function (el) {
			var active = NAV_PATHS[el.getAttribute('data-nav')](path)
			el.classList.toggle('active', active)
			if (active) el.setAttribute('aria-current', 'page')
		})
	}

	// The unread counts on the rail's and the top bars' badges.
	var COUNTS = {
		messages: 'cafe.chat.unread_message_count',
		notifications: 'cafe.follow.unread_notification_count',
	}
	var REFRESH_MS = 60000

	function setBadge(kind, count) {
		document.querySelectorAll('[data-badge="' + kind + '"]').forEach(function (el) {
			el.textContent = count > 99 ? '99+' : String(count)
			el.classList.toggle('show', count > 0)
		})
	}

	function refreshBadges() {
		Object.keys(COUNTS).forEach(function (kind) {
			fetch(location.origin + '/api/v2/method/' + COUNTS[kind], { credentials: 'same-origin' })
				.then(function (r) {
					return r.ok ? r.json() : null
				})
				.then(function (body) {
					if (body && typeof body.data === 'number') setBadge(kind, body.data)
				})
				.catch(function () {})
		})
	}
	CAFE.refreshBadges = refreshBadges

	// Counts change while a page sits open, so look again now and then and
	// when the tab comes back into view. (Live updates are in notifications.js.)
	function keepBadgesFresh() {
		refreshBadges()
		setInterval(function () {
			if (!document.hidden) refreshBadges()
		}, REFRESH_MS)
		document.addEventListener('visibilitychange', function () {
			if (!document.hidden) refreshBadges()
		})
	}

	function setupLogoMenu() {
		var logos = document.querySelectorAll('[data-logo]')
		var menu = document.getElementById('cafe-menu')
		if (!logos.length || !menu) return

		function setOpen(open) {
			menu.classList.toggle('open', open)
			logos.forEach(function (logo) {
				logo.setAttribute('aria-expanded', open ? 'true' : 'false')
			})
		}
		CAFE.closeMenu = function () {
			setOpen(false)
		}
		logos.forEach(function (logo) {
			logo.addEventListener('click', function (e) {
				e.stopPropagation()
				// The notifications panel covers the menu, so it closes first.
				if (CAFE.closeNotifications) CAFE.closeNotifications()
				setOpen(!menu.classList.contains('open'))
			})
		})
		document.addEventListener('click', function (e) {
			if (!menu.contains(e.target)) setOpen(false)
		})
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') setOpen(false)
		})

		var logoutButton = document.getElementById('cafe-logout')
		if (logoutButton) {
			logoutButton.addEventListener('click', function () {
				setOpen(false)
				confirmLogout()
			})
		}
	}

	function logout() {
		fetch(location.origin + '/api/method/logout', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-Frappe-CSRF-Token': (window.frappe && window.frappe.csrf_token) || '' },
		}).finally(function () {
			location.assign('/login')
		})
	}

	function confirmLogout() {
		CAFE.confirm({ title: 'Log out?', message: 'You can always log back in.', confirmLabel: 'Log out' }).then(
			function (ok) {
				if (ok) logout()
			}
		)
	}

	CAFE.confirmLogout = confirmLogout

	document.addEventListener('DOMContentLoaded', function () {
		markActiveNav()
		setupLogoMenu()
		setupSidebarToggle()
		keepBadgesFresh()
	})
})()
