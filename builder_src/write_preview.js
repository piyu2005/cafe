// The native post editor, part 3: the Story Preview you see before you
// publish, with the cover image and its crop.
;(function () {
	'use strict'

	var W = window.CAFE.write
	var RATIO = 1.91
	var MAX_WIDTH = 1200
	var JPEG_QUALITY = 0.92
	// Keep this in sync with blocks.PUBLICATIONS_ENABLED (generate.py).
	var PUBLICATIONS_ENABLED = false
	// The home feed's filter chips (home_page.py's TAG_LABELS) match a post by
	// exact tag, Medium-style - no separate category field, just this same
	// free-text list. Photography and Mindfulness are suggested here even
	// though they weren't before, so typing one of the 6 chip names is a
	// one-click autocomplete pick, not a happen-to-type-it-exactly guess.
	var TAG_SUGGESTIONS = [
		'Design',
		'UX/UI',
		'Minimalism',
		'Technology',
		'Productivity',
		'Writing',
		'Photography',
		'Mindfulness',
		'Startups',
		'Business',
		'Lifestyle',
		'Travel',
	]

	function splitTags(value) {
		return (value || '')
			.split(',')
			.map(function (t) {
				return t.trim()
			})
			.filter(Boolean)
	}

	function hasTag(list, value) {
		var lower = value.toLowerCase()
		return list.some(function (t) {
			return t.toLowerCase() === lower
		})
	}

	function tagChip(label, onRemove) {
		var node = W.el('span', 'cafe-w-tag-chip')
		node.appendChild(document.createTextNode(label))
		var remove = W.el('button', 'cafe-w-tag-x')
		remove.type = 'button'
		remove.setAttribute('aria-label', 'Remove ' + label)
		remove.appendChild(W.icon('x', 'cafe-w-small'))
		remove.addEventListener('click', onRemove)
		node.appendChild(remove)
		return node
	}

	W.previewImage = function () {
		var S = W.state
		if (S.coverRemoved) return ''
		return S.form.cover_image || W.firstImage(W.content())
	}

	var DRAFT_KEY = 'story-preview'

	// The author identity for the live card preview - always the signed-in
	// user (you can only ever write as yourself), read once from the root
	// element's own data attributes (write_page.py's data script fills them).
	function me() {
		var root = document.getElementById('cafe-write')
		return {
			name: (root && root.getAttribute('data-me-name')) || '',
			initial: (root && root.getAttribute('data-me-initial')) || '?',
			image: (root && root.getAttribute('data-me-image')) || '',
		}
	}

	// The side panel's live mock of the home feed's own row (home_page.py's
	// build_feed_row) - same pieces, same roles, scaled down: avatar+name,
	// title, excerpt, and the cover thumbnail if there is one. Rebuilt fresh
	// each drawView() (a cover-image change already redraws the whole dialog);
	// refresh() just updates the text pieces that can change on every
	// keystroke without losing focus.
	function buildPreviewCard() {
		var who = me()
		var card = W.el('div', 'cafe-w-story-card')
		var author = W.el('div', 'cafe-w-story-card-author')
		var avatar = W.el('span', 'cafe-avatar cafe-w-story-card-avatar')
		if (who.image) {
			var img = W.el('img')
			img.src = who.image
			img.alt = ''
			avatar.appendChild(img)
		} else {
			avatar.textContent = who.initial
		}
		author.appendChild(avatar)
		author.appendChild(W.el('span', '', who.name))
		var rowBody = W.el('div', 'cafe-w-story-card-body')
		var text = W.el('div', 'cafe-w-story-card-text')
		var titleEl = W.el('div', 'cafe-w-story-card-title')
		var excerptEl = W.el('p', 'cafe-w-story-card-excerpt cafe-clamp-2')
		text.appendChild(titleEl)
		text.appendChild(excerptEl)
		rowBody.appendChild(text)
		var thumb = W.el('img', 'cafe-w-story-card-thumb')
		thumb.alt = ''
		rowBody.appendChild(thumb)
		var meta = W.el('p', 'cafe-w-story-card-meta')
		card.appendChild(author)
		card.appendChild(rowBody)
		card.appendChild(meta)

		function refresh() {
			var S = W.state
			var form = S.form
			titleEl.textContent = form.display_title || form.title || 'Untitled'
			excerptEl.textContent = form.excerpt || W.autoExcerpt(W.ensureHtml(W.content())) || 'A short preview…'
			var url = W.previewImage()
			thumb.hidden = !url
			if (url) thumb.src = url
			meta.textContent = W.readTime(W.ensureHtml(W.content())) + ' min read'
		}
		refresh()
		return { el: card, refresh: refresh }
	}

	// Opens the dialog. onPublish() is called on Publish; onSchedule(localDateTime)
	// on Schedule/Reschedule, and must return a Promise. The returned api has setBusy(bool).
	W.openPreview = function (options) {
		var S = W.state
		var form = S.form
		var html = W.ensureHtml(W.content())
		var adjust = null // { url, natural, frame, offset }
		var main = W.el('div', 'cafe-w-story-main')
		var previewCard = null
		var body = W.el('div', 'cafe-w-story')
		var dialog

		// A crop in progress can't survive a refresh - it holds a local file
		// handle (the blob: URL from the file picker) that stops working the
		// moment the page reloads, so there's nothing to restore it from. The
		// title/excerpt/cover this dialog's main view edits are plain values
		// though, so those do survive one.
		var draft = CAFE.loadDraft(DRAFT_KEY)
		if (draft && draft.values) {
			if ('display_title' in draft.values) form.display_title = draft.values.display_title
			if ('excerpt' in draft.values) form.excerpt = draft.values.excerpt
			if ('cover_image' in draft.values) form.cover_image = draft.values.cover_image
			if ('coverRemoved' in draft.values) S.coverRemoved = draft.values.coverRemoved
			if ('publication' in draft.values) form.publication = draft.values.publication
			if ('tags' in draft.values) form.tags = draft.values.tags
		}
		function saveDraft() {
			CAFE.saveDraft(DRAFT_KEY, null, {
				display_title: form.display_title,
				excerpt: form.excerpt,
				cover_image: form.cover_image,
				coverRemoved: S.coverRemoved,
				publication: form.publication,
				tags: form.tags,
			})
		}

		// Same pill + dropdown tag picker that used to live on the main editor
		// page - moved here so every piece of a story's metadata (publication,
		// title, excerpt, tags) is reviewed in one place right before it goes
		// out. Tags stay a comma-separated string in form.tags (what the
		// backend stores); TAG_SUGGESTIONS only drives the dropdown, typing
		// anything else and pressing Enter/, still adds it as a free tag.
		function buildTagsField() {
			var tagList = splitTags(form.tags)
			var wrap = W.el('div', 'cafe-w-tags')
			wrap.appendChild(W.el('label', '', 'Tags'))
			var box = W.el('div', 'cafe-w-tag-box')
			var fields = W.el('div', 'cafe-w-tag-fields')
			var tagChips = W.el('div', 'cafe-w-tag-chips')
			var tagInput = W.el('input')
			tagInput.type = 'text'
			tagInput.id = 'cafe-w-tags'
			tagInput.autocomplete = 'off'
			wrap.firstChild.setAttribute('for', 'cafe-w-tags')
			var toggle = W.el('button', 'cafe-w-tag-toggle')
			toggle.type = 'button'
			toggle.setAttribute('aria-label', 'Show tag suggestions')
			toggle.appendChild(W.icon('chevron-down', 'cafe-w-small'))
			var tagResults = W.el('div', 'cafe-w-tag-results')
			tagResults.hidden = true

			function sync() {
				form.tags = tagList.join(', ')
				saveDraft()
			}
			function drawChips() {
				tagChips.replaceChildren()
				tagInput.placeholder = tagList.length ? '' : 'Add a tag'
				tagList.forEach(function (label, index) {
					tagChips.appendChild(
						tagChip(label, function () {
							tagList.splice(index, 1)
							drawChips()
							sync()
						})
					)
				})
			}
			function setOpen(open) {
				tagResults.hidden = !open
				toggle.classList.toggle('open', open)
			}
			function drawResults() {
				var query = tagInput.value.trim().toLowerCase()
				var options = TAG_SUGGESTIONS.filter(function (name) {
					return !hasTag(tagList, name) && (!query || name.toLowerCase().indexOf(query) !== -1)
				})
				tagResults.replaceChildren()
				setOpen(options.length > 0)
				options.forEach(function (name) {
					var option = W.el('button', 'cafe-w-tag-option', name)
					option.type = 'button'
					option.addEventListener('mousedown', function (event) {
						event.preventDefault()
					})
					option.addEventListener('click', function () {
						addTag(name)
						tagInput.focus()
					})
					tagResults.appendChild(option)
				})
			}
			function addTag(label) {
				label = (label || '').trim()
				if (label && !hasTag(tagList, label)) {
					tagList.push(label)
					sync()
				}
				drawChips()
				tagInput.value = ''
				drawResults()
			}
			tagInput.addEventListener('input', drawResults)
			tagInput.addEventListener('focus', drawResults)
			tagInput.addEventListener('blur', function () {
				setOpen(false)
			})
			tagInput.addEventListener('keydown', function (event) {
				if (event.key === 'Enter' || event.key === ',') {
					event.preventDefault()
					addTag(tagInput.value)
				} else if (event.key === 'Backspace' && !tagInput.value && tagList.length) {
					tagList.pop()
					drawChips()
					sync()
				} else if (event.key === 'Escape') {
					setOpen(false)
				}
			})
			toggle.addEventListener('mousedown', function (event) {
				event.preventDefault()
			})
			toggle.addEventListener('click', function () {
				if (tagResults.hidden) {
					drawResults()
					tagInput.focus()
				} else {
					setOpen(false)
				}
			})

			fields.appendChild(tagChips)
			fields.appendChild(tagInput)
			box.appendChild(fields)
			box.appendChild(toggle)
			box.appendChild(tagResults)
			wrap.appendChild(box)
			drawChips()
			return wrap
		}

		// "Your profile" plus whatever this account can post under - current
		// value first if it's no longer one of them (membership can change
		// after a post is already assigned to a publication; dropping it
		// silently here would reassign the post out from under the author).
		// Uses the same .cafe-field markup as CAFE.form's own selects (styles.css),
		// loaded on every page, rather than drawing a one-off look just for this.
		function buildPublicationPicker() {
			var row = W.el('div', 'cafe-field')
			row.appendChild(W.el('label', '', 'Publish to'))
			var select = W.el('select')
			var personal = W.el('option', '', 'Your profile')
			personal.value = ''
			select.appendChild(personal)
			var known = S.myPublications.some(function (pub) {
				return pub.publication === form.publication
			})
			if (form.publication && !known) {
				var current = W.el('option', '', form.publication)
				current.value = form.publication
				select.appendChild(current)
			}
			S.myPublications.forEach(function (pub) {
				var option = W.el('option', '', pub.title || pub.publication)
				option.value = pub.publication
				select.appendChild(option)
			})
			select.value = form.publication || ''
			select.addEventListener('change', function () {
				form.publication = select.value
				saveDraft()
			})
			row.appendChild(select)
			return row
		}

		var fileInput = W.el('input')
		fileInput.type = 'file'
		fileInput.accept = 'image/*'
		fileInput.hidden = true
		fileInput.addEventListener('change', function () {
			var file = fileInput.files && fileInput.files[0]
			fileInput.value = ''
			if (file) startAdjust(URL.createObjectURL(file))
		})
		document.body.appendChild(fileInput)

		function button(label, onClick) {
			var b = W.el('button', 'cafe-w-cover-btn', label)
			b.type = 'button'
			b.addEventListener('click', onClick)
			return b
		}

		// ---- The preview ----
		function drawView() {
			adjust = null
			body.replaceChildren()
			main.replaceChildren()
			var url = W.previewImage()
			var cover = W.el('div', 'cafe-w-cover')
			if (url) {
				var img = W.el('img')
				img.src = url
				img.alt = ''
				cover.appendChild(img)
			} else {
				var empty = W.el('div', 'cafe-w-cover-empty')
				empty.appendChild(W.icon('image', 'cafe-w-large'))
				cover.appendChild(empty)
			}
			var over = W.el('div', 'cafe-w-cover-over')
			over.appendChild(
				button('Change preview image', function () {
					fileInput.click()
				})
			)
			if (url) {
				over.appendChild(
					button('Adjust image', function () {
						startAdjust(url)
					})
				)
				over.appendChild(
					button('Remove image', function () {
						S.coverRemoved = true
						form.cover_image = ''
						drawView()
						saveDraft()
					})
				)
			}
			cover.appendChild(over)
			main.appendChild(cover)
			main.appendChild(W.el('p', 'cafe-w-read', W.readTime(html) + ' min read'))
			// Only worth asking when there's an actual choice to make - most
			// accounts belong to no publication at all. Hidden entirely while
			// Publications itself is hidden (PUBLICATIONS_ENABLED above).
			if (PUBLICATIONS_ENABLED && (S.myPublications.length || form.publication))
				main.appendChild(buildPublicationPicker())
			var title = W.el('input', 'cafe-w-story-title')
			title.type = 'text'
			title.placeholder = 'Untitled'
			title.value = form.display_title || form.title
			title.addEventListener('input', function () {
				form.display_title = title.value
				saveDraft()
				if (previewCard) previewCard.refresh()
			})
			var excerpt = W.el('textarea', 'cafe-w-story-excerpt')
			excerpt.rows = 2
			excerpt.placeholder = 'Write a short preview of your story…'
			excerpt.value = form.excerpt || W.autoExcerpt(html)
			excerpt.addEventListener('input', function () {
				form.excerpt = excerpt.value
				saveDraft()
				if (previewCard) previewCard.refresh()
			})
			main.appendChild(title)
			main.appendChild(excerpt)
			main.appendChild(buildTagsField())
			main.appendChild(
				W.el(
					'p',
					'cafe-w-story-note',
					'Note: changes here affect how your story appears in previews and feeds, not the story itself.'
				)
			)

			var side = W.el('div', 'cafe-w-story-side')
			side.appendChild(W.el('p', 'cafe-w-story-side-label', 'How this looks in the feed'))
			previewCard = buildPreviewCard()
			side.appendChild(previewCard.el)

			body.appendChild(main)
			body.appendChild(side)
			showActions(false)
		}

		// ---- Adjusting the crop ----
		function startAdjust(url) {
			body.replaceChildren(W.el('p', 'cafe-w-adjust-hint', 'Loading…'))
			showActions(true)
			var img = new Image()
			img.src = url
			img.decode()
				.catch(function () {})
				.then(function () {
					adjust = { url: url, img: img, nw: img.naturalWidth || 1, nh: img.naturalHeight || 1, x: 0, y: 0 }
					drawAdjust()
				})
		}

		function drawAdjust() {
			body.replaceChildren()
			var frame = W.el('div', 'cafe-w-frame')
			var pic = W.el('img')
			pic.src = adjust.url
			pic.draggable = false
			frame.appendChild(pic)
			var hint = W.el('p', 'cafe-w-adjust-hint', 'Drag to reposition.')
			body.appendChild(hint)
			body.appendChild(frame)
			adjust.frame = frame
			adjust.pic = pic
			requestAnimationFrame(function () {
				adjust.fw = frame.clientWidth
				adjust.fh = frame.clientHeight
				var scale = Math.max(adjust.fw / adjust.nw, adjust.fh / adjust.nh)
				adjust.scale = scale
				adjust.dw = adjust.nw * scale
				adjust.dh = adjust.nh * scale
				adjust.x = (adjust.fw - adjust.dw) / 2
				adjust.y = (adjust.fh - adjust.dh) / 2
				adjust.canDrag = adjust.dw > adjust.fw + 0.5 || adjust.dh > adjust.fh + 0.5
				hint.hidden = !adjust.canDrag
				frame.classList.toggle('movable', adjust.canDrag)
				paint()
			})
			frame.addEventListener('mousedown', function (event) {
				dragStart(event.clientX, event.clientY, event)
			})
			frame.addEventListener(
				'touchstart',
				function (event) {
					if (event.touches.length === 1) dragStart(event.touches[0].clientX, event.touches[0].clientY, event)
				},
				{ passive: true }
			)
		}

		function paint() {
			adjust.pic.style.cssText =
				'position:absolute;width:' +
				adjust.dw +
				'px;height:' +
				adjust.dh +
				'px;left:' +
				adjust.x +
				'px;top:' +
				adjust.y +
				'px'
		}

		function clampOffset() {
			adjust.x =
				adjust.dw <= adjust.fw
					? (adjust.fw - adjust.dw) / 2
					: Math.min(0, Math.max(adjust.fw - adjust.dw, adjust.x))
			adjust.y =
				adjust.dh <= adjust.fh
					? (adjust.fh - adjust.dh) / 2
					: Math.min(0, Math.max(adjust.fh - adjust.dh, adjust.y))
		}

		function dragStart(x0, y0, event) {
			if (!adjust.canDrag) return
			if (event.type === 'mousedown') event.preventDefault()
			var ox = adjust.x
			var oy = adjust.y
			function move(cx, cy) {
				adjust.x = ox + (cx - x0)
				adjust.y = oy + (cy - y0)
				clampOffset()
				paint()
			}
			function onMouse(e) {
				move(e.clientX, e.clientY)
			}
			function onTouch(e) {
				if (e.touches.length === 1) {
					if (e.cancelable) e.preventDefault()
					move(e.touches[0].clientX, e.touches[0].clientY)
				}
			}
			function end() {
				window.removeEventListener('mousemove', onMouse)
				window.removeEventListener('mouseup', end)
				window.removeEventListener('touchmove', onTouch)
				window.removeEventListener('touchend', end)
				window.removeEventListener('touchcancel', end)
			}
			window.addEventListener('mousemove', onMouse)
			window.addEventListener('mouseup', end)
			window.addEventListener('touchmove', onTouch, { passive: false })
			window.addEventListener('touchend', end)
			window.addEventListener('touchcancel', end)
		}

		// Cuts the shown part out at the crop's real resolution and uploads it.
		function confirmAdjust() {
			dialog.setBusy(true)
			var sx = -adjust.x / adjust.scale
			var sy = -adjust.y / adjust.scale
			var sw = adjust.fw / adjust.scale
			var sh = adjust.fh / adjust.scale
			var outW = Math.round(Math.min(MAX_WIDTH, sw))
			var outH = Math.round(outW / RATIO)
			var canvas = document.createElement('canvas')
			canvas.width = outW
			canvas.height = outH
			canvas.getContext('2d').drawImage(adjust.img, sx, sy, sw, sh, 0, 0, outW, outH)
			canvas.toBlob(
				function (blob) {
					if (!blob) {
						dialog.setBusy(false)
						dialog.setError("Couldn't crop the image.")
						return
					}
					W.upload(new File([blob], 'preview-image.jpg', { type: 'image/jpeg' }), {}).then(
						function (result) {
							S.coverRemoved = false
							form.cover_image = result.file_url
							dialog.setBusy(false)
							drawView()
							saveDraft()
						},
						function (error) {
							dialog.setBusy(false)
							dialog.setError(error.message)
						}
					)
				},
				'image/jpeg',
				JPEG_QUALITY
			)
		}

		// viewActions come first (however many there are - a brand new post has
		// no schedule controls yet, an already-Published one can't be scheduled
		// at all), then the two adjust-mode ones.
		function showActions(adjusting) {
			var buttons = dialog ? dialog.root.querySelectorAll('.cafe-dialog-actions button') : []
			Array.prototype.forEach.call(buttons, function (b, i) {
				b.hidden = adjusting ? i < viewActions.length : i >= viewActions.length
			})
			if (dialog) dialog.setError('')
		}

		// ---- Schedule for later (mirrors Gameplan's ScheduleDialog.vue/
		// GPDraft.schedule - same copy, same date+time picker, same "stays in
		// Drafts" behavior) ----
		function pad2(n) {
			return (n < 10 ? '0' : '') + n
		}
		function openSchedule() {
			var container = W.el('div', 'cafe-w-schedule')
			var timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
			container.appendChild(
				W.el(
					'p',
					'cafe-w-schedule-hint',
					'The post goes out at this time, in your timezone (' +
						timezone +
						'). Until then it stays in Drafts and you can keep editing it.'
				)
			)
			var row = W.el('div', 'cafe-w-schedule-row')
			var dateInput = W.el('input', 'cafe-w-schedule-date')
			dateInput.type = 'date'
			var timeInput = W.el('input', 'cafe-w-schedule-time')
			timeInput.type = 'time'
			timeInput.step = 3600 // hour steps - the closest native equivalent to Gameplan's 60-min interval picker
			var now = new Date()
			var start = S.scheduledAt ? new Date(S.scheduledAt) : new Date(now.getTime() + 60 * 60 * 1000)
			start.setSeconds(0, 0)
			if (!S.scheduledAt) start.setMinutes(0)
			dateInput.min = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
			dateInput.value = start.getFullYear() + '-' + pad2(start.getMonth() + 1) + '-' + pad2(start.getDate())
			timeInput.value = pad2(start.getHours()) + ':' + pad2(start.getMinutes())
			row.appendChild(dateInput)
			row.appendChild(timeInput)
			container.appendChild(row)

			CAFE.dialog({
				title: 'Schedule for later',
				body: container,
				actions: [
					{
						label: 'Cancel',
						kind: 'outline',
						onClick: function (d) {
							d.close()
						},
					},
					{
						label: 'Schedule',
						kind: 'solid',
						onClick: function (d) {
							if (!dateInput.value || !timeInput.value) {
								d.setError('Pick a date and time')
								return
							}
							var picked = new Date(dateInput.value + 'T' + timeInput.value + ':00')
							if (!(picked.getTime() > Date.now())) {
								d.setError('Pick a time in the future')
								return
							}
							var local = dateInput.value + ' ' + timeInput.value + ':00'
							d.setBusy(true)
							options.onSchedule(local).then(
								function () {
									d.setBusy(false)
									d.close()
									dialog.close()
								},
								function (error) {
									d.setBusy(false)
									d.setError(error.message)
								}
							)
						},
					},
				],
			})
		}

		function doUnschedule() {
			dialog.setBusy(true)
			CAFE.api('cafe.api.unschedule_post', { post: S.postId }).then(
				function () {
					S.scheduledAt = null
					dialog.setBusy(false)
					CAFE.toast('Schedule cancelled')
					dialog.close()
				},
				function (error) {
					dialog.setBusy(false)
					dialog.setError(error.message)
				}
			)
		}

		var viewActions = [
			{
				label: 'Cancel',
				kind: 'outline',
				left: true,
				onClick: function (d) {
					CAFE.clearDraft(DRAFT_KEY)
					d.close()
				},
			},
		]
		// Only a not-yet-published draft can be scheduled - an already-live post
		// has nothing left to schedule, same restriction as Gameplan's own
		// GPDraft.schedule (discussion drafts only, never an edit-in-progress).
		if (S.status !== 'Published') {
			viewActions.push({
				label: S.scheduledAt ? 'Reschedule' : 'Schedule for later',
				kind: 'outline',
				onClick: openSchedule,
			})
			if (S.scheduledAt) viewActions.push({ label: 'Cancel schedule', kind: 'outline', onClick: doUnschedule })
		}
		viewActions.push({
			label: S.status === 'Published' ? 'Update' : 'Publish',
			kind: 'solid',
			onClick: function () {
				options.onPublish()
			},
		})

		dialog = CAFE.dialog({
			title: 'Story Preview',
			body: body,
			wide: true,
			onClose: function () {
				fileInput.remove()
			},
			actions: viewActions.concat([
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function () {
						drawView()
					},
				},
				{ label: 'Done', kind: 'solid', onClick: confirmAdjust },
			]),
		})
		dialog.root.classList.add('cafe-w-story-dialog')
		drawView()
		return dialog
	}
})()
