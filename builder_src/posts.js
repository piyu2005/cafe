// Profile posts page. The list of published posts is rendered by the server.
// On your own profile this script adds the tabs: Drafts and Archived are
// fetched when their tab opens, like the old page does. Needs ui.js.
;(function () {
	'use strict'

	var FIELDS = [
		'name',
		'title',
		'display_title',
		'content',
		'excerpt',
		'status',
		'modified',
		'post_type',
		'cover_image',
		'attachment',
	]
	var PAGE_SIZE = 100
	var TABS = {
		drafts: { status: 'Draft', empty: "You don't have any drafts." },
		archived: { status: 'Archived', empty: "You don't have any archived posts." },
	}

	var root, published, other, loading, emptyText, list, template
	var latestRequest = 0

	// Plain text of some HTML. DOMParser gives an inert document, so nothing in
	// the post (an image with an onerror, a script) loads or runs.
	function plainText(html) {
		return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '').trim()
	}
	function preview(post) {
		if (post.excerpt) return post.excerpt
		var text = plainText(post.content)
		return text.length > 140 ? text.slice(0, 140) + '…' : text
	}
	function formatDate(value) {
		if (!value) return ''
		return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
	}
	function thumbnailOf(post) {
		var url = post.cover_image || (post.post_type === 'Image' ? post.attachment : '')
		return /^(\/|https?:\/\/)/.test(url || '') ? url : ''
	}

	function renderRow(post) {
		var row = template.content.firstElementChild.cloneNode(true)
		// Drafts and archived posts open in the editor: there is nothing public to see yet.
		row.href = '/write/' + encodeURIComponent(post.name)
		row.querySelector('.cafe-row-title').textContent = post.display_title || post.title || 'Untitled'
		row.querySelector('.cafe-row-excerpt').textContent = preview(post)
		row.querySelector('.cafe-row-meta').textContent = formatDate(post.modified)
		var image = row.querySelector('.cafe-row-thumb')
		var url = thumbnailOf(post)
		if (url) {
			image.src = url
			image.loading = 'lazy'
		} else {
			image.remove()
		}
		return row
	}

	function fetchPosts(status) {
		var query = [
			'fields=' + encodeURIComponent(JSON.stringify(FIELDS)),
			'filters=' + encodeURIComponent(JSON.stringify({ author: root.getAttribute('data-user'), status: status })),
			'order_by=' + encodeURIComponent('modified desc'),
			'start=0',
			'limit=' + PAGE_SIZE,
		].join('&')
		return fetch(location.origin + '/api/v2/document/Post?' + query, { credentials: 'same-origin' })
			.then(function (r) {
				if (!r.ok) throw new Error('HTTP ' + r.status)
				return r.json()
			})
			.then(function (body) {
				return body.data || []
			})
	}

	function loadOther(tab) {
		var request = ++latestRequest
		list.replaceChildren()
		emptyText.hidden = true
		loading.hidden = false
		fetchPosts(TABS[tab].status).then(
			function (posts) {
				if (request !== latestRequest) return
				loading.hidden = true
				if (!posts.length) {
					emptyText.textContent = TABS[tab].empty
					emptyText.hidden = false
					return
				}
				posts.forEach(function (post) {
					list.appendChild(renderRow(post))
				})
			},
			function () {
				if (request !== latestRequest) return
				loading.hidden = true
				emptyText.textContent = "Couldn't load your posts. Please try again."
				emptyText.hidden = false
			}
		)
	}

	function showTab(tab, updateAddress) {
		document.querySelectorAll('.cafe-tab-btn').forEach(function (button) {
			button.setAttribute('aria-selected', button.getAttribute('data-tab') === tab ? 'true' : 'false')
		})
		published.hidden = tab !== 'published'
		other.hidden = tab === 'published'
		if (tab !== 'published') loadOther(tab)
		if (updateAddress) {
			// Same as the old page: the tab is in the address, without a new history entry.
			var url = new URL(location.href)
			if (tab === 'published') url.searchParams.delete('tab')
			else url.searchParams.set('tab', tab)
			history.replaceState(null, '', url)
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		root = document.getElementById('cafe-posts-page')
		if (!root || !root.getAttribute('data-own')) return

		published = document.getElementById('cafe-panel-published')
		other = document.getElementById('cafe-panel-other')
		loading = other.querySelector('.cafe-loading')
		emptyText = other.querySelector('.cafe-other-empty')
		list = other.querySelector('.cafe-other-list')
		template = document.getElementById('cafe-post-template')

		root.addEventListener('click', function (event) {
			var button = event.target.closest('.cafe-tab-btn')
			if (button) showTab(button.getAttribute('data-tab'), true)
		})
		var initial = root.getAttribute('data-tab')
		if (TABS[initial]) showTab(initial, false)
		else showTab('published', false)
	})
})()
