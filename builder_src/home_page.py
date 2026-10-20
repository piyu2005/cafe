"""The Home feed: writings from everyone, newest first. Served at "/" while the
page is published (see cafe/routing.py); unpublish it and "/" goes back
to the old app.

The first ten rows are Builder's own repeater: one row block, repeated once
per post in data.posts, with each piece (avatar, name, title, excerpt, date,
minutes, comments, thumbnail) as its own native child block bound to a field
of that post - individually editable/stylable in Builder's canvas, per the
mentor's "individual blocks, not embed" direction. home.js (search results
and infinite scroll, past the first ten) still renders rows from the page's
<template>, filled by [[token]] string substitution - that path is plain
client DOM, not Builder blocks, and is unrelated to how the first page is
built; ROW_TEMPLATE below exists only for it, and is kept in exact visual
sync with the native row (same style constants, same classes, same nesting)
so a row looks identical whichever path drew it."""

from bell import mobile_bell
from blocks import (
	GRAY_6,
	INK,
	INK_7,
	MUTED,
	PUBLICATIONS_ENABLED,
	SOLID_BG,
	SURFACE_2,
	attribute,
	bind,
	block,
	cafe_logo_svg,
	html_el,
	icon,
	raw_block,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS
from layout import crumb_current, page_layout

PAGE_SIZE = 10

ROW_STYLES = {
	"display": "flex",
	"flexDirection": "column",
	"gap": "12px",
	"padding": "36px 0",
	"color": "inherit",
	"textDecoration": "none",
}
AUTHOR_LINE_STYLES = {"display": "flex", "alignItems": "center", "gap": "8px"}
AVATAR_IMAGE_STYLES = {"width": "100%", "height": "100%", "objectFit": "cover"}
NAME_STYLES = text_style(13, "420", INK)
# alignItems "stretch" (not "flex-start") so the thumbnail's cross-size
# always matches the text column's own natural height - otherwise a post
# with a cover image renders taller than one without, since the thumbnail's
# own fixed height would set the row's height instead of just filling it.
BODY_STYLES = {"display": "flex", "alignItems": "stretch", "gap": "16px"}
TEXT_STYLES = {"flex": "1 1 0%", "minWidth": "0"}
TITLE_STYLES = text_style(16, "600", INK, "0.015em")
EXCERPT_STYLES = {"margin": "4px 0 0", **text_style(14, "420", GRAY_6, "0.02em", "1.5")}
META_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"gap": "12px",
	"marginTop": "16px",
	**text_style(12, "420", MUTED),
}
# No explicit height - BODY_STYLES stretches this to the text column's own
# height, with a floor so a very short title+excerpt doesn't crush it down
# to a sliver.
THUMBNAIL_STYLES = {
	"width": "128px",
	"minHeight": "72px",
	"flexShrink": "0",
	"borderRadius": "10px",
	"backgroundColor": SURFACE_2,
	"objectFit": "cover",
}

# The category filter chips under the search box - frappe-ui's "tag" component
# (size lg, style subtle, no prefix): surface-gray-2 fill, 8px radius, 6px/8px
# padding, 4px gap to the suffix icon, ink-gray-7 14px/420/0.02em/1.15 text -
# read straight off the design file's own inspector, not guessed. Only the
# first ("Productivity") carries the close icon; that's the one shown
# selected in the design, the rest are plain.
TAG_CHIP_STYLES = {
	"display": "inline-flex",
	"alignItems": "center",
	"gap": "4px",
	"flexShrink": "0",
	"border": "0",
	"padding": "6px 8px",
	"borderRadius": "8px",
	"backgroundColor": SURFACE_2,
	"cursor": "pointer",
	**text_style(14, "420", INK_7),
}
TAG_LABELS = ["Productivity", "Photography", "Technology", "Mindfulness", "Writing", "Design"]

# What goes between the row's <a> tags. [[name]] marks a value to escape and put
# in; [[!name]] marks a piece of HTML that was built already. Only home.js's
# <template> path uses this now - see the module docstring.
ROW_INNER = "".join(
	[
		html_el(
			"div",
			["cafe-feed-author"],
			None,
			AUTHOR_LINE_STYLES,
			[
				"[[!avatar]]",
				html_el("span", None, None, NAME_STYLES, text="[[name]]"),
			],
		),
		html_el(
			"div",
			None,
			None,
			BODY_STYLES,
			[
				html_el(
					"div",
					None,
					None,
					TEXT_STYLES,
					[
						html_el("div", None, None, TITLE_STYLES, text="[[title]]"),
						html_el("p", ["cafe-clamp-2"], None, EXCERPT_STYLES, text="[[excerpt]]"),
						html_el(
							"div",
							None,
							None,
							META_STYLES,
							[
								html_el("span", text="[[date]]"),
								html_el("span", text="·"),
								html_el("span", text="[[minutes]] min read"),
								html_el("span", text="·"),
								html_el(
									"span", ["cafe-feed-comments"], None, None, text="[[comments]] comments"
								),
								html_el("span", text="·"),
								html_el(
									"span", ["cafe-feed-reposts"], None, None, text="[[reposts]] reposts"
								),
							],
						),
					],
				),
				"[[!thumbnail]]",
			],
		),
	]
)
AVATAR_IMAGE = html_el("img", None, {"src": "[[image]]", "alt": ""}, AVATAR_IMAGE_STYLES)
THUMBNAIL = html_el(
	"img",
	["cafe-feed-thumb"],
	{"src": "[[cover]]", "alt": "", "loading": "lazy", "decoding": "async"},
	THUMBNAIL_STYLES,
)
ROW_TEMPLATE = html_el("a", ["cafe-feed-row"], {"href": "[[href]]"}, ROW_STYLES, "[[!inner]]").replace(
	"[[!inner]]", ROW_INNER
)


def build_feed_row():
	"""The row Builder repeats for each post in data.posts, one native block
	per piece (avatar, name, title, excerpt, date, minutes read, comments,
	thumbnail), each bound to that post's own field - individually editable
	in Builder's canvas, not one embedded HTML blob."""
	avatar_image = block("img", "Avatar image", attrs={"src": "", "alt": ""}, styles=AVATAR_IMAGE_STYLES)
	avatar_image["dynamicValues"] = [bind("image", "src", "attribute")]
	avatar_image["visibilityCondition"] = {"key": "image", "comesFrom": "dataScript"}
	# Both avatar children share the avatar span; only one renders on the page
	# (the other's visibility condition hides it). The editor canvas ignores
	# visibility conditions and shows both, same as the Search page's rows.
	avatar_initial = block("span", "Avatar initial", classes=["initial"], text="P")
	avatar_initial["dynamicValues"] = [bind("initial", "innerHTML", "key")]
	avatar_initial["visibilityCondition"] = {"key": "no_image", "comesFrom": "dataScript"}
	# No styles= here - the shared .cafe-avatar class (styles.css) is the one
	# and only source of the circle's size, same as every other avatar in the
	# app (search results, profile, comments). This page used to carry its own
	# 20px override here, out of sync with that class's 32px, which meant
	# these rows and home.js's client-templated rows (ROW_TEMPLATE below,
	# built from the exact same markup) could show two different avatar sizes
	# on the same feed depending on which one the page's own CSS cascade
	# happened to prefer.
	avatar_image["visibilityCondition"] = {"key": "avatar_img_on", "comesFrom": "dataScript"}
	avatar_initial["visibilityCondition"] = {"key": "avatar_initial_on", "comesFrom": "dataScript"}
	avatar = block("span", "Avatar", ["cafe-avatar"], children=[avatar_image, avatar_initial])
	avatar["visibilityCondition"] = {"key": "is_person", "comesFrom": "dataScript"}

	# A post under a publication shows the publication's own identity here
	# instead of its author's - same rounded-square tile as the Explore and
	# Settings publication rows (cafe-pub-tile), not the circular avatar, so a
	# publication post reads as "from an org" at a glance, same distinction
	# the app draws everywhere else between a publication and a person.
	pub_image = block(
		"img", "Publication tile image", attrs={"src": "", "alt": ""}, styles=AVATAR_IMAGE_STYLES
	)
	pub_image["dynamicValues"] = [bind("image", "src", "attribute")]
	pub_image["visibilityCondition"] = {"key": "pub_img_on", "comesFrom": "dataScript"}
	pub_initial = block("span", "Publication tile initial", classes=["initial"], text="F")
	pub_initial["dynamicValues"] = [bind("initial", "innerHTML", "key")]
	pub_initial["visibilityCondition"] = {"key": "pub_initial_on", "comesFrom": "dataScript"}
	pub_tile = block("span", "Publication tile", ["cafe-pub-tile"], children=[pub_image, pub_initial])
	pub_tile["visibilityCondition"] = {"key": "is_pub", "comesFrom": "dataScript"}

	name = block("span", "Name", text="Priyanshi Hodage", styles=NAME_STYLES)
	name["dynamicValues"] = [bind("name", "innerHTML", "key")]
	author_line = block(
		"div", "Author", ["cafe-feed-author"], children=[avatar, pub_tile, name], styles=AUTHOR_LINE_STYLES
	)

	title = block("div", "Title", text="Post title", styles=TITLE_STYLES)
	title["dynamicValues"] = [bind("title", "innerHTML", "key")]
	excerpt = block("p", "Excerpt", classes=["cafe-clamp-2"], text="Excerpt", styles=EXCERPT_STYLES)
	excerpt["dynamicValues"] = [bind("excerpt", "innerHTML", "key")]
	date = block("span", "Date", text="Jan 1, 2026")
	date["dynamicValues"] = [bind("date", "innerHTML", "key")]
	minutes = block("span", "Minutes", text="1 min read")
	minutes["dynamicValues"] = [bind("minutes_label", "innerHTML", "key")]
	comments = block("span", "Comments", ["cafe-feed-comments"], text="0 comments")
	comments["dynamicValues"] = [bind("comments_label", "innerHTML", "key")]
	reposts = block("span", "Reposts", ["cafe-feed-reposts"], text="0 reposts")
	reposts["dynamicValues"] = [bind("reposts_label", "innerHTML", "key")]
	meta = block(
		"div",
		"Meta",
		children=[
			date,
			block("span", text="·"),
			minutes,
			block("span", text="·"),
			comments,
			block("span", text="·"),
			reposts,
		],
		styles=META_STYLES,
	)
	text_col = block("div", "Text", children=[title, excerpt, meta], styles=TEXT_STYLES)

	thumbnail = block(
		"img",
		"Thumbnail",
		["cafe-feed-thumb"],
		attrs={"alt": "", "loading": "lazy", "decoding": "async"},
		styles=THUMBNAIL_STYLES,
	)
	thumbnail["dynamicValues"] = [bind("cover", "src", "attribute")]
	thumbnail["visibilityCondition"] = {"key": "cover", "comesFrom": "dataScript"}
	body = block("div", "Body", children=[text_col, thumbnail], styles=BODY_STYLES)

	row = block(
		"a",
		"Post",
		["cafe-feed-row"],
		attrs={"href": "/posts"},
		children=[author_line, body],
		styles=ROW_STYLES,
	)
	row["dynamicValues"] = [bind("href", "href", "attribute")]
	return row


def tag_chip(label):
	# The close icon sits in every chip, not just a selected one - home.js
	# toggles each chip's own "active" class independently on click
	# (multi-select: picking one doesn't clear any other), filters the feed
	# by whichever categories end up active, and styles.css shows the icon
	# only on a chip that currently has that class. Nothing here is
	# pre-selected; the reference design just happened to show its one
	# example mid-selection. The label is also this chip's Category doctype
	# name (autoname is field:title) - home.js reads it straight off
	# aria-label to build the filter, no separate id needed.
	close = block("span", "Close", ["cafe-tag-chip-close"], children=[icon("x", 12, INK_7)])
	return block(
		"button",
		label,
		["cafe-tag-chip"],
		attrs={"type": "button", "aria-label": label, "aria-pressed": "false"},
		children=[block("span", "Label", text=label), close],
		styles=TAG_CHIP_STYLES,
	)


def build_tag_chips():
	return block(
		"div",
		"Tag chips",
		["cafe-tag-chips"],
		styles={"display": "flex", "flexWrap": "wrap", "gap": "8px", "marginTop": "16px"},
		children=[tag_chip(label) for label in TAG_LABELS],
	)


def build_mobile_bar():
	"""The phone's top bar. Unlike the other pages' it is not sticky: it scrolls
	away with the page, as on the old Home."""
	brand = raw_block(
		"Brand",
		# 20px/600, frappe-ui's text-xl-semibold - was 17px, a real mismatch
		# against the old Vue page's <span class="text-xl font-semibold">.
		# The mark is a fixed-colour badge (not tinted like an icon), same as
		# everywhere else it appears.
		cafe_logo_svg(28) + html_el("span", None, None, text_style(20, "600", INK, "0", "1.4"), text="Cafe"),
		styles={"display": "flex", "alignItems": "center", "gap": "6px"},
	)
	write = raw_block(
		"Bell and write",
		mobile_bell()
		+ html_el(
			"a",
			["cafe-btn", "cafe-btn-solid"],
			{"href": "/write", "aria-label": "New post"},
			{
				"display": "inline-flex",
				"alignItems": "center",
				"justifyContent": "center",
				"width": "28px",
				"height": "28px",
				"borderRadius": "8px",
				"backgroundColor": SOLID_BG,
				"color": "#ffffff",
			},
			[svg("plus", 16)],
		),
		styles={"display": "flex", "alignItems": "center", "gap": "4px"},
	)
	return block(
		"header",
		"Mobile header",
		["cafe-mobile-header", "cafe-home-bar"],
		styles={
			"display": "none",
			"alignItems": "center",
			"justifyContent": "space-between",
			# 52px is frappe-ui's own PageHeaderMobile default; taller by request,
			# for more breathing room.
			"height": "60px",
			# Without this, the flex column shrinks the header (not the scroll
			# area) to fit the feed's real content height, since flex-shrink
			# distributes by basis size and the header's is small by comparison.
			"flexShrink": "0",
			"padding": "0 16px",
			"borderBottom": "1px solid #ededed",
			"backgroundColor": "#ffffff",
		},
		children=[brand, write],
	)


def build_home(shell_id, shell_block):
	note = when(
		block(
			"p",
			"First post",
			children=[
				block("span", text="You haven't written anything yet. "),
				block(
					"a",
					"Write link",
					["cafe-plain-link"],
					text="Write your first blog.",
					attrs={"href": "/write"},
					styles={"fontWeight": "500", "color": INK},
				),
			],
			styles={"margin": "0 0 24px", **text_style(14, "420", "#7c7c7c")},
		),
		"hp.no_posts",
	)
	title = block(
		"h1",
		"Title",
		["cafe-title"],
		text="Writings from people on Cafe",
		styles={
			"margin": "0",
			"fontFamily": "Newsreader Medium",
			"fontSize": "24px",
			"fontWeight": "500",
			"lineHeight": "1.5",
			"letterSpacing": "0.005em",
			"color": INK,
		},
	)
	search_box = raw_block(
		"Search box",
		svg("search", 16, MUTED).replace(
			'style="', 'style="position:absolute;top:6px;left:8px;pointer-events:none;', 1
		)
		+ html_el(
			"input",
			None,
			{
				"id": "cafe-feed-search",
				"type": "text",
				"placeholder": "Search",
				"aria-label": "Search writings",
				"autocomplete": "off",
			},
			{
				"display": "block",
				"width": "100%",
				"height": "28px",
				"padding": "6px 8px 6px 32px",
				"border": f"1px solid {SURFACE_2}",
				"borderRadius": "8px",
				"outline": "none",
				"backgroundColor": SURFACE_2,
				"color": INK,
				"fontSize": "14px",
				"letterSpacing": "0.02em",
			},
		),
		["cafe-search"],
		styles={"position": "relative", "display": "block", "marginTop": "16px"},
	)
	tag_chips = build_tag_chips()
	feed = block(
		"div",
		"Posts",
		["cafe-feed"],
		attrs={"id": "cafe-feed", "aria-live": "polite"},
		styles={"display": "flex", "flexDirection": "column", "marginTop": "8px"},
		children=[build_feed_row()],
	)
	feed["isRepeaterBlock"] = True
	feed["dataKey"] = bind("posts", "innerHTML", "key")
	empty = when(
		raw_block(
			"Nothing found",
			html_el(
				"p",
				None,
				None,
				{"margin": "0", **text_style(16, "420", GRAY_6, "0.02em", "1.5")},
				text="No writings found.",
			),
			["cafe-feed-empty"],
			styles={"padding": "64px 0", "textAlign": "center"},
		),
		"hp.empty",
	)
	template = raw_block(
		"Row template",
		html_el(
			"template",
			None,
			{"id": "cafe-feed-template", "data-avatar-image": AVATAR_IMAGE, "data-thumbnail": THUMBNAIL},
			None,
			"[[row]]",
		).replace("[[row]]", ROW_TEMPLATE),
		styles={"display": "none"},
	)
	sentinel = block(
		"div", "Sentinel", attrs={"id": "cafe-feed-end"}, custom={"data-more": ""}, styles={"height": "4px"}
	)
	sentinel = attribute(sentinel, "hp.more", "data-more")
	crumbs = [crumb_current("Cafe")]
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[note, title, search_box, tag_chips, feed, empty, sentinel, template],
		"640px",
		mobile_header=build_mobile_bar(),
		container_class="cafe-container-home",
		padding="24px 20px",
	)


# ---- Data script ----
# One field per row piece, so Builder's repeater can bind each of the row's
# native child blocks to its own key - no HTML assembly here any more (that
# only happens client-side now, in home.js, for rows past the first ten).

HOME_MAIN = """\
if frappe.session.user == "Guest":
    redirect("/login")

rows = frappe.get_all(
    "Post",
    filters={"status": "Published"},
    fields=["name", "title", "display_title", "content", "excerpt", "post_type", "attachment", "cover_image", "author", "author_name", "author_image", "publication", "creation"],
    order_by="creation desc",
    limit_page_length=@@PAGE_SIZE@@ + 1,
)
more = len(rows) > @@PAGE_SIZE@@
rows = rows[:@@PAGE_SIZE@@]

counts = {}
repost_counts = {}
if rows:
    for comment in frappe.get_all("Post Comment", filters={"post": ["in", [row.name for row in rows]]}, fields=["post"]):
        counts[comment.post] = counts.get(comment.post, 0) + 1
    for repost in frappe.get_all("Repost", filters={"post": ["in", [row.name for row in rows]]}, fields=["post"]):
        repost_counts[repost.post] = repost_counts.get(repost.post, 0) + 1

# A post under a publication shows the publication's own identity in the feed,
# not its author's - same reasoning as the mentor's "2 separate profiles"
# comment on the publication page: a reader scanning the feed should see
# which publication a post came from, the way Medium's own feed cards do.
# Publications is hidden for now (@@PUBLICATIONS_ENABLED@@) - while it is,
# every row falls through to its author, same as before it existed.
pub_ids = list({row.publication for row in rows if row.get("publication")}) if @@PUBLICATIONS_ENABLED@@ else []
pubs = (
    {p.name: p for p in frappe.get_all("Publication", filters={"name": ["in", pub_ids]}, fields=["name", "title", "logo"])}
    if pub_ids
    else {}
)

posts = []
for row in rows:
    text = plain_text(row.get("content"))
    words = len(text.split())
    minutes = int(words / 200 + 0.5)
    if minutes < 1:
        minutes = 1
    pub = pubs.get(row.get("publication"))
    if pub:
        label = pub.get("title") or row.get("publication")
        identity_image = safe_url(pub.get("logo"))
    else:
        label = row.get("author_name") or row.get("author") or ""
        identity_image = safe_url(row.get("author_image"))
    cover = (
        row.get("cover_image")
        or (row.get("attachment") if row.get("post_type") != "Video" else "")
        or first_image(row.get("content"))
    )
    cover = safe_url(cover)
    href = "/posts/" + path_segment(row.name)
    comments = counts.get(row.name, 0)
    reposts = repost_counts.get(row.name, 0)
    posts.append({
        "href": clean(href),
        "image": identity_image,
        "is_pub": bool(pub),
        "is_person": not pub,
        "avatar_img_on": not pub and bool(identity_image),
        "avatar_initial_on": not pub and not identity_image,
        "pub_img_on": bool(pub) and bool(identity_image),
        "pub_initial_on": bool(pub) and not identity_image,
        "initial": clean(label.strip()[:1]),
        "name": clean(label),
        "title": clean(row.get("display_title") or row.get("title") or (text[:60] + "\\u2026" if len(text) > 60 else text)),
        "excerpt": clean(row.get("excerpt") or (text[:160] + "\\u2026" if len(text) > 160 else text)),
        "date": day_month_year(row.creation),
        "minutes_label": str(minutes) + " min read",
        "comments_label": str(comments) + (" comment" if comments == 1 else " comments"),
        "reposts_label": str(reposts) + (" repost" if reposts == 1 else " reposts"),
        "cover": cover,
    })
data.posts = posts
data.hp = {
    "no_posts": frappe.db.count("Post", {"author": frappe.session.user}) == 0,
    "empty": not posts,
    "more": "1" if more else "",
}
"""


HOME_DATA_SCRIPT = HELPERS + HOME_MAIN.replace("@@PAGE_SIZE@@", str(PAGE_SIZE)).replace(
	"@@PUBLICATIONS_ENABLED@@", str(PUBLICATIONS_ENABLED)
)
