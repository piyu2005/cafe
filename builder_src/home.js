// Home feed. The first ten posts are rendered by the server. This script adds
// search (filters by title as you type) and infinite scroll: a sentinel below
// the list loads ten more when it is 400px from the screen, like the old page.
// Rows are made from the page's <template>, which has the same markup the
// server fills. Needs ui.js.
;(function () {
	'use strict'

	var PAGE_SIZE = 10
	var DEBOUNCE_MS = 250
	var FIELDS = [
		'name',
		'title',
		'display_title',
		'content',
		'excerpt',
		'post_type',
		'attachment',
		'cover_image',
		'author',
		'author_name',
		'author_image',
		'creation',
	]

	var input, list, sentinel, template, container
	var query = ''
	var loaded = 0
	var hasMore = false
	var busy = false
	var latestRequest = 0
	var timer = null
	var loadingText = null
	var emptyText = null

	function escapeHtml(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
		})
	}
	function safeUrl(value) {
		return /^(\/|https?:\/\/)/.test(value || '') ? value : ''
	}
	// DOMParser gives an inert document: nothing in a post (an image with an onerror) loads or runs.
	function plainText(html) {
		return (new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '').trim()
	}
	function shorten(text, length) {
		return text.length > length ? text.slice(0, length) + '…' : text
	}
	function formatDate(value) {
		if (!value) return ''
		return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
	}

	// The row markup is filled in one pass, so a post that contains "[[name]]"
	// is not filled a second time.
	function fill(markup, values) {
		return markup.replace(/\[\[(!?\w+)\]\]/g, function (match, key) {
			return key in values ? values[key] : match
		})
	}

	function renderRow(post) {
		var text = plainText(post.content)
		var minutes = Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200))
		var label = post.author_name || post.author || ''
		var authorImage = safeUrl(post.author_image)
		var cover = safeUrl(post.cover_image || (post.post_type !== 'Video' ? post.attachment : ''))
		var values = {
			href: escapeHtml('/posts/' + encodeURIComponent(post.name)),
			'!avatar': authorImage
				? fill(template.getAttribute('data-avatar-image'), { image: escapeHtml(authorImage) })
				: escapeHtml(label.trim().charAt(0)),
			name: escapeHtml(label),
			title: escapeHtml(post.display_title || post.title || shorten(text, 60)),
			excerpt: escapeHtml(post.excerpt || shorten(text, 160)),
			date: escapeHtml(formatDate(post.creation)),
			minutes: String(minutes),
			comments: '0',
			'!thumbnail': cover ? fill(template.getAttribute('data-thumbnail'), { cover: escapeHtml(cover) }) : '',
		}
		var holder = document.createElement('div')
		holder.innerHTML = fill(template.innerHTML, values)
		return holder.firstElementChild
	}

	function fetchPosts(start) {
		var filters = { status: 'Published' }
		if (query) filters.title = ['like', '%' + query + '%']
		var params = [
			'fields=' + encodeURIComponent(JSON.stringify(FIELDS)),
			'filters=' + encodeURIComponent(JSON.stringify(filters)),
			'order_by=' + encodeURIComponent('creation desc'),
			'start=' + start,
			'limit=' + (PAGE_SIZE + 1),
		].join('&')
		return fetch(location.origin + '/api/v2/document/Post?' + params, { credentials: 'same-origin' })
			.then(function (response) {
				if (!response.ok) throw new Error('HTTP ' + response.status)
				return response.json()
			})
			.then(function (body) {
				return body.data || []
			})
	}

	function showCounts(posts, rows) {
		if (!posts.length) return
		MNA.api('cafe.api.get_comment_counts', {
			posts: posts.map(function (post) {
				return post.name
			}),
		}).then(
			function (counts) {
				posts.forEach(function (post, index) {
					var node = rows[index].querySelector('.mna-feed-comments')
					if (node) node.textContent = ((counts || {})[post.name] || 0) + ' comments'
				})
			},
			function () {}
		)
	}

	function setLoadingText(visible) {
		if (visible && !loadingText) {
			loadingText = MNA.el('p', '', 'Loading more...')
			loadingText.style.cssText = 'margin:24px 0 0;text-align:center;font-size:14px;color:#7c7c7c'
			sentinel.after(loadingText)
		} else if (!visible && loadingText) {
			loadingText.remove()
			loadingText = null
		}
	}

	function setEmpty(visible) {
		if (visible && !emptyText) {
			emptyText = MNA.el('div', '')
			emptyText.style.cssText = 'padding:64px 0;text-align:center'
			var line = MNA.el('p', '', 'No writings found.')
			line.style.cssText = 'margin:0;font-size:16px;line-height:1.5;letter-spacing:0.02em;color:#525252'
			emptyText.appendChild(line)
			list.after(emptyText)
		} else if (!visible && emptyText) {
			emptyText.remove()
			emptyText = null
		}
		// The server's own "No writings found." block goes when a search starts.
		var serverEmpty = container.querySelector('.mna-feed-empty')
		if (serverEmpty) serverEmpty.style.display = 'none'
	}

	// Loads the next page (or the first one of a new search) and adds the rows.
	function load(fresh) {
		if (busy && !fresh) return
		var request = ++latestRequest
		busy = true
		var start = fresh ? 0 : loaded
		if (!fresh) setLoadingText(true)
		fetchPosts(start).then(
			function (rows) {
				if (request !== latestRequest) return
				busy = false
				setLoadingText(false)
				hasMore = rows.length > PAGE_SIZE
				rows = rows.slice(0, PAGE_SIZE)
				if (fresh) {
					list.replaceChildren()
					loaded = 0
				}
				var made = rows.map(function (post) {
					var row = renderRow(post)
					list.appendChild(row)
					return row
				})
				loaded += rows.length
				setEmpty(fresh && !rows.length)
				showCounts(rows, made)
				// A short first page can leave the sentinel on screen: keep going.
				watchEnd()
			},
			function () {
				if (request !== latestRequest) return
				busy = false
				setLoadingText(false)
				MNA.toast("Couldn't load posts. Please try again.", 'error')
			}
		)
	}

	var observer = null
	function watchEnd() {
		if (!observer) return
		observer.unobserve(sentinel)
		observer.observe(sentinel)
	}

	document.addEventListener('DOMContentLoaded', function () {
		input = document.getElementById('mna-feed-search')
		list = document.getElementById('mna-feed')
		sentinel = document.getElementById('mna-feed-end')
		template = document.getElementById('mna-feed-template')
		if (!input || !list || !sentinel || !template) return
		container = list.parentNode

		loaded = list.children.length
		hasMore = sentinel.getAttribute('data-more') === '1'

		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(function () {
				var next = input.value.trim()
				if (next === query) return
				query = next
				load(true)
			}, DEBOUNCE_MS)
		})

		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				function (entries) {
					if (entries[0].isIntersecting && hasMore && !busy) load(false)
				},
				{ rootMargin: '400px' }
			)
			observer.observe(sentinel)
		}
	})
})()
