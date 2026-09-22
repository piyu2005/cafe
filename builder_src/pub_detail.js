// Publications, part 2: /publications/<handle>, the publication's page: who
// runs it, subscribe, and its posts.
;(function () {
	'use strict'

	var P = window.CAFE.pub
	var COPIED = 'Link copied'
	var root
	var handle
	var data

	function button(label, kind, onClick) {
		var node = P.el('button', 'cafe-btn cafe-btn-' + kind, label)
		node.type = 'button'
		node.addEventListener('click', function () {
			onClick(node)
		})
		return node
	}

	function metaLine() {
		var line = P.el('div', 'cafe-p-meta')
		if (data.website) {
			var site = P.el('span', 'cafe-p-site')
			site.appendChild(P.icon('globe', 'cafe-p-tiny'))
			site.appendChild(document.createTextNode(data.website))
			line.appendChild(site)
			line.appendChild(P.el('span', '', '·'))
		}
		line.appendChild(P.el('span', '', '@' + data.handle))
		return line
	}

	function toggleSubscribe(node) {
		node.disabled = true
		P.call('toggle_subscribe', { reference_doctype: 'Publication', reference_name: handle }).then(
			load,
			function (error) {
				node.disabled = false
				P.errorToast(error)
			}
		)
	}

	function copyLink() {
		var done = function () {
			window.CAFE.toast(COPIED)
		}
		if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done)
		else done()
	}

	function plural(count, word) {
		return count + ' ' + word + (count === 1 ? '' : 's')
	}

	function membersLink() {
		var link = P.el('a', 'cafe-p-members-link')
		link.href = '/publications/' + encodeURIComponent(handle) + '/members'
		var stack = P.el('span', 'cafe-p-stack')
		data.members.forEach(function (m) {
			stack.appendChild(P.avatar(m.user_image, m.full_name, 'sm'))
		})
		link.appendChild(stack)
		link.appendChild(
			P.el(
				'span',
				'cafe-p-counts',
				plural(data.editor_count, 'Editor') +
					' · ' +
					plural(data.member_count, 'Member') +
					' · ' +
					plural(data.subscriber_count, 'Subscriber')
			)
		)
		link.appendChild(P.icon('arrow-right', 'cafe-p-small cafe-p-faint'))
		return link
	}

	function head() {
		var wrap = P.el('div', 'cafe-p-head')
		var tile = P.el('div', 'cafe-p-tile', data.title.charAt(0))
		var body = P.el('div', 'cafe-p-head-body')
		var titleRow = P.el('div', 'cafe-p-title-row')
		titleRow.appendChild(P.el('h1', 'cafe-p-title', data.title))
		titleRow.appendChild(
			button(
				data.subscribed_by_me ? 'Subscribed' : 'Subscribe',
				data.subscribed_by_me ? 'outline' : 'solid',
				toggleSubscribe
			)
		)
		var share = P.el('button', 'cafe-p-share')
		share.type = 'button'
		share.setAttribute('aria-label', 'Copy link')
		share.appendChild(P.icon('share-2', 'cafe-p-small'))
		share.addEventListener('click', copyLink)
		titleRow.appendChild(share)
		body.appendChild(titleRow)
		body.appendChild(metaLine())
		if (data.description) body.appendChild(P.el('p', 'cafe-p-desc', data.description))
		body.appendChild(membersLink())
		wrap.appendChild(tile)
		wrap.appendChild(body)
		return wrap
	}

	function coverFor(post) {
		if (post.cover_image) return post.cover_image
		return post.post_type !== 'Video' ? post.attachment : null
	}

	function postRow(post) {
		var row = P.el('a', 'cafe-p-post')
		row.href = '/posts/' + encodeURIComponent(post.name)
		var text = P.el('div', 'cafe-p-post-text')
		text.appendChild(
			P.el('div', 'cafe-p-post-title', post.display_title || post.title || P.excerpt(post.content, 60))
		)
		text.appendChild(P.el('p', 'cafe-p-post-excerpt', P.excerpt(post.content, 160)))
		text.appendChild(
			P.el('div', 'cafe-p-post-meta', P.date(post.creation) + ' · ' + P.readTime(post.content) + ' min read')
		)
		row.appendChild(text)
		var cover = coverFor(post)
		if (/^(\/|https?:\/\/)/.test(cover || '')) {
			var img = P.el('img', 'cafe-p-post-cover')
			img.src = cover
			img.alt = ''
			img.loading = 'lazy'
			row.appendChild(img)
		}
		return row
	}

	function draw() {
		root.replaceChildren(head())
		var list = P.el('div', 'cafe-p-posts')
		if (!data.posts.length) list.appendChild(P.el('p', 'cafe-p-empty', 'No posts yet.'))
		data.posts.forEach(function (post) {
			list.appendChild(postRow(post))
		})
		root.appendChild(list)
		P.setTitle(data.title, true)
		document.title = data.title
	}

	function load() {
		return P.get('get_publication', { handle: handle }).then(
			function (result) {
				data = result
				draw()
			},
			function (error) {
				root.replaceChildren(
					P.el(
						'p',
						'cafe-p-empty',
						/HTTP (404|417)/.test(error.message)
							? 'Publication not found.'
							: "Couldn't load this publication. Please try again."
					)
				)
			}
		)
	}

	document.addEventListener('DOMContentLoaded', function () {
		root = document.getElementById('cafe-pub')
		if (!root) return
		handle = P.handle(root)
		root.replaceChildren(P.skeleton(6))
		load()
	})
})()
