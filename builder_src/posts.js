// Profile posts page ("Manage all posts"). The list of published posts is
// rendered by the server. On your own profile this script adds the tabs:
// Drafts and Archived are fetched when their tab opens, like the old page
// does. Saved is its own thing - posts anyone wrote that you bookmarked, not
// filtered from your own Post rows, so it gets its own fetch/row shape below
// rather than fitting the TABS map. Needs ui.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var ICONS = '@@ICONS@@'
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
		'scheduled_at',
	]
	var PAGE_SIZE = 100
	var TABS = {
		drafts: { status: 'Draft', empty: "You don't have any drafts." },
		archived: { status: 'Archived', empty: "You don't have any archived posts." },
	}

	var root, published, other, loading, emptyText, list, template, saved
	var latestRequest = 0

	function icon(name) {
		var holder = document.createElement('span')
		holder.className = 'cafe-set-icon'
		holder.innerHTML = ICONS[name] || ''
		return holder
	}

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
	function formatScheduled(value) {
		var date = new Date((value || '').replace(' ', 'T'))
		return (
			'Scheduled for ' +
			date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
			', ' +
			date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
		)
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
	function thumbnailOf(post) {
		var url = post.cover_image || (post.post_type === 'Image' ? post.attachment : '') || firstImageIn(post.content)
		return /^(\/|https?:\/\/)/.test(url || '') ? url : ''
	}

	function renderRow(post) {
		var row = template.content.firstElementChild.cloneNode(true)
		// Drafts and archived posts open in the editor: there is nothing public to see yet.
		row.href = '/write/' + encodeURIComponent(post.name)
		row.querySelector('.cafe-row-title').textContent = post.display_title || post.title || 'Untitled'
		row.querySelector('.cafe-row-excerpt').textContent = preview(post)
		row.querySelector('.cafe-row-meta').textContent = formatDate(post.modified)
		var scheduled = row.querySelector('.cafe-row-scheduled')
		if (post.scheduled_at) {
			scheduled.hidden = false
			scheduled.setAttribute('data-tooltip', formatScheduled(post.scheduled_at))
			CAFE.tooltip(scheduled)
		}
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

	// ---- Saved posts ----

	function coverOf(post) {
		var url = post.cover_image || (post.post_type !== 'Video' ? post.attachment : '')
		return /^(\/|https?:\/\/)/.test(url || '') ? url : ''
	}

	function savedRow(post, first, onRemove) {
		var row = CAFE.el('div', 'cafe-saved-row' + (first ? ' first' : ''))
		var link = CAFE.el('a', 'cafe-saved-link')
		link.href = '/posts/' + encodeURIComponent(post.name)
		var text = CAFE.el('div', 'cafe-saved-text')
		text.appendChild(CAFE.el('div', 'cafe-saved-title', post.display_title || post.title || 'Untitled'))
		text.appendChild(CAFE.el('p', 'cafe-saved-excerpt', preview(post)))
		text.appendChild(CAFE.el('div', 'cafe-saved-by', 'By ' + (post.author_name || '')))
		link.appendChild(text)
		var cover = coverOf(post)
		if (cover) {
			var image = CAFE.el('img', 'cafe-saved-cover')
			image.src = cover
			image.alt = ''
			image.loading = 'lazy'
			link.appendChild(image)
		}
		var remove = CAFE.el('button', 'cafe-saved-remove')
		remove.type = 'button'
		remove.setAttribute('aria-label', 'Remove from saved posts')
		remove.appendChild(icon('bookmark'))
		remove.addEventListener('click', function () {
			onRemove(post)
		})
		row.appendChild(link)
		row.appendChild(remove)
		return row
	}

	var savedLoaded = false
	var savedPosts = []
	var savedRequest = 0
	function loadSaved() {
		var panelLoading = saved.querySelector('.cafe-loading')
		var empty = saved.querySelector('.cafe-saved-empty')
		var failed = saved.querySelector('.cafe-saved-error')
		var list = saved.querySelector('.cafe-saved-list')
		var request = ++savedRequest

		function render() {
			list.replaceChildren()
			savedPosts.forEach(function (post, index) {
				list.appendChild(savedRow(post, index === 0, remove))
			})
			empty.hidden = savedPosts.length > 0
		}

		// The post leaves the list at once; the server confirms afterwards.
		function remove(post) {
			var before = savedPosts
			savedPosts = savedPosts.filter(function (item) {
				return item.name !== post.name
			})
			render()
			CAFE.api('cafe.api.toggle_save_post', { post: post.name }).then(
				function (result) {
					// `saved` true means it is still saved (a double click, say): put it back.
					if (!result || result.saved) {
						savedPosts = before
						render()
					}
				},
				function () {
					savedPosts = before
					render()
					CAFE.toast("Couldn't remove that post. Please try again.", 'error')
				}
			)
		}

		savedLoaded = true
		list.replaceChildren()
		empty.hidden = true
		failed.hidden = true
		panelLoading.hidden = false
		CAFE.get('cafe.api.list_saved_posts').then(
			function (data) {
				if (request !== savedRequest) return
				panelLoading.hidden = true
				savedPosts = data || []
				render()
			},
			function () {
				if (request !== savedRequest) return
				panelLoading.hidden = true
				failed.hidden = false
			}
		)
	}

	function showTab(tab, updateAddress) {
		document.querySelectorAll('.cafe-tab-btn').forEach(function (button) {
			button.setAttribute('aria-selected', button.getAttribute('data-tab') === tab ? 'true' : 'false')
		})
		published.hidden = tab !== 'published'
		other.hidden = tab !== 'drafts' && tab !== 'archived'
		saved.hidden = tab !== 'saved'
		if (TABS[tab]) loadOther(tab)
		// Loaded once per page visit - the remove button already keeps the list
		// in sync with every change made from this same tab.
		if (tab === 'saved' && !savedLoaded) loadSaved()
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
		saved = document.getElementById('cafe-panel-saved')

		root.addEventListener('click', function (event) {
			var button = event.target.closest('.cafe-tab-btn')
			if (button) showTab(button.getAttribute('data-tab'), true)
		})
		var initial = root.getAttribute('data-tab')
		if (TABS[initial] || initial === 'saved') showTab(initial, false)
		else showTab('published', false)
	})
})()
