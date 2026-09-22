// Post detail page. The post is rendered by the server. This script does the
// rest: like, save, share, the menu, the image viewer and captions, the
// carousel of an Image post, and the comments section. Needs ui.js.
;(function () {
	'use strict'

	var FIRST_COMMENTS = 5
	var MORE_COMMENTS = 10

	var root, postId, user, me
	var comments = [] // every comment and reply, newest first, as the server sent them
	var visibleCount = FIRST_COMMENTS
	var expanded = {} // top-level comment name -> its replies are open
	var replyingTo = null // name of the comment whose reply box is open
	var tempSeq = 0
	var listEl, moreButton

	var el = CAFE.el

	function safeUrl(url) {
		return /^(\/|https?:\/\/)/.test(url || '') ? url : ''
	}

	// ---- Small helpers ----

	function timeAgo(value) {
		if (!value) return ''
		var seconds = Math.floor((Date.now() - new Date(value)) / 1000)
		var units = [
			['year', 31536000],
			['month', 2592000],
			['day', 86400],
			['hour', 3600],
			['minute', 60],
		]
		for (var i = 0; i < units.length; i++) {
			var n = Math.floor(seconds / units[i][1])
			if (n >= 1) return n + ' ' + units[i][0] + (n > 1 ? 's' : '') + ' ago'
		}
		return 'just now'
	}

	function icon(name, extra) {
		var paths = {
			heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
		}
		var span = el('span', 'cafe-ico ' + (extra || ''))
		span.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
			paths[name] +
			'</svg>'
		return span
	}

	function avatar(image, name, size) {
		var box = el('span', 'cafe-avatar cafe-avatar-' + size)
		var url = safeUrl(image)
		if (url) {
			var img = el('img')
			img.src = url
			img.alt = ''
			img.addEventListener('error', function () {
				img.remove()
				box.textContent = (name || '?').trim().charAt(0)
			})
			box.appendChild(img)
		} else {
			box.textContent = (name || '?').trim().charAt(0)
		}
		return box
	}

	function setActive(button, on) {
		button.setAttribute('data-on', on ? '1' : '')
	}

	// ---- Like, save, share, copy link, menu ----

	function toggleLike() {
		var button = root.querySelector('.cafe-like')
		var counter = document.getElementById('cafe-like-count')
		var was = button.getAttribute('data-on') === '1'
		var before = parseInt(counter.textContent, 10) || 0
		// Flip at once, then use the server's real numbers. Put it back if the request fails.
		setActive(button, !was)
		counter.textContent = String(was ? before - 1 : before + 1)
		CAFE.api('cafe.api.toggle_like', { reference_doctype: 'Post', reference_name: postId }).then(
			function (result) {
				setActive(button, result.liked)
				counter.textContent = String(result.count)
			},
			function (err) {
				setActive(button, was)
				counter.textContent = String(before)
				CAFE.toast(err.message, 'error')
			}
		)
	}

	function toggleSave() {
		var button = root.querySelector('.cafe-save')
		var was = button.getAttribute('data-on') === '1'
		setActive(button, !was)
		CAFE.api('cafe.api.toggle_save_post', { post: postId }).then(
			function (result) {
				setActive(button, result.saved)
				CAFE.toast(result.saved ? 'Saved' : 'Removed from saved posts')
			},
			function (err) {
				setActive(button, was)
				CAFE.toast(err.message, 'error')
			}
		)
	}

	function copyLink() {
		closeMenu()
		navigator.clipboard.writeText(location.href).then(
			function () {
				CAFE.toast('Link copied')
			},
			function () {
				CAFE.toast('Could not copy the link', 'error')
			}
		)
	}

	function openShare() {
		CAFE.get('cafe.api.list_people', { query: '' }).then(
			function (people) {
				CAFE.form({
					title: 'Share this post',
					submitLabel: 'Send',
					values: {},
					fields: [
						{
							name: 'user',
							label: 'Send to',
							type: 'select',
							required: true,
							placeholder: 'Select a person',
							options: people.map(function (person) {
								return { label: person.full_name || person.name, value: person.name }
							}),
						},
					],
					onSubmit: function (values) {
						return CAFE.api('cafe.chat.start_dm', { other_user: values.user })
							.then(function (data) {
								return CAFE.api('cafe.chat.send_message', {
									conversation: data.conversation,
									shared_post: postId,
								})
							})
							.then(function () {
								CAFE.toast('Post shared')
							})
					},
				})
			},
			function (err) {
				CAFE.toast(err.message, 'error')
			}
		)
	}

	function menuEl() {
		return root.querySelector('.cafe-pop')
	}
	function closeMenu() {
		menuEl().classList.remove('open')
	}
	function toggleMenu() {
		menuEl().classList.toggle('open')
	}

	// ---- Content: captions, image viewer ----

	// A caption is the image's alt text, shown under it like the old page does.
	function addCaptions(content) {
		content.querySelectorAll('img[alt]').forEach(function (img) {
			var text = (img.getAttribute('alt') || '').trim()
			if (!text) return
			var caption = el('div', 'cafe-caption', text)
			img.insertAdjacentElement('afterend', caption)
		})
	}

	// the old editor puts an extra empty line after a paragraph that ends with an
	// image or a line break. CSS cannot see what comes after an element, so mark them.
	function markTrailingBreaks(content) {
		content.querySelectorAll('p').forEach(function (p) {
			var node = p.lastChild
			while (
				node &&
				((node.nodeType === 3 && !node.textContent.trim()) ||
					(node.nodeType === 1 && node.classList.contains('cafe-caption')))
			) {
				node = node.previousSibling
			}
			if (node && node.nodeType === 1 && (node.tagName === 'IMG' || node.tagName === 'BR'))
				p.classList.add('cafe-tail')
		})
	}

	function openViewer(images, start) {
		var index = start
		var overlay = el('div', 'cafe-viewer')
		var picture = el('img', 'cafe-viewer-img')
		var close = el('button', 'cafe-viewer-btn cafe-viewer-close', '×')
		close.type = 'button'
		close.setAttribute('aria-label', 'Close')
		overlay.appendChild(picture)
		overlay.appendChild(close)
		var prev, next
		function show() {
			picture.src = images[index].src
			picture.alt = images[index].alt || ''
		}
		function step(delta) {
			index = (index + delta + images.length) % images.length
			show()
		}
		if (images.length > 1) {
			prev = el('button', 'cafe-viewer-btn cafe-viewer-prev', '‹')
			next = el('button', 'cafe-viewer-btn cafe-viewer-next', '›')
			prev.type = next.type = 'button'
			prev.setAttribute('aria-label', 'Previous image')
			next.setAttribute('aria-label', 'Next image')
			prev.addEventListener('click', function (e) {
				e.stopPropagation()
				step(-1)
			})
			next.addEventListener('click', function (e) {
				e.stopPropagation()
				step(1)
			})
			overlay.appendChild(prev)
			overlay.appendChild(next)
		}
		function done() {
			overlay.remove()
			document.removeEventListener('keydown', onKey)
		}
		function onKey(e) {
			if (e.key === 'Escape') done()
			else if (e.key === 'ArrowLeft' && images.length > 1) step(-1)
			else if (e.key === 'ArrowRight' && images.length > 1) step(1)
		}
		overlay.addEventListener('click', function (e) {
			if (e.target !== picture) done()
		})
		close.addEventListener('click', done)
		document.addEventListener('keydown', onKey)
		document.body.appendChild(overlay)
		show()
	}

	function setupViewer(content) {
		content.addEventListener('click', function (event) {
			var img = event.target.closest('img')
			if (!img) return
			var all = [].slice.call(content.querySelectorAll('img')).map(function (i) {
				return { src: i.currentSrc || i.src, alt: i.alt }
			})
			openViewer(all, [].slice.call(content.querySelectorAll('img')).indexOf(img))
		})
	}

	// ---- Carousel (Image posts) ----

	function setupCarousel() {
		var carousel = root.querySelector('.cafe-carousel')
		if (!carousel) return
		var slides = [].slice.call(carousel.querySelectorAll('.cafe-slide'))
		if (!slides.length) return
		var index = 0
		var counter,
			dots = []
		function go(i) {
			index = (i + slides.length) % slides.length
			slides.forEach(function (slide, n) {
				slide.classList.toggle('active', n === index)
			})
			if (counter) counter.textContent = index + 1 + '/' + slides.length
			dots.forEach(function (dot, n) {
				dot.classList.toggle('on', n === index)
			})
		}
		if (slides.length > 1) {
			counter = el('span', 'cafe-carousel-count')
			var prev = el('button', 'cafe-carousel-btn cafe-carousel-prev', '‹')
			var next = el('button', 'cafe-carousel-btn cafe-carousel-next', '›')
			prev.type = next.type = 'button'
			prev.setAttribute('aria-label', 'Previous picture')
			next.setAttribute('aria-label', 'Next picture')
			prev.addEventListener('click', function () {
				go(index - 1)
			})
			next.addEventListener('click', function () {
				go(index + 1)
			})
			var bar = el('div', 'cafe-carousel-dots')
			slides.forEach(function (_, n) {
				var dot = el('button', 'cafe-carousel-dot')
				dot.type = 'button'
				dot.setAttribute('aria-label', 'Picture ' + (n + 1))
				dot.addEventListener('click', function () {
					go(n)
				})
				dots.push(dot)
				bar.appendChild(dot)
			})
			carousel.appendChild(counter)
			carousel.appendChild(prev)
			carousel.appendChild(next)
			carousel.appendChild(bar)
			var startX = 0
			carousel.addEventListener(
				'touchstart',
				function (e) {
					startX = e.changedTouches[0].clientX
				},
				{ passive: true }
			)
			carousel.addEventListener('touchend', function (e) {
				var dx = e.changedTouches[0].clientX - startX
				if (Math.abs(dx) >= 40) go(index + (dx < 0 ? 1 : -1))
			})
		}
		carousel.classList.add('ready')
		go(0)
	}

	// ---- Comments ----

	function topLevel() {
		return comments.filter(function (c) {
			return !c.parent_comment
		})
	}
	function repliesOf(name) {
		return comments
			.filter(function (c) {
				return c.parent_comment === name
			})
			.reverse()
	}
	function findComment(name) {
		return comments.filter(function (c) {
			return c.name === name
		})[0]
	}

	function updateCounts() {
		var n = comments.length
		document.getElementById('cafe-comment-count').textContent = String(n)
		document.getElementById('cafe-responses').textContent = 'Responses (' + n + ')'
	}

	function heartButton(comment) {
		var button = el('button', 'cafe-c-like')
		button.type = 'button'
		button.appendChild(icon('heart'))
		var count = el('span', 'cafe-c-like-count', String(comment.like_count || 0))
		button.appendChild(count)
		function paint() {
			button.classList.toggle('on', !!comment.liked_by_me)
			count.textContent = String(comment.like_count || 0)
		}
		paint()
		button.addEventListener('click', function () {
			var was = !!comment.liked_by_me
			var before = comment.like_count || 0
			comment.liked_by_me = !was
			comment.like_count = was ? before - 1 : before + 1
			paint()
			CAFE.api('cafe.api.toggle_like', { reference_doctype: 'Post Comment', reference_name: comment.name }).then(
				function (result) {
					comment.liked_by_me = result.liked
					comment.like_count = result.count
					paint()
				},
				function (err) {
					comment.liked_by_me = was
					comment.like_count = before
					paint()
					CAFE.toast(err.message, 'error')
				}
			)
		})
		return button
	}

	function replyBox(comment, node) {
		var box = el('div', 'cafe-c-replybox')
		var text = el('textarea', 'cafe-textarea')
		text.rows = 2
		text.placeholder = 'Reply to ' + comment.comment_by_name
		var actions = el('div', 'cafe-c-replybox-actions')
		var send = el('button', 'cafe-btn cafe-btn-solid cafe-btn-sm', 'Reply')
		var cancel = el('button', 'cafe-btn cafe-btn-ghost cafe-btn-sm', 'Cancel')
		send.type = cancel.type = 'button'
		actions.appendChild(send)
		actions.appendChild(cancel)
		box.appendChild(text)
		box.appendChild(actions)
		function submit() {
			var content = text.value.trim()
			if (!content) return
			closeReply()
			addComment(content, comment.parent_comment || comment.name, function () {
				openReply(comment, node, content)
			})
		}
		send.addEventListener('click', submit)
		cancel.addEventListener('click', closeReply)
		text.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault()
				submit()
			}
		})
		return box
	}

	function closeReply() {
		var open = listEl.querySelector('.cafe-c-replybox')
		if (open) open.remove()
		replyingTo = null
	}

	function openReply(comment, node, prefill) {
		closeReply()
		replyingTo = comment.name
		var box = replyBox(comment, node)
		var anchor = node.querySelector(':scope > .cafe-c-actions')
		anchor.insertAdjacentElement('afterend', box)
		var field = box.querySelector('textarea')
		if (prefill) field.value = prefill
		field.focus()
	}

	function toggleReply(comment, node) {
		if (replyingTo === comment.name) closeReply()
		else openReply(comment, node)
	}

	function confirmDelete(comment) {
		CAFE.confirm({
			title: 'Delete comment?',
			message: 'This will permanently remove your comment.',
			confirmLabel: 'Delete',
			danger: true,
		}).then(function (ok) {
			if (!ok) return
			CAFE.api('cafe.api.delete_comment', { name: comment.name }).then(
				function () {
					// The server removes the replies of a deleted top-level comment too.
					comments = comments.filter(function (c) {
						return c.name !== comment.name && c.parent_comment !== comment.name
					})
					var root_ = comment.parent_comment || comment.name
					if (
						!comments.some(function (c) {
							return c.parent_comment === root_
						})
					)
						delete expanded[root_]
					updateCounts()
					renderList()
				},
				function (err) {
					CAFE.toast(err.message, 'error')
				}
			)
		})
	}

	function commentNode(comment, isReply) {
		var node = el('div', isReply ? 'cafe-c cafe-r' : 'cafe-c')
		node.setAttribute('data-name', comment.name)

		var head = el('div', 'cafe-c-head')
		head.appendChild(avatar(comment.comment_by_image, comment.comment_by_name, 'sm'))
		head.appendChild(el('span', 'cafe-c-name', comment.comment_by_name))
		head.appendChild(el('span', 'cafe-c-time', timeAgo(comment.creation)))
		node.appendChild(head)
		node.appendChild(el('p', 'cafe-c-body', comment.content))

		var actions = el('div', 'cafe-c-actions')
		actions.appendChild(heartButton(comment))
		var reply = el('button', 'cafe-c-action', 'Reply')
		reply.type = 'button'
		reply.addEventListener('click', function () {
			toggleReply(comment, node)
		})
		actions.appendChild(reply)
		if (comment.comment_by === user && String(comment.name).indexOf('temp-') !== 0) {
			var del = el('button', 'cafe-c-action', 'Delete')
			del.type = 'button'
			del.addEventListener('click', function () {
				confirmDelete(comment)
			})
			actions.appendChild(del)
		}
		node.appendChild(actions)

		if (!isReply) {
			var replies = repliesOf(comment.name)
			var open = !!expanded[comment.name]
			if (replies.length && !open) {
				var view = el('button', 'cafe-c-view')
				view.type = 'button'
				view.appendChild(el('span', 'cafe-c-line'))
				view.appendChild(
					document.createTextNode(
						'View ' + replies.length + ' ' + (replies.length === 1 ? 'reply' : 'replies')
					)
				)
				view.addEventListener('click', function () {
					expanded[comment.name] = true
					renderList()
				})
				node.appendChild(view)
			}
			if (open) {
				var box = el('div', 'cafe-c-replies')
				replies.forEach(function (r) {
					box.appendChild(commentNode(r, true))
				})
				var hide = el('button', 'cafe-c-hide', 'Hide replies')
				hide.type = 'button'
				hide.addEventListener('click', function () {
					delete expanded[comment.name]
					renderList()
				})
				box.appendChild(hide)
				node.appendChild(box)
			}
		}
		return node
	}

	function renderList() {
		replyingTo = null
		listEl.replaceChildren()
		var shown = topLevel().slice(0, visibleCount)
		shown.forEach(function (c) {
			listEl.appendChild(commentNode(c, false))
		})
		moreButton.hidden = topLevel().length <= visibleCount
	}

	function addComment(content, parent, restore) {
		var key = 'temp-' + Date.now() + '-' + ++tempSeq
		var optimistic = {
			name: key,
			parent_comment: parent || null,
			comment_by: user,
			comment_by_name: me.name,
			comment_by_image: me.image,
			content: content,
			creation: new Date().toISOString(),
			like_count: 0,
			liked_by_me: false,
		}
		comments.unshift(optimistic)
		if (parent) expanded[parent] = true
		updateCounts()
		renderList()
		var args = { post: postId, content: content }
		if (parent) args.parent_comment = parent
		CAFE.api('cafe.api.add_comment', args).then(
			function (result) {
				// Fill in the real name and time, so it can be liked or deleted.
				Object.assign(optimistic, result, { like_count: 0, liked_by_me: false })
				renderList()
			},
			function (err) {
				comments = comments.filter(function (c) {
					return c !== optimistic
				})
				updateCounts()
				renderList()
				CAFE.toast(err.message || 'Could not post comment', 'error')
				if (restore) restore()
			}
		)
	}

	function submitComment() {
		var field = document.getElementById('cafe-comment-text')
		var content = field.value.trim()
		if (!content) return
		field.value = ''
		addComment(content, null, function () {
			field.value = content
		})
	}

	function loadComments() {
		CAFE.get('cafe.api.list_comments', { post: postId }).then(
			function (rows) {
				comments = rows || []
				updateCounts()
				renderList()
			},
			function () {
				listEl.replaceChildren(el('p', 'cafe-comments-error', "Couldn't load the comments. Please try again."))
			}
		)
	}

	function focusCommentBox() {
		var box = document.getElementById('cafe-comment-text')
		box.scrollIntoView({ behavior: 'smooth', block: 'center' })
		setTimeout(function () {
			box.focus()
		}, 400)
	}

	// ---- Start ----

	var ACTIONS = {
		like: toggleLike,
		save: toggleSave,
		share: openShare,
		'copy-link': copyLink,
		'toggle-menu': toggleMenu,
		comment: focusCommentBox,
		'comment-send': submitComment,
		'more-comments': function () {
			visibleCount += MORE_COMMENTS
			renderList()
		},
	}

	document.addEventListener('DOMContentLoaded', function () {
		root = document.getElementById('cafe-post')
		if (!root) return
		postId = root.getAttribute('data-post')
		user = root.getAttribute('data-user')
		me = { name: root.getAttribute('data-me-name'), image: root.getAttribute('data-me-image') }
		listEl = document.getElementById('cafe-comments')
		moreButton = root.querySelector('.cafe-more-comments')

		root.addEventListener('click', function (event) {
			var button = event.target.closest('[data-action]')
			if (button && ACTIONS[button.getAttribute('data-action')])
				ACTIONS[button.getAttribute('data-action')](button)
		})
		document.addEventListener('click', function (event) {
			if (!event.target.closest('.cafe-pop, [data-action=toggle-menu]')) closeMenu()
		})
		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') closeMenu()
		})
		document.getElementById('cafe-comment-text').addEventListener('keydown', function (event) {
			if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
				event.preventDefault()
				submitComment()
			}
		})

		var content = document.getElementById('cafe-content')
		if (content) {
			addCaptions(content)
			markTrailingBreaks(content)
			setupViewer(content)
		}
		setupCarousel()
		loadComments()
	})
})()
