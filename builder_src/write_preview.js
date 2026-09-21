// The native post editor, part 3: the Story Preview you see before you
// publish, with the cover image and its crop.
;(function () {
	'use strict'

	var W = window.MNA.write
	var RATIO = 1.91
	var MAX_WIDTH = 1200
	var JPEG_QUALITY = 0.92

	W.previewImage = function () {
		var S = W.state
		if (S.coverRemoved) return ''
		return S.form.cover_image || W.firstImage(W.content())
	}

	// Opens the dialog. onPublish() is called on Publish; the returned api has setBusy(bool).
	W.openPreview = function (options) {
		var S = W.state
		var form = S.form
		var html = W.ensureHtml(W.content())
		var adjust = null // { url, natural, frame, offset }
		var body = W.el('div', 'mna-w-story')
		var dialog

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
			var b = W.el('button', 'mna-w-cover-btn', label)
			b.type = 'button'
			b.addEventListener('click', onClick)
			return b
		}

		// ---- The preview ----
		function drawView() {
			adjust = null
			body.replaceChildren()
			var url = W.previewImage()
			var cover = W.el('div', 'mna-w-cover')
			if (url) {
				var img = W.el('img')
				img.src = url
				img.alt = ''
				cover.appendChild(img)
			} else {
				var empty = W.el('div', 'mna-w-cover-empty')
				empty.appendChild(W.icon('image', 'mna-w-large'))
				cover.appendChild(empty)
			}
			var over = W.el('div', 'mna-w-cover-over')
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
					})
				)
			}
			cover.appendChild(over)
			body.appendChild(cover)
			body.appendChild(W.el('p', 'mna-w-read', W.readTime(html) + ' min read'))
			var title = W.el('input', 'mna-w-story-title')
			title.type = 'text'
			title.placeholder = 'Untitled'
			title.value = form.display_title || form.title
			title.addEventListener('input', function () {
				form.display_title = title.value
			})
			var excerpt = W.el('textarea', 'mna-w-story-excerpt')
			excerpt.rows = 2
			excerpt.placeholder = 'Write a short preview of your story…'
			excerpt.value = form.excerpt || W.autoExcerpt(html)
			excerpt.addEventListener('input', function () {
				form.excerpt = excerpt.value
			})
			body.appendChild(title)
			body.appendChild(excerpt)
			body.appendChild(
				W.el(
					'p',
					'mna-w-story-note',
					'Note: changes here affect how your story appears in previews and feeds — not the story itself.'
				)
			)
			showActions(false)
		}

		// ---- Adjusting the crop ----
		function startAdjust(url) {
			body.replaceChildren(W.el('p', 'mna-w-adjust-hint', 'Loading…'))
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
			var frame = W.el('div', 'mna-w-frame')
			var pic = W.el('img')
			pic.src = adjust.url
			pic.draggable = false
			frame.appendChild(pic)
			var hint = W.el('p', 'mna-w-adjust-hint', 'Drag to reposition.')
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

		// The first two buttons belong to the preview, the last two to adjusting.
		function showActions(adjusting) {
			var buttons = dialog ? dialog.root.querySelectorAll('.mna-dialog-actions button') : []
			Array.prototype.forEach.call(buttons, function (b, i) {
				b.hidden = adjusting ? i < 2 : i >= 2
			})
			if (dialog) dialog.setError('')
		}

		dialog = MNA.dialog({
			title: 'Story Preview',
			body: body,
			wide: true,
			onClose: function () {
				fileInput.remove()
			},
			actions: [
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function (d) {
						d.close()
					},
				},
				{
					label: S.status === 'Published' ? 'Update' : 'Publish',
					kind: 'solid',
					onClick: function () {
						options.onPublish()
					},
				},
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function () {
						drawView()
					},
				},
				{ label: 'Done', kind: 'solid', onClick: confirmAdjust },
			],
		})
		dialog.root.classList.add('mna-w-story-dialog')
		drawView()
		return dialog
	}
})()
