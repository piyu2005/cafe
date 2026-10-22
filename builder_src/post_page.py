"""The Post detail page: /posts/<post_id>.

The post itself (title, author, text, tags, like and save state, counts) is
rendered by the server. Everything you do on it, and the comments, is post.js:
likes, save, share, the menu, the image viewer, and the whole comments section,
which it fetches when the page loads and updates as you type."""

from blocks import (
	GRAY_6,
	INK,
	INK_BLACK,
	MUTED,
	OUTLINE,
	PUBLICATIONS_ENABLED,
	SOLID_BG,
	SURFACE_2,
	attribute,
	bind,
	block,
	html_el,
	raw_block,
	show,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS, indent
from layout import build_mobile_header, crumb_separator, page_layout
from shell_component import MENU_ITEM_STYLES

BUTTON_BORDER = "var(--outline-gray-2)"
ICON_SPAN = {"display": "flex", "flexShrink": "0"}
ERROR_RED = "#b41d1d"
FLAG_AMBER = "#df9310"


def crumb_html(*parts):
	"""Always-the-same crumbs as one block, laid out like the breadcrumb bar."""
	return raw_block(
		"Crumbs", "".join(parts), styles={"display": "flex", "alignItems": "center", "gap": "4px"}
	)


def build_crumbs():
	"""Cafe / <title>."""
	start = crumb_html(html_el("a", None, {"href": "/"}, None, text="Cafe"))
	title = show(
		block("span", "Title", ["current"], text="Post", styles={"color": INK_BLACK}),
		"pp.crumb_title",
	)
	return [start, crumb_separator(), title]


# ---- Header of the post ----


def build_title():
	return show(
		block(
			"h1",
			"Title",
			["cafe-post-title"],
			text="Post title",
			styles={"margin": "0", **text_style(24, "600", INK_BLACK, "0.005em", "1.4")},
		),
		"pp.title",
	)


def build_avatar():
	picture = when(
		attribute(
			block(
				"img",
				"Avatar image",
				attrs={"src": "", "alt": ""},
				styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
			),
			"pp.author_image",
			"src",
		),
		"pp.avatar_img_on",
	)
	initial = when(
		show(
			block(
				"span",
				"Initial",
				text="P",
				styles={
					**text_style(20, "500", MUTED, "0.005em", "1.15"),
					"gridArea": "1 / 1",
					"textTransform": "uppercase",
				},
			),
			"pp.author_initial",
		),
		"pp.avatar_initial_on",
	)
	avatar = block(
		"div",
		"Avatar",
		children=[picture, initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "46px",
			"height": "46px",
			"overflow": "hidden",
			"borderRadius": "9999px",
			"backgroundColor": SURFACE_2,
		},
	)
	return when(avatar, "pp.is_person")


def build_pub_tile():
	"""A post under a publication shows its identity here instead - same
	rounded-square mark as the Home feed's cafe-pub-tile, sized to match this
	page's own 46px avatar rather than depending on that shared 32px class."""
	picture = when(
		attribute(
			block(
				"img",
				"Publication tile image",
				attrs={"src": "", "alt": ""},
				styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
			),
			"pp.author_image",
			"src",
		),
		"pp.pub_img_on",
	)
	initial = when(
		show(
			block(
				"span",
				"Publication tile initial",
				text="F",
				styles={
					**text_style(20, "600", "#ffffff", "0.005em", "1.15"),
					"gridArea": "1 / 1",
					"textTransform": "uppercase",
				},
			),
			"pp.author_initial",
		),
		"pp.pub_initial_on",
	)
	tile = block(
		"div",
		"Publication tile",
		children=[picture, initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "46px",
			"height": "46px",
			"overflow": "hidden",
			"borderRadius": "12px",
			"backgroundColor": SOLID_BG,
		},
	)
	return when(tile, "pp.is_pub")


def menu_item(tag, attrs, icon_name, label, custom=None, color=None):
	return block(
		tag,
		label,
		["cafe-menu-item"],
		attrs={**attrs, "role": "menuitem"},
		custom=custom,
		inner_html=svg(icon_name, 16, color or MUTED)
		+ html_el("span", text=label, styles={"color": color} if color else None),
		styles={**MENU_ITEM_STYLES, "color": color} if color else MENU_ITEM_STYLES,
	)


def build_more_menu():
	button = block(
		"button",
		"More",
		["cafe-icon-btn-subtle"],
		attrs={"type": "button", "aria-label": "More", "aria-haspopup": "menu"},
		custom={"data-action": "toggle-menu"},
		inner_html=svg("ellipsis", 16),
		styles={
			"display": "grid",
			"placeItems": "center",
			"width": "28px",
			"height": "28px",
			"padding": "0",
			"border": "0",
			"borderRadius": "8px",
			"backgroundColor": SURFACE_2,
			"color": INK,
			"cursor": "pointer",
		},
	)
	edit = when(
		attribute(menu_item("a", {"href": "/write"}, "pencil", "Edit post"), "pp.edit_href", "href"),
		"pp.can_manage",
	)
	copy = menu_item("button", {"type": "button"}, "link", "Copy link", custom={"data-action": "copy-link"})
	delete = when(
		menu_item(
			"button",
			{"type": "button"},
			"trash-2",
			"Delete",
			custom={"data-action": "delete-post"},
			color=ERROR_RED,
		),
		"pp.can_manage",
	)
	# Only unlocks once the viewer's own cafe points cross points.FLAG_THRESHOLD
	# ("enough history to trust your judgement") and never on your own post -
	# same "unlock new action icons by level" approach as downvote/repost.
	# (post.can_flag itself, computed in cafe/api.py, is the actual gate.)
	flag = when(
		menu_item(
			"button",
			{"type": "button"},
			"flag",
			"Flag post",
			custom={"data-action": "flag-post"},
			color=FLAG_AMBER,
		),
		"pp.can_flag",
	)
	menu = block(
		"div",
		"Menu",
		["cafe-pop"],
		attrs={"role": "menu"},
		styles={
			"display": "none",
			"position": "absolute",
			"top": "32px",
			"right": "0",
			"zIndex": "30",
			"minWidth": "160px",
			"padding": "4px",
			"borderRadius": "8px",
			"backgroundColor": "#ffffff",
			"boxShadow": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)",
		},
		children=[edit, copy, flag, delete],
	)
	return block("div", "More", styles={"position": "relative", "flexShrink": "0"}, children=[button, menu])


def build_author_row():
	name = attribute(
		show(
			block(
				"a",
				"Author name",
				["cafe-author", "cafe-author-head"],
				attrs={"href": "/profile"},
				text="Author",
				styles={**text_style(16, "600", INK_BLACK, "0.015em", "24px"), "display": "block"},
			),
			"pp.author_name",
		),
		"pp.author_href",
		"href",
	)
	meta = show(
		block(
			"div",
			"Date and read time",
			text="Aug 18, 2026 · 2 min read",
			styles={"marginTop": "6px", **text_style(14, "420", MUTED)},
		),
		"pp.meta",
	)
	return block(
		"div",
		"Author row",
		styles={"marginTop": "24px", "display": "flex", "alignItems": "center", "gap": "12px"},
		children=[
			build_avatar(),
			build_pub_tile(),
			block("div", "Author", styles={"flexGrow": "1", "minWidth": "0"}, children=[name, meta]),
			build_more_menu(),
		],
	)


# ---- Body ----


def build_carousel():
	"""The pictures of an Image post. posts.js adds the arrows, count and dots."""
	slide = attribute(
		block(
			"img",
			"Picture",
			["cafe-slide"],
			attrs={"src": "", "alt": ""},
			styles={"width": "100%", "height": "100%", "objectFit": "contain"},
		),
		"src",
		"src",
	)
	slides = block(
		"div",
		"Pictures",
		["cafe-slides"],
		styles={"width": "100%", "height": "100%"},
		children=[slide],
	)
	slides["isRepeaterBlock"] = True
	slides["dataKey"] = bind("images", "innerHTML", "key")
	return when(
		block(
			"div",
			"Carousel",
			["cafe-carousel"],
			styles={
				"position": "relative",
				"marginTop": "24px",
				"width": "100%",
				"height": "420px",
				"overflow": "hidden",
				"borderRadius": "10px",
				"backgroundColor": "#000000",
			},
			children=[slides],
		),
		"pp.is_image_post",
	)


def build_content():
	return show(
		block(
			"div",
			"Content",
			["cafe-prose"],
			attrs={"id": "cafe-content"},
			text="The text of the post.",
			styles={
				"marginTop": "24px",  # matches the action bar's own marginTop below the content
				"minHeight": "300px",
				**text_style(15, "420", "#383838", "0.02em", "1.7"),
			},
		),
		"pp.content_html",
	)


def build_tags():
	tag = show(
		block(
			"span",
			"Tag",
			["cafe-tag"],
			text="tag",
			styles={
				"display": "inline-flex",
				"alignItems": "center",
				"height": "24px",
				"padding": "0 8px",
				"borderRadius": "9999px",
				"backgroundColor": SURFACE_2,
				**text_style(13, "400", GRAY_6, "0.02em", "1.5"),
			},
		),
		"name",
	)
	tags = block(
		"div",
		"Tags",
		styles={"marginTop": "24px", "display": "flex", "flexWrap": "wrap", "gap": "8px"},
		children=[tag],
	)
	tags["isRepeaterBlock"] = True
	tags["dataKey"] = bind("tags", "innerHTML", "key")
	return when(tags, "pp.has_tags")


def action_button(action, icon_name, count_key, count_id, attrs=None):
	count = show(block("span", "Count", attrs={"id": count_id}, text="0"), count_key)
	return block(
		"button",
		action.title(),
		[f"cafe-{action}"],
		attrs={"type": "button", "aria-label": action.title(), **(attrs or {})},
		custom={"data-action": action, "data-on": ""},
		children=[block("span", "Icon", inner_html=svg(icon_name, 16), styles=ICON_SPAN), count],
		# Same bordered-box shape as Save/Repost below, not the old borderless
		# text-link look - a "solid" active fill (styles.css's own
		# [data-on='1'] rules) only reads as a real button once it has a box
		# to fill in the first place.
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "8px",
			"height": "28px",
			"padding": "0 10px",
			"border": f"1px solid {BUTTON_BORDER}",
			"borderRadius": "8px",
			"backgroundColor": "#ffffff",
			"color": GRAY_6,
			"fontSize": "14px",
			"cursor": "pointer",
		},
	)


def build_action_bar():
	like = attribute(
		action_button("like", "heart", "pp.like_count", "cafe-like-count"), "pp.like_flag", "data-on"
	)
	comment = action_button("comment", "message-circle", "pp.comment_count", "cafe-comment-count")
	share = raw_block(
		"Share",
		html_el(
			"button",
			["cafe-outline-btn"],
			{"type": "button", "aria-label": "Share", "data-tooltip": "Share", "data-action": "share"},
			{
				"display": "grid",
				"placeItems": "center",
				"width": "28px",
				"height": "28px",
				"padding": "0",
				"border": f"1px solid {BUTTON_BORDER}",
				"borderRadius": "8px",
				"backgroundColor": "#ffffff",
				"color": INK,
				"cursor": "pointer",
			},
			[svg("send", 16)],
		),
		styles={"display": "flex"},
	)
	save = attribute(
		block(
			"button",
			"Save",
			["cafe-save"],
			attrs={"type": "button", "aria-label": "Save", "data-tooltip": "Save"},
			custom={"data-action": "save", "data-on": ""},
			inner_html=svg("bookmark", 16),
			styles={
				"display": "grid",
				"placeItems": "center",
				"width": "28px",
				"height": "28px",
				"padding": "0",
				"border": f"1px solid {BUTTON_BORDER}",
				"borderRadius": "8px",
				"backgroundColor": "#ffffff",
				"color": INK,
				"cursor": "pointer",
			},
		),
		"pp.saved_flag",
		"data-on",
	)
	# Reposting only unlocks once the viewer's own cafe points cross 100 (see
	# toggle_repost's gate, and points.REPOST_THRESHOLD, the single source of
	# truth for this number - this copy can't import it, see that module's
	# own comment on why) - same "unlock new action icons by level" approach
	# as the comments' downvote icon.
	repost = when(
		attribute(
			block(
				"button",
				"Repost",
				["cafe-repost"],
				attrs={"type": "button", "aria-label": "Repost", "data-tooltip": "Repost"},
				custom={"data-action": "repost", "data-on": ""},
				inner_html=svg("repeat-2", 16),
				styles={
					"display": "grid",
					"placeItems": "center",
					"width": "28px",
					"height": "28px",
					"padding": "0",
					"border": f"1px solid {BUTTON_BORDER}",
					"borderRadius": "8px",
					"backgroundColor": "#ffffff",
					"color": INK,
					"cursor": "pointer",
				},
			),
			"pp.reposted_flag",
			"data-on",
		),
		"pp.can_repost",
	)
	return block(
		"div",
		"Action bar",
		styles={
			"marginTop": "24px",
			"display": "flex",
			"alignItems": "center",
			"justifyContent": "space-between",
			"padding": "12px 0",
			"borderTop": f"1px solid {OUTLINE}",
			"borderBottom": f"1px solid {OUTLINE}",
		},
		children=[
			block(
				"div",
				"Counts",
				styles={"display": "flex", "alignItems": "center", "gap": "24px"},
				children=[like, comment],
			),
			block(
				"div",
				"Buttons",
				styles={"display": "flex", "alignItems": "center", "gap": "4px"},
				children=[share, repost, save],
			),
		],
	)


def build_responses():
	heading = show(
		block(
			"h2",
			"Responses",
			attrs={"id": "cafe-responses"},
			text="Responses (0)",
			styles={"margin": "24px 0 0", **text_style(16, "600", INK_BLACK, "0.015em", "1.15")},
		),
		"pp.responses_label",
	)
	field = html_el(
		"textarea",
		["cafe-textarea"],
		{
			"id": "cafe-comment-text",
			"rows": "3",
			"placeholder": "What are your thoughts?",
			"aria-label": "Write a comment",
		},
		{
			"display": "block",
			"width": "100%",
			"padding": "6px 8px",
			"border": f"1px solid {SURFACE_2}",
			"borderRadius": "8px",
			"outline": "none",
			"backgroundColor": SURFACE_2,
			"color": INK,
			"fontSize": "14px",
			"lineHeight": "1.15",
			"letterSpacing": "0.02em",
			"resize": "vertical",
		},
	)
	button = html_el(
		"button",
		["cafe-btn", "cafe-btn-subtle"],
		{"type": "button", "id": "cafe-comment-send", "data-action": "comment-send"},
		{"marginTop": "8px", "backgroundColor": SURFACE_2, "color": INK},
		text="Comment",
	)
	box = raw_block("Comment box", field + button, styles={"marginTop": "24px"})
	# posts.js fills this. The blocks below are only what shows before it does.
	comments = raw_block(
		"Comments",
		html_el(
			"div",
			["cafe-comment-loading"],
			None,
			{"display": "flex", "flexDirection": "column", "gap": "16px"},
			[
				"".join(
					html_el(
						"div",
						["cafe-skeleton"],
						None,
						{"height": "64px", "borderRadius": "8px", "backgroundColor": SURFACE_2},
					)
					for _ in range(2)
				)
			],
		),
		styles={"marginTop": "24px"},
		classes=["cafe-comments"],
	)
	comments["attributes"] = {"id": "cafe-comments"}
	more = raw_block(
		"More comments",
		html_el(
			"button",
			["cafe-more-comments"],
			{"type": "button", "hidden": "hidden", "data-action": "more-comments"},
			{
				"display": "block",
				"width": "100%",
				"marginTop": "24px",
				"padding": "0",
				"border": "0",
				"backgroundColor": "transparent",
				"color": GRAY_6,
				"fontSize": "14px",
				"textAlign": "center",
				"cursor": "pointer",
			},
			text="Show more comments",
		),
	)
	return [heading, box, comments, more]


def build_unavailable():
	return when(
		raw_block(
			"Unavailable",
			svg("lock", 32, "#c8c8c8")
			+ html_el(
				"p",
				None,
				None,
				{"margin": "0", **text_style(14, "420", MUTED, "0.02em", "1.5")},
				text="This post isn't available. It may be a draft, archived, or removed.",
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
		"pp.unavailable",
	)


def build_post_page(shell_id, shell_block):
	post = when(
		block(
			"div",
			"Post",
			attrs={"id": "cafe-post"},
			custom={
				"data-post": "",
				"data-user": "",
				"data-me-name": "",
				"data-me-image": "",
				"data-me-username": "",
				"data-me-points": "",
			},
			children=[
				build_title(),
				build_author_row(),
				block("div", "Divider", styles={"marginTop": "24px", "borderTop": f"1px solid {OUTLINE}"}),
				build_carousel(),
				build_content(),
				build_tags(),
				build_action_bar(),
				*build_responses(),
			],
		),
		"pp.found",
	)
	for key, prop in (
		("pp.post_id", "data-post"),
		("pp.user_id", "data-user"),
		("pp.me_name", "data-me-name"),
		("pp.me_image", "data-me-image"),
		("pp.me_username", "data-me-username"),
		("pp.me_points", "data-me-points"),
	):
		post = attribute(post, key, prop)
	return page_layout(
		shell_id,
		shell_block,
		build_crumbs(),
		[post, build_unavailable()],
		"600px",
		mobile_header=build_mobile_header("Post", title_key="pp.title", back_href="/"),
		container_class="cafe-container-post",
		padding="48px 24px 32px",
	)


# ---- Data script ----

POST_MAIN = """\
post_id = frappe.form_dict.post_id or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/posts/" + path_segment(post_id))

if not post_id:
    # Builder's editor canvas has no post in the address: show the newest published one there.
    newest = frappe.get_all("Post", filters={"status": "Published"}, order_by="creation desc", limit_page_length=1, pluck="name")
    post_id = newest[0] if newest else ""

post = None
if post_id:
    try:
        post = frappe.call("cafe.api.get_post", post_id=post_id)
    except Exception:
        post = None

if not post:
    data.pp = {"found": False, "unavailable": True, "crumb_title": "Post", "title": "Post"}
    data.images = []
    data.tags = []
else:
    raw = post.content or ""
    if "<" in raw and ">" in raw:
        content_html = frappe.sanitize_html(raw)
    else:
        content_html = "".join(["<p>" + clean(part.strip()).replace("\\n", "<br>") + "</p>" for part in raw.split("\\n\\n") if part.strip()])

    minutes = int(len(plain_text(raw).split()) / 200 + 0.5)
    if minutes < 1:
        minutes = 1

    # A post under a publication shows the publication's own identity here too
    # (same rounded-square tile as the Home feed), not its author's - purely
    # cosmetic, separate from who may actually manage the post (can_manage
    # below), which always checks the real post.author and publication role.
    # Publications is hidden for now (@@PUBLICATIONS_ENABLED@@) - while it is,
    # this always falls through to the author, same as before it existed,
    # regardless of what a pre-existing post's own publication field holds.
    pub = None
    if @@PUBLICATIONS_ENABLED@@ and post.get("publication"):
        pub = frappe.db.get_value("Publication", post.publication, ["title", "logo"], as_dict=True)
    if pub:
        identity_name = pub.get("title") or post.publication
        identity_image = safe_url(pub.get("logo"))
        identity_href = "/publications/" + path_segment(post.publication)
    else:
        identity_name = post.author_name or post.author
        identity_image = safe_url(post.author_image)
        identity_href = "/profile/" + path_segment(post.author_username or post.author)

    # Edit/Delete: the author always has them for their own post; otherwise
    # only an Editor or Admin of the post's publication does - a plain Member
    # can write and edit their own drafts but isn't a gatekeeper for anyone
    # else's.
    pub_role = (
        frappe.db.get_value(
            "Publication Member", {"publication": post.publication, "user": frappe.session.user}, "role"
        )
        if @@PUBLICATIONS_ENABLED@@ and post.publication
        else None
    )
    can_manage = post.author == frappe.session.user or pub_role in ("Editor", "Admin")

    images = []
    for item in post.images or []:
        url = safe_url(item.get("image"))
        if url:
            images.append({"src": url})
    tags = [{"name": clean(tag)} for tag in post.tags or []]
    me = (
        frappe.db.get_value("User", frappe.session.user, ["full_name", "user_image", "username"], as_dict=True)
        or {}
    )

    data.pp = {
        "found": True,
        "unavailable": False,
        "post_id": clean(post.name),
        "user_id": clean(frappe.session.user),
        "me_name": clean(me.get("full_name") or frappe.session.user),
        "me_image": safe_url(me.get("user_image")),
        "me_username": clean(me.get("username") or frappe.session.user.split("@")[0]),
        "me_points": str(post.my_points),
        "title": clean(post.title or "Untitled"),
        "crumb_title": clean(post.title or "Post"),
        "author_name": clean(identity_name),
        "author_initial": clean(identity_name.strip()[:1]),
        "author_image": identity_image,
        "author_href": clean(identity_href),
        "is_pub": bool(pub),
        "is_person": not pub,
        "avatar_img_on": not pub and bool(identity_image),
        "avatar_initial_on": not pub and not identity_image,
        "pub_img_on": bool(pub) and bool(identity_image),
        "pub_initial_on": bool(pub) and not identity_image,
        "meta": day_month_year(post.creation) + " \\u00b7 " + str(minutes) + " min read",
        "can_manage": can_manage,
        "edit_href": clean("/write/" + path_segment(post.name)),
        "content_html": content_html,
        "is_image_post": post.post_type == "Image" and len(images) > 0,
        "has_tags": len(tags) > 0,
        "like_count": post.like_count,
        "like_flag": "1" if post.liked_by_me else "",
        "comment_count": post.comment_count,
        "saved_flag": "1" if post.saved_by_me else "",
        "can_repost": post.my_points >= 100,
        "reposted_flag": "1" if post.reposted_by_me else "",
        "can_flag": post.can_flag,
        "responses_label": "Responses (" + str(post.comment_count) + ")",
    }
    data.images = images
    data.tags = tags
"""

POST_DATA_SCRIPT = HELPERS + POST_MAIN.replace("@@PUBLICATIONS_ENABLED@@", str(PUBLICATIONS_ENABLED))
