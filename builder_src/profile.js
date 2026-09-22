// Profile page behaviour. The page itself is rendered by the server; this adds
// the interactions: read more, show all, copy link, and (on your own profile)
// the editing dialogs. Needs ui.js.
;(function () {
	'use strict'

	var MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	]
	var MONTH_OPTIONS = MONTHS.map(function (name, i) {
		return { label: name, value: (i < 9 ? '0' : '') + (i + 1) }
	})
	var YEAR_OPTIONS = []
	for (var year = new Date().getFullYear(), i = 0; i < 80; i++) {
		YEAR_OPTIONS.push({ label: String(year - i), value: String(year - i) })
	}

	var root, username

	// Dates are stored as full dates, but the pickers only collect a month and
	// a year. The day is always the 1st.
	function splitMonthYear(value) {
		var parts = String(value || '').split('-')
		return { year: parts[0] || '', month: parts[1] || '' }
	}
	function combineMonthYear(year, month) {
		return year && month ? year + '-' + month + '-01' : ''
	}
	function monthYearFields(prefix, label) {
		return {
			row: [
				{
					name: prefix + '_month',
					label: label + ' month',
					type: 'select',
					placeholder: 'Month',
					options: MONTH_OPTIONS,
				},
				{
					name: prefix + '_yr',
					label: label + ' year',
					type: 'select',
					placeholder: 'Year',
					options: YEAR_OPTIONS,
				},
			],
		}
	}
	function withMonthYear(values, prefix, stored) {
		var parts = splitMonthYear(stored)
		values[prefix + '_month'] = parts.month
		values[prefix + '_yr'] = parts.year
		return values
	}

	function reloadAfter(promise, message) {
		return promise.then(function () {
			CAFE.toast(message)
			// The page is rendered by the server, so reloading shows the saved data.
			setTimeout(function () {
				location.reload()
			}, 350)
		})
	}

	// The freshest copy of the profile, so an edit dialog never shows stale values.
	function loadProfile() {
		return CAFE.get('cafe.api.get_profile', { user: username })
	}

	// ---- Own-profile editing ----

	function editHeader() {
		loadProfile().then(function (profile) {
			CAFE.form({
				title: 'Edit profile',
				values: profile,
				fields: [
					{ name: 'full_name', label: 'Full name', required: true },
					{ name: 'headline', label: 'Bio', type: 'textarea' },
					{
						row: [
							{ name: 'job_title', label: 'Job title' },
							{ text: 'at' },
							{ name: 'company', label: 'Company' },
						],
					},
				],
				onSubmit: function (values) {
					return reloadAfter(CAFE.api('cafe.api.update_profile', values), 'Profile updated')
				},
			})
		})
	}

	function editBio() {
		loadProfile().then(function (profile) {
			CAFE.form({
				title: 'Edit introduction',
				values: profile,
				fields: [{ name: 'bio', label: 'Introduction', type: 'textarea', rows: 6 }],
				onSubmit: function (values) {
					return reloadAfter(CAFE.api('cafe.api.update_profile', values), 'Introduction updated')
				},
			})
		})
	}

	function deleteEntry(method, id, title, message) {
		return CAFE.confirm({ title: title, message: message, confirmLabel: 'Delete', danger: true }).then(function (
			ok
		) {
			if (!ok) return false
			return reloadAfter(CAFE.api(method, { name: id }), 'Deleted').then(function () {
				return true
			})
		})
	}

	function workForm(entry) {
		var editing = !!entry
		var values = withMonthYear(
			withMonthYear(Object.assign({}, entry), 'start', entry && entry.start_date),
			'end',
			entry && entry.end_date
		)
		CAFE.form({
			title: editing ? 'Edit work experience' : 'Add work experience',
			values: values,
			fields: [
				{
					row: [
						{ name: 'title', label: 'Title' },
						{ text: 'at' },
						{ name: 'company', label: 'Company', required: true },
					],
				},
				monthYearFields('start', 'Start'),
				monthYearFields('end', 'End'),
				{ name: 'description', label: 'Description', type: 'textarea' },
			],
			onSubmit: function (v) {
				var payload = {
					company: v.company,
					title: v.title,
					description: v.description,
					start_date: combineMonthYear(v.start_yr, v.start_month),
					end_date: combineMonthYear(v.end_yr, v.end_month),
				}
				if (editing) payload.name = entry.name
				return reloadAfter(CAFE.api(editing ? 'cafe.api.update_work' : 'cafe.api.add_work', payload), 'Saved')
			},
			onDelete: editing
				? function () {
						return deleteEntry(
							'cafe.api.delete_work',
							entry.name,
							'Delete work experience?',
							'This will permanently remove "' + entry.company + '" from your profile.'
						)
				  }
				: null,
		})
	}

	function educationForm(entry) {
		var editing = !!entry
		var values = withMonthYear(
			withMonthYear(Object.assign({}, entry), 'start', entry && entry.start_year),
			'end',
			entry && entry.end_year
		)
		CAFE.form({
			title: editing ? 'Edit education' : 'Add education',
			values: values,
			fields: [
				{ name: 'school', label: 'School', required: true },
				{ name: 'degree', label: 'Degree' },
				{ name: 'field_of_study', label: 'Field of study' },
				monthYearFields('start', 'Start'),
				monthYearFields('end', 'End'),
			],
			onSubmit: function (v) {
				var payload = {
					school: v.school,
					degree: v.degree,
					field_of_study: v.field_of_study,
					start_year: combineMonthYear(v.start_yr, v.start_month),
					end_year: combineMonthYear(v.end_yr, v.end_month),
				}
				if (editing) payload.name = entry.name
				return reloadAfter(
					CAFE.api(editing ? 'cafe.api.update_education' : 'cafe.api.add_education', payload),
					'Saved'
				)
			},
			onDelete: editing
				? function () {
						return deleteEntry(
							'cafe.api.delete_education',
							entry.name,
							'Delete education?',
							'This will permanently remove "' + entry.school + '" from your profile.'
						)
				  }
				: null,
		})
	}

	function editEntry(kind, id) {
		loadProfile().then(function (profile) {
			var entry = (profile[kind] || []).filter(function (item) {
				return item.name === id
			})[0]
			if (!entry) return CAFE.toast('That entry no longer exists.', 'warning')
			if (kind === 'work') workForm(entry)
			else educationForm(entry)
		})
	}

	// ---- Everyone ----

	function copyLink() {
		var url = location.origin + '/profile/' + encodeURIComponent(username)
		navigator.clipboard.writeText(url).then(
			function () {
				CAFE.toast('Link copied')
			},
			function () {
				CAFE.toast('Could not copy the link', 'error')
			}
		)
	}

	function toggleBio(button) {
		var bio = document.getElementById('cafe-bio')
		if (!bio) return
		var expanded = bio.classList.toggle('expanded')
		button.textContent = expanded ? 'see less' : '...see more'
	}

	function expandList(button) {
		var list = document.getElementById(button.getAttribute('data-expand'))
		if (list) list.classList.add('expanded')
		button.remove()
	}

	var ACTIONS = {
		'edit-header': editHeader,
		'edit-bio': editBio,
		'add-work': function () {
			workForm(null)
		},
		'add-education': function () {
			educationForm(null)
		},
		'edit-work': function (button) {
			editEntry('work', button.getAttribute('data-id'))
		},
		'edit-education': function (button) {
			editEntry('education', button.getAttribute('data-id'))
		},
		share: copyLink,
		'toggle-bio': toggleBio,
	}

	// A broken avatar image falls back to the initial, like the old page. The
	// image can fail before this script runs, so check for that as well as
	// listening for the error.
	function watchAvatar() {
		var image = root.querySelector('.cafe-profile-avatar img')
		if (!image) return
		function useInitial() {
			image.remove()
			var name = root.querySelector('.cafe-profile-name').textContent || '?'
			root.querySelector('.cafe-profile-avatar').appendChild(
				CAFE.el('span', 'cafe-profile-initial', name.trim().charAt(0))
			)
		}
		if (image.complete && image.naturalWidth === 0) useInitial()
		else image.addEventListener('error', useInitial)
	}

	document.addEventListener('DOMContentLoaded', function () {
		root = document.getElementById('cafe-profile')
		if (!root) return
		username = root.getAttribute('data-username')

		root.addEventListener('click', function (event) {
			var expand = event.target.closest('[data-expand]')
			if (expand) return expandList(expand)
			var button = event.target.closest('[data-action]')
			if (button && ACTIONS[button.getAttribute('data-action')])
				ACTIONS[button.getAttribute('data-action')](button)
		})
		watchAvatar()
	})
})()
