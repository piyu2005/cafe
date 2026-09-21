// Settings. On a desktop it is a dialog that opens over the current page (from
// the logo menu's "Settings", or ?settings=account|saved in the address). On a
// phone it is the /settings page, which this script also runs: its tabs and
// the Saved list. Every page loads this script. Needs ui.js and shell.js.
;(function () {
	'use strict'

	var MNA = (window.MNA = window.MNA || {})
	var ICONS = '@@ICONS@@'
	var DESKTOP = window.matchMedia('(min-width: 768px)')
	var TABS = ['account', 'saved']
	var TITLES = { account: 'Account', saved: 'Saved posts' }

	var el = function (tag, className, text) {
		return MNA.el(tag, className, text)
	}

	function icon(name) {
		var holder = document.createElement('span')
		holder.className = 'mna-set-icon'
		holder.innerHTML = ICONS[name] || ''
		return holder
	}

	// The part of the email before the "@": what the old app shows as the username.
	function currentUser() {
		var match = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
		var user = match ? decodeURIComponent(match[1]) : ''
		return user && user !== 'Guest' ? user : ''
	}

	// ---- Saved posts ----

	// Plain text of some HTML. DOMParser gives an inert document, so nothing in
	// the post (an image with an onerror) loads or runs.
	function plainText(html) {
		return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '').trim()
	}
	function excerpt(html) {
		var text = plainText(html)
		return text.length > 140 ? text.slice(0, 140) + '…' : text
	}
	function coverOf(post) {
		var url = post.cover_image || (post.post_type !== 'Video' ? post.attachment : '')
		return /^(\/|https?:\/\/)/.test(url || '') ? url : ''
	}

	function savedRow(post, first, onOpen, onRemove) {
		var row = el('div', 'mna-saved-row' + (first ? ' first' : ''))
		var link = el('a', 'mna-saved-link')
		link.href = '/posts/' + encodeURIComponent(post.name)
		link.addEventListener('click', onOpen)
		var text = el('div', 'mna-saved-text')
		text.appendChild(el('div', 'mna-saved-title', post.display_title || post.title || 'Untitled'))
		text.appendChild(el('p', 'mna-saved-excerpt', excerpt(post.content)))
		text.appendChild(el('div', 'mna-saved-by', 'By ' + (post.author_name || '')))
		link.appendChild(text)
		var cover = coverOf(post)
		if (cover) {
			var image = el('img', 'mna-saved-cover')
			image.src = cover
			image.alt = ''
			image.loading = 'lazy'
			link.appendChild(image)
		}
		var remove = el('button', 'mna-saved-remove')
		remove.type = 'button'
		remove.setAttribute('aria-label', 'Remove from saved posts')
		remove.appendChild(icon('bookmark-minus'))
		remove.addEventListener('click', function () {
			onRemove(post)
		})
		row.appendChild(link)
		row.appendChild(remove)
		return row
	}

	// Fills `panel` (the Saved tab's container) with the saved posts. `panel`
	// holds .mna-loading, .mna-saved-empty, .mna-saved-error and .mna-saved-list.
	var savedRequest = 0
	function loadSaved(panel, onOpen) {
		var loading = panel.querySelector('.mna-loading')
		var empty = panel.querySelector('.mna-saved-empty')
		var failed = panel.querySelector('.mna-saved-error')
		var list = panel.querySelector('.mna-saved-list')
		var posts = []
		var request = ++savedRequest

		function render() {
			list.replaceChildren()
			posts.forEach(function (post, index) {
				list.appendChild(savedRow(post, index === 0, onOpen, remove))
			})
			empty.hidden = posts.length > 0
		}

		// The post leaves the list at once; the server confirms afterwards.
		function remove(post) {
			var before = posts
			posts = posts.filter(function (item) {
				return item.name !== post.name
			})
			render()
			MNA.api('cafe.api.toggle_save_post', { post: post.name }).then(
				function (result) {
					// `saved` true means it is still saved (a double click, say): put it back.
					if (!result || result.saved) {
						posts = before
						render()
					}
				},
				function () {
					posts = before
					render()
					MNA.toast("Couldn't remove that post. Please try again.", 'error')
				}
			)
		}

		list.replaceChildren()
		empty.hidden = true
		failed.hidden = true
		loading.hidden = false
		MNA.get('cafe.api.list_saved_posts').then(
			function (data) {
				if (request !== savedRequest) return
				loading.hidden = true
				posts = data || []
				render()
			},
			function () {
				if (request !== savedRequest) return
				loading.hidden = true
				failed.hidden = false
			}
		)
	}

	// ---- The page (phones) ----

	function setupPage(root) {
		var buttons = root.querySelectorAll('.mna-tab-btn')
		var account = document.getElementById('mna-settings-account')
		var saved = document.getElementById('mna-settings-saved')

		function show(tab, updateAddress) {
			buttons.forEach(function (button) {
				button.setAttribute('aria-selected', button.getAttribute('data-tab') === tab ? 'true' : 'false')
			})
			account.hidden = tab !== 'account'
			saved.hidden = tab !== 'saved'
			if (tab === 'saved') loadSaved(saved, function () {})
			if (updateAddress) {
				// The tab is in the address, so Back from a saved post returns to it.
				var url = new URL(location.href)
				if (tab === 'account') url.searchParams.delete('tab')
				else url.searchParams.set('tab', tab)
				history.replaceState(null, '', url)
			}
		}

		root.addEventListener('click', function (event) {
			var button = event.target.closest('.mna-tab-btn')
			if (button) show(button.getAttribute('data-tab'), true)
		})
		document.getElementById('mna-settings-logout').addEventListener('click', function () {
			MNA.confirmLogout()
		})
		show(new URLSearchParams(location.search).get('tab') === 'saved' ? 'saved' : 'account', false)
	}

	// ---- The dialog (desktops) ----

	var dialog = null

	function accountRow(title, description, control, first) {
		var row = el('div', 'mna-set-row' + (first ? ' first' : ''))
		var text = el('div', 'mna-set-row-text')
		text.appendChild(el('div', 'mna-set-row-title', title))
		if (description) text.appendChild(el('div', 'mna-set-row-desc', description))
		row.appendChild(text)
		row.appendChild(control)
		return row
	}

	function buildAccount(close) {
		var user = currentUser()
		var box = el('div', 'mna-set-rows')
		box.appendChild(accountRow('Username', '', el('span', 'mna-set-value', '@' + user.split('@')[0]), true))
		box.appendChild(accountRow('Email address', '', el('span', 'mna-set-value', user)))
		var logOut = el('button', 'mna-set-button', 'Log out')
		logOut.type = 'button'
		logOut.addEventListener('click', function () {
			close()
			MNA.confirmLogout()
		})
		box.appendChild(accountRow('Log out', 'Sign out of your account on this device.', logOut))
		var remove = el('button', 'mna-set-button danger', 'Delete account')
		remove.type = 'button'
		remove.disabled = true
		box.appendChild(
			accountRow('Delete account', 'Temporarily unavailable. Contact support if you need this.', remove)
		)
		return box
	}

	function buildSavedPanel() {
		var panel = el('div', 'mna-saved-panel')
		var loading = el('div', 'mna-loading')
		loading.hidden = true
		for (var i = 0; i < 4; i++) loading.appendChild(el('div', 'mna-skeleton'))
		var empty = el('p', 'mna-saved-empty', 'No saved posts yet.')
		var failed = el('p', 'mna-saved-error', "Couldn't load your saved posts. Please try again.")
		empty.hidden = failed.hidden = true
		panel.appendChild(loading)
		panel.appendChild(empty)
		panel.appendChild(failed)
		panel.appendChild(el('div', 'mna-saved-list'))
		return panel
	}

	function openDialog(tab) {
		if (dialog) return
		if (MNA.closeNotifications) MNA.closeNotifications()
		var user = currentUser()
		var opener = document.activeElement
		var overlay = el('div', 'mna-overlay mna-set-overlay')
		var modal = el('div', 'mna-set-modal')
		modal.setAttribute('role', 'dialog')
		modal.setAttribute('aria-modal', 'true')
		modal.setAttribute('aria-label', 'Settings')
		modal.tabIndex = -1

		var side = el('div', 'mna-set-side')
		side.appendChild(el('div', 'mna-set-group', 'User settings'))
		var nav = el('div', 'mna-set-nav')
		var navButtons = {}
		TABS.forEach(function (key) {
			var button = el('button', 'mna-set-nav-item')
			button.type = 'button'
			if (key === 'account') {
				var avatar = el('span', 'mna-set-avatar', (user.charAt(0) || '?').toUpperCase())
				button.appendChild(avatar)
			} else {
				button.appendChild(icon('bookmark'))
			}
			button.appendChild(el('span', 'mna-set-nav-label', key === 'account' ? 'Account' : 'Saved posts'))
			button.addEventListener('click', function () {
				select(key)
			})
			navButtons[key] = button
			nav.appendChild(button)
		})
		side.appendChild(nav)

		var content = el('div', 'mna-set-content')
		var title = el('h2', 'mna-set-title')
		var body = el('div', 'mna-set-body')
		var accountPanel = buildAccount(close)
		var savedPanel = buildSavedPanel()
		body.appendChild(accountPanel)
		body.appendChild(savedPanel)
		content.appendChild(title)
		content.appendChild(body)
		modal.appendChild(side)
		modal.appendChild(content)
		overlay.appendChild(modal)

		function select(key) {
			TABS.forEach(function (name) {
				var active = name === key
				navButtons[name].classList.toggle('active', active)
				if (active) navButtons[name].setAttribute('aria-current', 'true')
				else navButtons[name].removeAttribute('aria-current')
			})
			title.textContent = TITLES[key]
			accountPanel.hidden = key !== 'account'
			savedPanel.hidden = key !== 'saved'
			body.scrollTop = 0
			dialog.tab = key
			if (key === 'saved') loadSaved(savedPanel, close)
		}

		function close() {
			if (!dialog) return
			document.removeEventListener('keydown', onKey)
			DESKTOP.removeEventListener('change', onResize)
			document.body.style.overflow = dialog.bodyOverflow
			overlay.remove()
			var tab = dialog.tab
			dialog = null
			if (opener && opener.focus && document.contains(opener)) opener.focus()
			return tab
		}
		function onKey(event) {
			if (event.key === 'Escape') {
				event.stopPropagation()
				close()
			}
		}
		// Below 768px Settings is a page, so a window that shrinks takes you there.
		function onResize(event) {
			if (event.matches) return
			var tab = close()
			location.assign('/settings' + (tab === 'saved' ? '?tab=saved' : ''))
		}

		dialog = { tab: tab, bodyOverflow: document.body.style.overflow }
		overlay.addEventListener('mousedown', function (event) {
			if (event.target === overlay) close()
		})
		document.addEventListener('keydown', onKey)
		DESKTOP.addEventListener('change', onResize)
		document.body.style.overflow = 'hidden'
		document.body.appendChild(overlay)
		select(tab)
		modal.focus()
	}
	MNA.openSettings = function (tab) {
		openDialog(tab === 'saved' ? 'saved' : 'account')
	}

	function setupDialogTriggers() {
		// The logo menu's Settings is a link (so it works without this script);
		// on a desktop it opens the dialog instead of leaving the page.
		document.addEventListener('click', function (event) {
			var link = event.target.closest('.mna-menu a[href="/settings"]')
			if (!link || !DESKTOP.matches || event.ctrlKey || event.metaKey || event.shiftKey || event.button) return
			event.preventDefault()
			if (MNA.closeMenu) MNA.closeMenu()
			openDialog('account')
		})
		var wanted = new URLSearchParams(location.search).get('settings')
		if (TABS.indexOf(wanted) >= 0 && DESKTOP.matches) {
			var url = new URL(location.href)
			url.searchParams.delete('settings')
			history.replaceState(null, '', url)
			openDialog(wanted)
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('mna-settings-page')
		if (!root) return setupDialogTriggers()
		// A desktop gets the dialog over the Home feed. The Builder editor's
		// Preview shows this page inside a frame: leave that one alone.
		// The Administrator stays: Builder draws the folder thumbnail as that user.
		if (DESKTOP.matches && window.top === window && !root.getAttribute('data-admin')) {
			var tab = new URLSearchParams(location.search).get('tab') === 'saved' ? 'saved' : 'account'
			location.replace('/?settings=' + tab)
			return
		}
		setupPage(root)
		// A phone that grows to desktop width gets the dialog too.
		DESKTOP.addEventListener('change', function (event) {
			if (event.matches && window.top === window)
				location.replace('/?settings=' + root.querySelector('[aria-selected="true"]').getAttribute('data-tab'))
		})
	})
})()
