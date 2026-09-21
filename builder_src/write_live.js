// The native post editor, part 4: saving, publishing, the header buttons, and
// putting the editor on screen. Load this last.
;(function () {
	'use strict'

	var MNA = window.MNA
	var W = MNA.write
	var head = {}

	function editing() {
		return !!W.state.postId
	}

	// ---- The header ----
	function draftLabel() {
		return W.state.status === 'Archived' ? 'Save' : 'Save Draft'
	}
	function publishLabel() {
		return W.state.status === 'Published' ? 'Update' : 'Publish'
	}
	function secondaryStatus() {
		return W.state.status === 'Archived' ? 'Archived' : 'Draft'
	}

	function setLabel(button, label, busy) {
		if (!button) return
		var text = button.querySelector('span') || button
		text.textContent = label
		button.classList.toggle('busy', !!busy)
		button.disabled = !!busy
	}

	function refreshHeader() {
		var S = W.state
		setLabel(head.draft, draftLabel(), S.saving === secondaryStatus())
		setLabel(head.publish, publishLabel(), S.saving === 'Published')
		setLabel(head.mpublish, publishLabel(), S.saving === 'Published')
		if (head.more) head.more.hidden = !editing()
		if (head.crumb) head.crumb.textContent = editing() ? 'Edit' : 'Write'
		if (head.mtitle) head.mtitle.textContent = editing() ? 'Edit' : 'Write'
		if (head.back) head.back.setAttribute('href', editing() ? '/posts/' + encodeURIComponent(S.postId) : '/')
	}

	function moreItems() {
		var items = []
		if (W.state.status === 'Published')
			items.push({
				label: 'Archive',
				icon: 'archive',
				onClick: function () {
					save('Archived')
				},
			})
		items.push({ label: 'Delete permanently', icon: 'trash-2', danger: true, onClick: confirmDelete })
		return items
	}

	function mobileItems() {
		var items = [
			{
				label: draftLabel(),
				icon: 'save',
				onClick: function () {
					save(secondaryStatus())
				},
			},
		]
		return editing() ? items.concat(moreItems()) : items
	}

	// ---- Saving ----

	// Resolves true when the post was saved.
	function save(status) {
		var S = W.state
		var form = S.form
		if (W.isEmpty()) {
			MNA.toast('Write something before saving')
			return Promise.resolve(false)
		}
		if (status === 'Published' && !form.title.trim()) {
			MNA.toast('Add a title before publishing')
			return Promise.resolve(false)
		}
		var previous = S.status
		S.saving = status
		W.setBusy('')
		refreshHeader()
		var payload = Object.assign({}, form, { content: W.content(), status: status })
		// A live post saved as a draft is never changed: the edit becomes a new,
		// separate draft, so readers do not see the post vanish while you tweak it.
		var fork = editing() && status === 'Draft' && previous === 'Published'
		var request =
			editing() && !fork
				? W.update(S.postId, payload).then(function () {
						return { name: S.postId, isNew: false }
				  })
				: W.create(payload).then(function (doc) {
						return { name: doc.name, isNew: true }
				  })
		return request.then(
			function (result) {
				S.saving = null
				S.status = status
				S.savedAt = new Date()
				if (status === 'Published') {
					MNA.toast('Post published')
					location.assign('/posts/' + encodeURIComponent(result.name))
					return true
				}
				if (fork) MNA.toast("Saved as a new draft — your published post wasn't changed")
				else if (status === 'Archived') MNA.toast(previous === 'Archived' ? 'Changes saved' : 'Post archived')
				else MNA.toast('Draft saved')
				if (result.isNew) {
					S.postId = result.name
					if (window.top === window)
						history.replaceState(null, '', W.base + '/' + encodeURIComponent(result.name))
				}
				refreshHeader()
				W.setStatusLine()
				return true
			},
			function (error) {
				S.saving = null
				W.setBusy(error.message)
				refreshHeader()
				return false
			}
		)
	}

	function openPreview() {
		var S = W.state
		if (W.isEmpty()) {
			MNA.toast('Write something before publishing')
			return
		}
		if (!S.form.title.trim()) {
			MNA.toast('Add a title before publishing')
			return
		}
		var dialog = W.openPreview({
			onPublish: function () {
				var form = S.form
				// The first picture and the start of the text are only shown as
				// defaults; keep them now so the feed has something to read.
				if (!form.cover_image && W.previewImage()) form.cover_image = W.previewImage()
				if (!form.excerpt && W.autoExcerpt(W.content())) form.excerpt = W.autoExcerpt(W.content())
				dialog.setBusy(true)
				save('Published').then(function (ok) {
					if (!ok) {
						dialog.setBusy(false)
						dialog.setError(document.querySelector('.mna-w-error').textContent)
					}
				})
			},
		})
	}

	function confirmDelete() {
		MNA.confirm({
			title: 'Delete this post?',
			message: 'This cannot be undone.',
			confirmLabel: 'Delete',
			danger: true,
		}).then(function (ok) {
			if (!ok) return
			W.remove(W.state.postId).then(function () {
				MNA.toast('Post deleted')
				location.replace('/profile')
			}, W.errorToast)
		})
	}

	// ---- Start ----

	function idFromAddress(root) {
		var match = location.pathname.match(new RegExp('^' + W.base + '/([^/]+)'))
		return match ? decodeURIComponent(match[1]) : root.getAttribute('data-post') || null
	}

	function wire() {
		function byId(id) {
			return document.getElementById(id)
		}
		head.draft = byId('mna-w-draft')
		head.publish = byId('mna-w-publish')
		head.mpublish = byId('mna-w-mpublish')
		head.more = byId('mna-w-more')
		head.mmore = byId('mna-w-mmore')
		head.crumb = byId('mna-w-crumb')
		head.mtitle = byId('mna-w-mtitle')
		head.back = byId('mna-w-back')
		if (head.draft)
			head.draft.addEventListener('click', function () {
				save(secondaryStatus())
			})
		;[head.publish, head.mpublish].forEach(function (b) {
			if (b) b.addEventListener('click', openPreview)
		})
		if (head.more)
			head.more.addEventListener('click', function () {
				W.menu(head.more, moreItems())
			})
		if (head.mmore)
			head.mmore.addEventListener('click', function () {
				W.menu(head.mmore, mobileItems())
			})
	}

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('mna-write')
		if (!root) return
		var id = idFromAddress(root)
		W.state.postId = id
		W.build(root)
		wire()
		refreshHeader()
		if (!id) {
			W.fill(null)
			return
		}
		W.showLoading()
		W.load(id).then(
			function (doc) {
				W.state.loaded = true
				W.fill(doc)
				refreshHeader()
			},
			function (error) {
				W.fill(null)
				W.setBusy(error.message)
			}
		)
	})
})()
