// Publications, part 3: /publications/<handle>/members: editors, members and
// pending invites, and what an admin can do with them.
;(function () {
	'use strict'

	var P = window.CAFE.pub
	var CAFE = window.CAFE
	var root
	var handle
	var title = 'Publication'
	var data

	function isAdmin() {
		return data && data.my_role === 'Admin'
	}

	function act(method, args) {
		return P.call(method, args).then(load, P.errorToast)
	}

	function setRole(m, role) {
		act('set_publication_member_role', { publication: handle, user: m.user, role: role })
	}

	function memberItems(m) {
		var items = []
		if (m.role !== 'Admin')
			items.push({
				label: 'Make admin',
				icon: P.svg('shield'),
				onClick: function () {
					setRole(m, 'Admin')
				},
			})
		if (m.role !== 'Editor')
			items.push({
				label: 'Make editor',
				icon: P.svg('pencil'),
				onClick: function () {
					setRole(m, 'Editor')
				},
			})
		if (m.role !== 'Member')
			items.push({
				label: 'Make member',
				icon: P.svg('user'),
				onClick: function () {
					setRole(m, 'Member')
				},
			})
		items.push({
			label: 'Remove from publication',
			icon: P.svg('user-minus'),
			danger: true,
			onClick: function () {
				CAFE.confirm({
					title: 'Remove this member?',
					message: m.full_name + ' will be removed from ' + title + '.',
					confirmLabel: 'Remove',
					danger: true,
				}).then(function (ok) {
					if (ok) act('remove_publication_member', { publication: handle, user: m.user })
				})
			},
		})
		return items
	}

	function roleBadge(m) {
		var kind = m.role === 'Admin' ? 'solid-green' : m.role === 'Editor' ? 'blue' : 'gray'
		var badge = P.badge(m.role, kind)
		if (isAdmin() && m.user !== P.me) {
			badge.classList.add('clickable')
			badge.addEventListener('click', function () {
				CAFE.popupMenu(badge, memberItems(m))
			})
		}
		return badge
	}

	function personRow(m) {
		var row = P.el('div', 'cafe-p-row')
		row.appendChild(P.avatar(m.user_image, m.full_name, 'md'))
		var text = P.el('div', 'cafe-p-row-text')
		text.appendChild(P.el('span', 'cafe-p-row-name', m.full_name))
		if (m.user === P.me) text.appendChild(P.badge('You', 'gray'))
		row.appendChild(text)
		row.appendChild(roleBadge(m))
		return row
	}

	function section(label, iconName, rows) {
		var wrap = P.el('div', 'cafe-p-section')
		var head = P.el('span', 'cafe-p-section-title')
		if (iconName) head.appendChild(P.icon(iconName, 'cafe-p-tiny'))
		head.appendChild(document.createTextNode(label))
		wrap.appendChild(head)
		var card = P.el('div', 'cafe-p-card')
		rows.forEach(function (row) {
			card.appendChild(row)
		})
		wrap.appendChild(card)
		return wrap
	}

	function pendingRow(p) {
		var row = P.el('div', 'cafe-p-row')
		row.appendChild(P.avatar(p.user_image, p.full_name, 'md'))
		row.appendChild(P.el('span', 'cafe-p-row-name grow', p.full_name))
		row.appendChild(P.badge(p.role, 'gray'))
		var cancel = P.el('button', 'cafe-btn cafe-btn-subtle cafe-p-cancel', 'Cancel')
		cancel.type = 'button'
		cancel.addEventListener('click', function () {
			act('cancel_publication_invite', { name: p.name })
		})
		row.appendChild(cancel)
		return row
	}

	function head() {
		var wrap = P.el('div', 'cafe-p-members-head')
		var left = P.el('div', 'cafe-p-members-left')
		var back = P.el('a', 'cafe-p-back')
		back.href = '/publications/' + encodeURIComponent(handle)
		back.setAttribute('aria-label', 'Back')
		back.appendChild(P.icon('arrow-left', 'cafe-p-small'))
		left.appendChild(back)
		left.appendChild(P.el('h1', 'cafe-p-h1', 'Members from ' + title))
		wrap.appendChild(left)
		if (isAdmin()) {
			var invite = P.el('a', 'cafe-btn cafe-btn-subtle cafe-p-invite')
			invite.href = '/invite?pub=' + encodeURIComponent(handle)
			invite.appendChild(P.icon('user-plus', 'cafe-p-small'))
			invite.appendChild(P.el('span', '', 'Invite'))
			wrap.appendChild(invite)
		}
		return wrap
	}

	function draw() {
		root.replaceChildren(head())
		root.appendChild(section('Editors', 'pencil', data.editors.map(personRow)))
		if (data.members.length) root.appendChild(section('Members', 'user', data.members.map(personRow)))
		if (isAdmin() && data.pending_invites.length)
			root.appendChild(section('Pending invites', null, data.pending_invites.map(pendingRow)))
	}

	function load() {
		return P.get('list_publication_members', { publication: handle }).then(
			function (result) {
				data = result
				draw()
			},
			function (error) {
				root.replaceChildren(
					P.el(
						'p',
						'cafe-p-empty',
						/HTTP (403|404|417)/.test(error.message)
							? "You're not a member of this publication."
							: "Couldn't load the members. Please try again."
					)
				)
			}
		)
	}

	document.addEventListener('DOMContentLoaded', function () {
		root = document.getElementById('cafe-pub-members')
		if (!root) return
		handle = P.handle(root)
		root.replaceChildren(P.skeleton(6))
		// The title is only for the heading and the crumbs; the members are the page.
		P.get('get_publication', { handle: handle }).then(
			function (pub) {
				title = pub.title
				P.setTitle(title, false)
				var back = document.querySelector('.cafe-mobile-back')
				if (back) back.setAttribute('href', '/publications/' + encodeURIComponent(handle))
				if (data) draw()
			},
			function () {}
		)
		load()
	})
})()
