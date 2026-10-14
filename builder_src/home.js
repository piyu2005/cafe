// Home feed. The first ten posts are rendered by the server. This script adds
// search (filters by title as you type), the category chips (multi-select,
// OR'd together), and infinite scroll: a sentinel below the list loads ten
// more when it is 400px from the screen, like the old page. Selecting or
// clearing a chip re-queries from the start, same path search already uses -
// there is no separate "filtered" rendering mode, just a different filters
// object passed to the same fetch. Rows are made from the page's <template>,
// which has the same markup the server fills. Needs ui.js.
;(function () {
	'use strict'

	var PAGE_SIZE = 10
	var DEBOUNCE_MS = 250
	// Keep this in sync with blocks.PUBLICATIONS_ENABLED (generate.py) - while
	// it's false, every row falls through to its author here too, matching
	// what home_page.py's own server-rendered first page already does.
	var PUBLICATIONS_ENABLED = false
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
		'publication',
		'creation',
	]

	var input, list, sentinel, template, container
	var query = ''
	var categories = []
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

	// The first <img src> in the post's own content, same extraction as
	// write_core.js's W.firstImage - kept as its own small copy rather than a
	// cross-script dependency, since this page doesn't otherwise load the
	// write bundle. Display-only fallback, never written back to the post:
	// cover_image staying unset is how "Remove cover" (write_preview.js)
	// persists a deliberate no-cover choice, so this must never get saved
	// over it.
	function firstImageIn(html) {
		var match = (html || '').match(/<img[^>]+src="([^"]+)"/)
		return match ? match[1].replace(/&amp;/g, '&') : ''
	}

	// The row markup is filled in one pass, so a post that contains "[[name]]"
	// is not filled a second time.
	function fill(markup, values) {
		return markup.replace(/\[\[(!?\w+)\]\]/g, function (match, key) {
			return key in values ? values[key] : match
		})
	}

	// The whole avatar/tile element - a publication's post gets its own
	// rounded-square cafe-pub-tile (logo or initial) instead of the author's
	// circular cafe-avatar, same distinction build_feed_row() draws for the
	// server-rendered first page. `pubs` is this batch's handle->{title,logo}
	// map (see fetchPublications below); a post whose publication isn't in it
	// (fetch failed, or raced past the batch somehow) just falls back to the
	// author, rather than showing a broken tile.
	function buildIdentity(post, pubs) {
		var pub = PUBLICATIONS_ENABLED && post.publication ? pubs[post.publication] : null
		var label = pub ? pub.title || post.publication : post.author_name || post.author || ''
		var image = safeUrl(pub ? pub.logo : post.author_image)
		var inner = image
			? fill(template.getAttribute('data-avatar-image'), { image: escapeHtml(image) })
			: '<span class="initial">' + escapeHtml(label.trim().charAt(0)) + '</span>'
		return {
			label: label,
			html: '<span class="' + (pub ? 'cafe-pub-tile' : 'cafe-avatar') + '">' + inner + '</span>',
		}
	}

	function renderRow(post, pubs) {
		var text = plainText(post.content)
		var minutes = Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200))
		var identity = buildIdentity(post, pubs || {})
		var cover = safeUrl(
			post.cover_image || (post.post_type !== 'Video' ? post.attachment : '') || firstImageIn(post.content)
		)
		var values = {
			href: escapeHtml('/posts/' + encodeURIComponent(post.name)),
			'!avatar': identity.html,
			name: escapeHtml(identity.label),
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
		if (categories.length) filters.category = ['in', categories]
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

	// Title/logo for whichever publications this batch of posts needs - fetched
	// before the rows are built (not patched in after, like showCounts below),
	// since swapping a circular avatar for a square publication tile after the
	// fact would visibly flash; a comment count ticking in unnoticed doesn't.
	function fetchPublications(posts) {
		if (!PUBLICATIONS_ENABLED) return Promise.resolve({})
		var handles = []
		posts.forEach(function (post) {
			if (post.publication && handles.indexOf(post.publication) === -1) handles.push(post.publication)
		})
		if (!handles.length) return Promise.resolve({})
		return CAFE.api('cafe.api.get_publications', { handles: handles }).then(
			function (pubs) {
				return pubs || {}
			},
			function () {
				return {}
			}
		)
	}

	function showCounts(posts, rows) {
		if (!posts.length) return
		CAFE.api('cafe.api.get_comment_counts', {
			posts: posts.map(function (post) {
				return post.name
			}),
		}).then(
			function (counts) {
				posts.forEach(function (post, index) {
					var node = rows[index].querySelector('.cafe-feed-comments')
					var count = (counts || {})[post.name] || 0
					if (node) node.textContent = count + (count === 1 ? ' comment' : ' comments')
				})
			},
			function () {}
		)
	}

	function setLoadingText(visible) {
		if (visible && !loadingText) {
			loadingText = CAFE.el('p', '', 'Loading more...')
			loadingText.style.cssText = 'margin:24px 0 0;text-align:center;font-size:14px;color:#7c7c7c'
			sentinel.after(loadingText)
		} else if (!visible && loadingText) {
			loadingText.remove()
			loadingText = null
		}
	}

	function setEmpty(visible) {
		if (visible && !emptyText) {
			emptyText = CAFE.el('div', '')
			emptyText.style.cssText = 'padding:64px 0;text-align:center'
			var line = CAFE.el('p', '', 'No writings found.')
			line.style.cssText = 'margin:0;font-size:16px;line-height:1.5;letter-spacing:0.02em;color:#525252'
			emptyText.appendChild(line)
			list.after(emptyText)
		} else if (!visible && emptyText) {
			emptyText.remove()
			emptyText = null
		}
		// The server's own "No writings found." block goes when a search starts.
		var serverEmpty = container.querySelector('.cafe-feed-empty')
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
				fetchPublications(rows).then(function (pubs) {
					if (request !== latestRequest) return
					var made = rows.map(function (post) {
						var row = renderRow(post, pubs)
						list.appendChild(row)
						return row
					})
					loaded += rows.length
					setEmpty(fresh && !rows.length)
					showCounts(rows, made)
					// A short first page can leave the sentinel on screen: keep going.
					watchEnd()
				})
			},
			function () {
				if (request !== latestRequest) return
				busy = false
				setLoadingText(false)
				CAFE.toast("Couldn't load posts. Please try again.", 'error')
			}
		)
	}

	var observer = null
	function watchEnd() {
		if (!observer) return
		observer.unobserve(sentinel)
		observer.observe(sentinel)
	}

	// Multi-select: each chip toggles only itself, independent of the others.
	// A chip's aria-label is also its Category doctype name (autoname is
	// field:title, so the two are the same string) - no separate lookup
	// needed to turn "which chips are active" into a filters.category value.
	// The close icon is already in every chip's markup (home_page.py), hidden
	// by styles.css until its own chip has .active.
	function setupTagChips() {
		document.querySelectorAll('.cafe-tag-chip').forEach(function (chip) {
			chip.addEventListener('click', function () {
				var active = chip.classList.toggle('active')
				chip.setAttribute('aria-pressed', active ? 'true' : 'false')
				var name = chip.getAttribute('aria-label')
				var at = categories.indexOf(name)
				if (active && at === -1) categories.push(name)
				else if (!active && at !== -1) categories.splice(at, 1)
				load(true)
			})
		})
	}

	document.addEventListener('DOMContentLoaded', function () {
		input = document.getElementById('cafe-feed-search')
		list = document.getElementById('cafe-feed')
		sentinel = document.getElementById('cafe-feed-end')
		template = document.getElementById('cafe-feed-template')
		if (!input || !list || !sentinel || !template) return
		container = list.parentNode
		setupTagChips()

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
