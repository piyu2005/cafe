"""The Profile page: /profile/<username>. The whole page is rendered by the
server. On your own profile, profile.js adds the editing dialogs.

/profile (no username) is a second, empty page that redirects to your own
/profile/<username>, so the address bar always shows the username."""

from blocks import (
	BUTTON_BORDER,
	GRAY_4,
	GRAY_6,
	GRAY_7,
	INK,
	MUTED,
	NBSP,
	OUTLINE,
	SURFACE_2,
	attribute,
	bind,
	block,
	html_el,
	icon,
	label,
	raw_block,
	show,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS, POST_ROWS, SAMPLE_POST, SAMPLE_WORK_AND_EDUCATION, indent
from layout import crumb_current, crumb_link, crumb_separator, page_layout
from post_row import build_post_row

# ---- Buttons ----


def outline_button(action, text=None, icon_name=None, name=None, aria=None):
	"""One block holding the whole button. Its hover look is in styles.css."""
	children = []
	if icon_name:
		children.append(svg(icon_name, 16))
	if text:
		children.append(html_el("span", text=text))
	button = html_el(
		"button",
		["mna-outline-btn"],
		{"type": "button", "aria-label": aria or text, "data-action": action},
		{
			"display": "inline-flex",
			"alignItems": "center",
			"justifyContent": "center",
			"gap": "8px",
			"height": "28px",
			"minWidth": "28px",
			"padding": "0 8px" if text else "0",
			"border": f"1px solid {BUTTON_BORDER}",
			"borderRadius": "8px",
			"backgroundColor": "#ffffff",
			"color": INK,
			"fontSize": "14px",
			"cursor": "pointer",
		},
		children,
	)
	return raw_block(name or text or aria, button, styles={"display": "flex"})


ICON_BUTTON_STYLES = {
	"display": "grid",
	"placeItems": "center",
	"flexShrink": "0",
	"width": "24px",
	"height": "24px",
	"padding": "0",
	"border": "0",
	"borderRadius": "6px",
	"backgroundColor": "transparent",
	"color": INK,
	"cursor": "pointer",
}
TEXT_BUTTON_STYLES = {
	"display": "inline-flex",
	"alignItems": "center",
	"height": "28px",
	"padding": "0 8px",
	"border": "0",
	"borderRadius": "8px",
	"backgroundColor": "transparent",
	"color": INK,
	"fontSize": "14px",
	"cursor": "pointer",
}


def static_icon_button(action, aria, icon_name="pencil"):
	"""A small icon button with no data binding, as one block."""
	button = html_el(
		"button",
		["mna-icon-btn"],
		{"type": "button", "aria-label": aria, "title": aria, "data-action": action},
		ICON_BUTTON_STYLES,
		[svg(icon_name, 14)],
	)
	return raw_block(aria, button, styles={"display": "flex"})


def icon_button(action, aria, icon_name="pencil", custom=None):
	"""An icon button as blocks, for places that need a data binding on it."""
	return block(
		"button",
		aria,
		["mna-icon-btn"],
		attrs={"type": "button", "aria-label": aria, "title": aria},
		custom={"data-action": action, **(custom or {})},
		children=[icon(icon_name, 14)],
		styles=ICON_BUTTON_STYLES,
	)


def text_button(text, tag="button", attrs=None, custom=None, color=INK, name=None, **style):
	"""A ghost button that is only text, as a block (for one with a binding)."""
	return block(
		tag,
		name or text,
		["mna-text-btn"],
		attrs={**({"type": "button"} if tag == "button" else {}), **(attrs or {})},
		custom=custom,
		text=text,
		styles={**TEXT_BUTTON_STYLES, "color": color, **style},
	)


# ---- Header: avatar, name, buttons, job line, headline ----


def build_avatar():
	picture = when(
		attribute(
			block(
				"img",
				"Avatar image",
				attrs={"src": "", "alt": ""},
				styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
			),
			"profile.user_image",
			"src",
		),
		"profile.user_image",
	)
	initial = when(
		show(
			block(
				"span",
				"Initial",
				classes=["mna-profile-initial"],
				text="P",
				styles={
					**text_style(40, "500", MUTED, "0", "1.5"),
					"gridArea": "1 / 1",
					"textTransform": "uppercase",
				},
			),
			"profile.initial",
		),
		"profile.no_image",
	)
	return block(
		"div",
		"Avatar",
		["mna-profile-avatar"],
		children=[picture, initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "100px",
			"height": "100px",
			"overflow": "hidden",
			"border": f"1px solid {OUTLINE}",
			"borderRadius": "9999px",
			"backgroundColor": SURFACE_2,
		},
	)


def build_name_row():
	name = show(
		block(
			"h1",
			"Name",
			["mna-profile-name"],
			text="Priyanshi Hodage",
			styles={
				"margin": "0",
				"overflow": "hidden",
				"textOverflow": "ellipsis",
				"whiteSpace": "nowrap",
				**text_style(32, "600", INK, "0.015em", "1.6"),
			},
		),
		"profile.full_name",
	)
	buttons = block(
		"div",
		"Buttons",
		["mna-profile-buttons"],
		styles={"display": "flex", "alignItems": "center", "gap": "8px", "flexShrink": "0"},
		children=[
			when(outline_button("edit-header", "Edit"), "profile.is_own"),
			outline_button("share", icon_name="share-2", aria="Copy profile link", name="Share"),
		],
	)
	return block(
		"div",
		"Name row",
		["mna-name-row"],
		styles={"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "16px"},
		children=[name, buttons],
	)


def build_job_line():
	job = when(
		block(
			"span",
			"Job",
			styles={"display": "flex", "alignItems": "center", "gap": "4px"},
			children=[
				icon("briefcase", 16),
				show(block("span", text="Intern at Frappe"), "profile.job_line"),
			],
		),
		"profile.has_job",
	)
	dot = when(block("span", "Dot", text="·"), "profile.has_job")
	handle = show(block("span", "Username", text="@username"), "profile.at_username")
	return block(
		"div",
		"Job line",
		styles={
			"marginTop": "4px",
			"display": "flex",
			"flexWrap": "wrap",
			"alignItems": "center",
			"gap": "6px",
			**text_style(13, "420", MUTED),
		},
		children=[job, dot, handle],
	)


def build_headline():
	def paragraph(name, text, color, key, condition):
		p = block(
			"p", name, text=text, styles={"margin": "0", **text_style(16, "420", color, "0.02em", "1.5")}
		)
		return when(show(p, key) if key else p, condition)

	# The wrapper is left out when there is nothing to show, so its top margin adds no gap.
	return when(
		block(
			"div",
			"Headline",
			styles={"marginTop": "4px"},
			children=[
				paragraph(
					"Headline text",
					"Debugging my code by day",
					GRAY_6,
					"profile.headline",
					"profile.headline",
				),
				paragraph("Headline hint", "Add a short bio.", GRAY_4, None, "profile.show_headline_hint"),
			],
		),
		"profile.show_headline",
	)


def build_header():
	return block(
		"div",
		"Profile header",
		["mna-profile-head"],
		styles={"display": "flex", "alignItems": "flex-start", "gap": "32px"},
		children=[
			build_avatar(),
			block(
				"div",
				"Details",
				styles={"flexGrow": "1", "minWidth": "0"},
				children=[build_name_row(), build_job_line(), build_headline()],
			),
		],
	)


# ---- Cards ----


def card(icon_name, title, body, action=None, name=None):
	title_block = raw_block(
		"Card title",
		svg(icon_name, 16) + html_el("span", text=title),
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "6px",
			**text_style(14, "500", INK, "0.015em"),
		},
	)
	head = block(
		"div",
		"Card header",
		styles={
			"display": "flex",
			"alignItems": "center",
			"justifyContent": "space-between",
			"paddingBottom": "16px",
		},
		children=[title_block, *([action] if action else [])],
	)
	return block(
		"div",
		name or title,
		["mna-card"],
		styles={"border": f"1px solid {OUTLINE}", "borderRadius": "10px", "padding": "20px"},
		children=[head, *body],
	)


def repeater(name, classes, key, row, attrs=None):
	"""A list that Builder repeats `row` for, once per item in data.<key>."""
	node = block(
		"div",
		name,
		classes,
		attrs=attrs,
		children=[row],
		styles={"display": "flex", "flexDirection": "column"},
	)
	node["isRepeaterBlock"] = True
	node["dataKey"] = bind(key, "innerHTML", "key")
	return node


def muted_paragraph(text, condition, name, line="1.15"):
	return when(
		block("p", name, text=text, styles={"margin": "0", **text_style(14, "420", MUTED, "0.02em", line)}),
		condition,
	)


def show_all_row(text, target, condition):
	"""The centered "Show all ..." button under a card, as one block."""
	button = html_el(
		"button", ["mna-text-btn"], {"type": "button", "data-expand": target}, TEXT_BUTTON_STYLES, text=text
	)
	return when(
		raw_block(
			"More",
			button,
			styles={"marginTop": "12px", "display": "flex", "justifyContent": "center"},
		),
		condition,
	)


def more_row(children, condition):
	"""The row under a card with its "show all" button. It is left out when
	there is no button, so its top margin adds no gap."""
	return when(
		block(
			"div",
			"More",
			styles={"marginTop": "12px", "display": "flex", "justifyContent": "center"},
			children=children,
		),
		condition,
	)


def build_intro():
	bio = when(
		show(
			block(
				"p",
				"Bio",
				["mna-clamp-3"],
				attrs={"id": "mna-bio"},
				text="Hello! I am Priyanshi",
				styles={"margin": "0", **text_style(14, "420", GRAY_6, "0.02em", "1.5")},
			),
			"profile.bio",
		),
		"profile.bio",
	)
	see_more = when(
		text_button(
			"...see more",
			custom={"data-action": "toggle-bio"},
			color=MUTED,
			name="See more",
			marginTop="4px",
			width="100%",
			justifyContent="flex-end",
		),
		"profile.bio_long",
	)
	hint = muted_paragraph("Write about yourself.", "profile.show_bio_hint", "Bio hint", line="1.5")
	edit = when(static_icon_button("edit-bio", "Edit introduction"), "profile.is_own")
	return card("user", "Introduction", [bio, see_more, hint], action=edit, name="Introduction")


def build_posts():
	posts = repeater("Posts list", ["mna-posts"], "posts", build_post_row())
	empty_own = when(
		block(
			"p",
			"Nothing yet",
			children=[
				label("You haven't published anything yet. "),
				block(
					"a",
					"Write link",
					text="Write your first blog.",
					attrs={"href": "/write"},
					styles={"fontWeight": "500", "color": INK},
				),
			],
			styles={"margin": "0", **text_style(14, "420", MUTED, "0.02em")},
		),
		"profile.posts_empty_own",
	)
	empty_other = muted_paragraph("No posts yet.", "profile.posts_empty_other", "No posts")
	card_block = card("notebook-pen", "Posts", [posts, empty_own, empty_other])
	view_all = when(
		text_button("Manage all posts", tag="a", attrs={"href": "/profile"}, name="Manage all posts"),
		"profile.posts_more_own",
	)
	view_all = attribute(view_all, "profile.posts_href", "href")
	view_others = attribute(
		when(
			text_button("View all posts", tag="a", attrs={"href": "/profile"}, name="View all posts"),
			"profile.posts_more_other",
		),
		"profile.posts_href",
		"href",
	)
	return block(
		"div", "Posts section", children=[card_block, more_row([view_all, view_others], "profile.posts_more")]
	)


def build_entry_row(primary, secondary_key, secondary_color, edit_action, edit_label, extra=None):
	"""One work or education item: a bold first line, then a second line and
	dates, then an optional description, with an edit button on your own."""
	title = show(
		block("div", "Primary", text="Company", styles=text_style(14, "600", INK, "0.015em", "1.5")), primary
	)
	second = when(
		show(block("span", "Secondary", text="Title"), secondary_key),
		secondary_key,
	)
	dot = when(
		block("span", "Dot", text=f"{NBSP}·{NBSP}", styles={"color": GRAY_4}),
		"show_dot",
	)
	dates = when(
		show(
			block("span", "Dates", text="Sep 2025 — Dec 2025", styles=text_style(13, "420", MUTED)),
			"dates",
		),
		"dates",
	)
	line = block(
		"div",
		"Line",
		styles={"marginTop": "4px", **text_style(14, "420", secondary_color, "0.02em", "1.5")},
		children=[second, dot, dates],
	)
	body = [title, line]
	if extra:
		body.append(extra)
	edit = when(
		icon_button(edit_action, edit_label, custom={"data-id": ""}),
		"is_own",
	)
	edit = attribute(edit, "id", "data-id")
	return block(
		"div",
		"Entry",
		["mna-entry"],
		styles={
			"display": "flex",
			"alignItems": "flex-start",
			"justifyContent": "space-between",
			"gap": "12px",
			"padding": "20px 0",
		},
		children=[block("div", "Text", children=body), edit],
	)


def build_work():
	description = when(
		show(
			block(
				"p",
				"Description",
				text="What I did there.",
				styles={"margin": "4px 0 0", **text_style(13, "420", GRAY_6, "0.015em", "1.5")},
			),
			"description",
		),
		"description",
	)
	row = build_entry_row("company", "title", INK, "edit-work", "Edit work experience", extra=description)
	entries = repeater("Work list", ["mna-entries"], "work", row, attrs={"id": "mna-work-list"})
	body = [
		entries,
		muted_paragraph("Add your work experience.", "profile.work_empty_own", "No work (yours)"),
		muted_paragraph("No work history added yet.", "profile.work_empty_other", "No work"),
	]
	add = when(static_icon_button("add-work", "Add work experience", "plus"), "profile.is_own")
	return block(
		"div",
		"Work section",
		children=[
			card("briefcase", "Work History", body, action=add, name="Work History"),
			show_all_row("Show all History", "mna-work-list", "profile.work_more"),
		],
	)


def build_education():
	row = build_entry_row("school", "degree_line", GRAY_7, "edit-education", "Edit education")
	entries = repeater(
		"Education list", ["mna-entries"], "education", row, attrs={"id": "mna-education-list"}
	)
	body = [
		entries,
		muted_paragraph("Add your education.", "profile.education_empty_own", "No education (yours)"),
		muted_paragraph("No education added yet.", "profile.education_empty_other", "No education"),
	]
	add = when(static_icon_button("add-education", "Add education", "plus"), "profile.is_own")
	return block(
		"div",
		"Education section",
		children=[
			card("graduation-cap", "Education", body, action=add, name="Education"),
			show_all_row("Show all Education", "mna-education-list", "profile.education_more"),
		],
	)


def build_not_found():
	return when(
		raw_block(
			"Not found",
			svg("user-x", 32, "#c8c8c8")
			+ html_el(
				"p",
				None,
				None,
				{"margin": "0", **text_style(14, "420", MUTED, "0.02em", "1.5")},
				text="This profile does not exist.",
			),
			styles={
				"display": "flex",
				"flexDirection": "column",
				"alignItems": "center",
				"gap": "12px",
				"padding": "96px 0",
				"textAlign": "center",
			},
		),
		"profile.not_found",
	)


def build_profile(shell_id, shell_block):
	sections = block(
		"div",
		"Sections",
		styles={"marginTop": "32px", "display": "flex", "flexDirection": "column", "gap": "32px"},
		children=[build_intro(), build_posts(), build_work(), build_education()],
	)
	content = when(
		block(
			"div",
			"Profile",
			attrs={"id": "mna-profile"},
			custom={"data-username": ""},
			children=[build_header(), sections],
		),
		"profile.found",
	)
	content = attribute(content, "profile.username", "data-username")
	crumbs = [
		crumb_link("Cafe", "/"),
		crumb_separator(),
		when(crumb_current("Profile"), "profile.is_own"),
		when(crumb_link("Explore", "/", name="Explore", styles={"color": MUTED}), "profile.is_other"),
		when(crumb_separator(), "profile.is_other"),
		when(show(crumb_current("Name"), "profile.crumb_name"), "profile.is_other"),
	]
	return page_layout(shell_id, shell_block, crumbs, [content, build_not_found()], "740px")


def build_profile_redirect(shell_id, shell_block):
	"""/profile has no real body: its data script sends you to /profile/<username>
	before anything is shown. This note is only for people editing the page."""
	note = block(
		"p",
		"Note",
		text="This page only sends you to your own profile. Edit the page at /profile/:username instead.",
		styles={"margin": "0", **text_style(14, "420", MUTED, "0.02em", "1.5")},
	)
	return page_layout(shell_id, shell_block, [crumb_link("Cafe", "/")], [note], "740px")


# ---- Data scripts ----

# Runs on the server for every visit. Builder puts what it returns into the
# page as raw HTML (its template engine does not escape), and names, bios and
# post titles are chosen by users, so every value that reaches the HTML is
# escaped here. The helper functions call only builtins and `frappe`, because
# functions defined in a server script cannot see each other.
DATE_RANGE = """\
def date_range(start, end):
    if not (start or end):
        return ""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    first = months[int(str(start)[5:7]) - 1] + " " + str(start)[:4] if start else ""
    last = months[int(str(end)[5:7]) - 1] + " " + str(end)[:4] if end else "Present"
    return first + " \\u2014 " + last


"""

PROFILE_MAIN = """\
identifier = frappe.form_dict.username or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/profile/" + path_segment(identifier))

if not identifier:
    # Builder's editor canvas has no username in the address: show your own profile there.
    user_id = frappe.session.user
else:
    user_id = frappe.db.get_value("User", {"username": identifier}, "name")
    if not user_id and "@" in identifier and frappe.db.exists("User", identifier):
        user_id = identifier
if user_id == "Guest":
    user_id = None

if not user_id:
    data.profile = {"found": False, "not_found": True, "is_other": True, "crumb_name": "Profile"}
    data.posts = []
    data.work = []
    data.education = []
else:
    person = frappe.call("cafe.api.get_profile", user=user_id)
    if identifier and person.username != identifier:
        redirect("/profile/" + path_segment(person.username))

    is_own = person.name == frappe.session.user
    name = person.full_name or person.username
    image = safe_url(person.user_image)
    rows = frappe.call("cafe.api.list_profile_posts", user=user_id, limit=3)
@@POST_ROWS@@
    work = []
    for job in person.work:
        dates = date_range(job.start_date, job.end_date)
        work.append({
            "id": clean(job.name),
            "is_own": is_own,
            "company": clean(job.company),
            "title": clean(job.title),
            "dates": dates,
            "show_dot": bool(job.title and dates),
            "description": clean(job.description),
        })

    education = []
    for entry in person.education:
        dates = date_range(entry.start_year, entry.end_year)
        degree_line = ", ".join([part for part in [entry.degree, entry.field_of_study] if part])
        education.append({
            "id": clean(entry.name),
            "is_own": is_own,
            "school": clean(entry.school),
            "degree_line": clean(degree_line),
            "dates": dates,
            "show_dot": bool(degree_line and dates),
        })

@@SAMPLES@@
    posts_href = "/profile/" + path_segment(person.username) + "/posts"
    data.profile = {
        "found": True,
        "not_found": False,
        "is_own": is_own,
        "is_other": not is_own,
        "crumb_name": clean(name),
        "full_name": clean(name),
        "username": clean(person.username),
        "at_username": "@" + clean(person.username),
        "initial": clean(name[:1]),
        "user_image": image,
        "no_image": not image,
        "has_job": bool(person.job_title),
        "job_line": clean(person.job_title) + (" at " + clean(person.company) if person.company else ""),
        "headline": clean(person.headline),
        "show_headline": is_own or bool(person.headline),
        "show_headline_hint": is_own and not person.headline,
        "bio": clean(person.bio),
        "bio_long": len(person.bio or "") > 220,
        "show_bio_hint": is_own and not person.bio,
        "posts_empty_own": is_own and not posts,
        "posts_empty_other": (not is_own) and not posts,
        "posts_more": is_own or len(posts) == 3,
        "posts_more_own": is_own,
        "posts_more_other": (not is_own) and len(posts) == 3,
        "posts_href": clean(posts_href),
        "work_empty_own": is_own and not work,
        "work_empty_other": (not is_own) and not work,
        "work_more": len(work) > 3,
        "education_empty_own": is_own and not education,
        "education_empty_other": (not is_own) and not education,
        "education_more": len(education) > 3,
    }
    data.posts = posts
    data.work = work
    data.education = education
"""

PROFILE_DATA_SCRIPT = (
	HELPERS
	+ DATE_RANGE
	+ PROFILE_MAIN.replace("@@POST_ROWS@@\n", indent(POST_ROWS, 4)).replace(
		"@@SAMPLES@@\n", indent(SAMPLE_POST + SAMPLE_WORK_AND_EDUCATION, 4)
	)
)

PROFILE_REDIRECT_SCRIPT = """\
if frappe.session.user == "Guest":
    redirect("/login?redirect=/profile")

me = frappe.call("cafe.api.get_profile")
redirect("/profile/" + me.username)
"""
