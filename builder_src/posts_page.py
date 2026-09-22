"""The Profile posts page: /profile/<username>/posts.

Visitors see one list of the person's published posts. On your own profile there
are three tabs. Published is rendered by the server like the visitor's list.
Drafts and Archived are fetched by posts.js when you open the tab, because
they are private and often empty."""

from blocks import (
	INK,
	INK_BLACK,
	MUTED,
	OUTLINE,
	SURFACE_2,
	attribute,
	block,
	html_el,
	raw_block,
	show,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS, POST_ROWS, SAMPLE_POST, indent
from layout import build_mobile_header, crumb_link, page_layout
from post_row import build_post_row, draft_row_template

TABS = [("published", "Published"), ("drafts", "Drafts"), ("archived", "Archived")]
TAB_STYLES = {
	"position": "relative",
	"display": "flex",
	"alignItems": "center",
	"padding": "8px 0",
	"border": "0",
	"backgroundColor": "transparent",
	"color": MUTED,
	"fontSize": "14px",
	"cursor": "pointer",
}


def crumb_group(*parts):
	"""Crumbs that are always the same, as one block. The wrapper lays them out
	the way the breadcrumb bar does."""
	return raw_block(
		"Crumbs",
		"".join(parts),
		styles={"display": "flex", "alignItems": "center", "gap": "4px"},
	)


def crumb_html_link(label, href):
	return html_el("a", None, {"href": href}, None, text=label)


def crumb_html_separator():
	return html_el(
		"span",
		["sep"],
		None,
		{"color": "#999999", "fontSize": "14px", "fontWeight": "420", "letterSpacing": "0.02em"},
		text="/",
	)


def crumb_html_current(label):
	return html_el("span", ["current"], None, {"color": INK_BLACK}, text=label)


def build_crumbs():
	yours = when(
		crumb_group(
			crumb_html_link("Cafe", "/"),
			crumb_html_separator(),
			crumb_html_link("Profile", "/profile"),
			crumb_html_separator(),
			crumb_html_current("Posts"),
		),
		"pp.is_own",
	)
	others_start = when(
		crumb_group(
			crumb_html_link("Cafe", "/"),
			crumb_html_separator(),
			crumb_html_link("Explore", "/"),
			crumb_html_separator(),
		),
		"pp.is_other",
	)
	name = when(
		attribute(show(crumb_link("Name", "/profile"), "pp.crumb_name"), "pp.profile_href", "href"),
		"pp.is_other",
	)
	others_end = when(crumb_group(crumb_html_separator(), crumb_html_current("Posts")), "pp.is_other")
	return [yours, others_start, name, others_end]


def build_title_row():
	back = attribute(
		block(
			"a",
			"Back to profile",
			["cafe-back"],
			attrs={"href": "/profile", "aria-label": "Back to profile", "title": "Back to profile"},
			inner_html=svg("arrow-left", 16),
			styles={
				"display": "grid",
				"placeItems": "center",
				"flexShrink": "0",
				"width": "28px",
				"height": "28px",
				"borderRadius": "8px",
				"backgroundColor": SURFACE_2,
				"color": INK,
			},
		),
		"pp.profile_href",
		"href",
	)
	title = show(
		block(
			"h1",
			"Title",
			["cafe-posts-title"],
			text="My Posts",
			styles={"margin": "0", **text_style(20, "500", INK, "0.01em")},
		),
		"pp.title",
	)
	return block(
		"div",
		"Title row",
		styles={"display": "flex", "alignItems": "center", "gap": "8px"},
		children=[back, title],
	)


def build_tabs():
	buttons = [
		html_el(
			"button",
			["cafe-tab-btn"],
			{
				"type": "button",
				"role": "tab",
				"data-tab": key,
				"aria-selected": "true" if key == "published" else "false",
			},
			TAB_STYLES,
			text=label,
		)
		for key, label in TABS
	]
	tablist = html_el(
		"div",
		["cafe-tablist"],
		{"role": "tablist"},
		{"display": "flex", "gap": "32px", "borderBottom": f"1px solid {OUTLINE}"},
		buttons,
	)
	return when(raw_block("Tabs", tablist, styles={"marginTop": "32px"}), "pp.is_own")


def build_published_panel():
	posts = block(
		"div",
		"Posts list",
		["cafe-posts"],
		styles={"display": "flex", "flexDirection": "column", "marginTop": "16px"},
		children=[build_post_row()],
	)
	posts["isRepeaterBlock"] = True
	posts["dataKey"] = {"comesFrom": "dataScript", "key": "posts", "property": "innerHTML", "type": "key"}

	empty_own = when(
		block(
			"p",
			"Nothing yet",
			children=[
				block("span", text="You haven't published anything yet. "),
				block(
					"a",
					"Write link",
					["cafe-plain-link"],
					text="Write your first blog.",
					attrs={"href": "/write"},
					styles={"fontWeight": "500", "color": INK},
				),
			],
			styles={"margin": "24px 0 0", **text_style(14, "420", MUTED)},
		),
		"pp.published_empty_own",
	)
	empty_other = when(
		block(
			"p",
			"No posts",
			text="No posts yet.",
			styles={"margin": "24px 0 0", **text_style(14, "420", MUTED)},
		),
		"pp.published_empty_other",
	)
	return block(
		"div",
		"Published panel",
		attrs={"id": "cafe-panel-published"},
		children=[posts, empty_own, empty_other],
	)


def build_other_panel():
	"""Drafts and Archived share one panel. posts.js fills it when the tab opens."""
	skeleton = "".join(
		html_el(
			"div",
			["cafe-skeleton"],
			None,
			{"height": "80px", "borderRadius": "10px", "backgroundColor": SURFACE_2},
		)
		for _ in range(3)
	)
	panel = html_el(
		"div",
		None,
		{"id": "cafe-panel-other", "hidden": "hidden"},
		None,
		[
			html_el(
				"div",
				["cafe-loading"],
				{"hidden": "hidden"},
				{"marginTop": "16px", "flexDirection": "column", "gap": "20px"},
				[skeleton],
			),
			html_el(
				"p",
				["cafe-other-empty"],
				{"hidden": "hidden"},
				{"margin": "24px 0 0", **text_style(14, "420", MUTED)},
			),
			html_el(
				"div",
				["cafe-posts", "cafe-other-list"],
				None,
				{"display": "flex", "flexDirection": "column", "marginTop": "16px"},
			),
			draft_row_template(),
		],
	)
	return raw_block("Drafts and archived panel", panel)


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
		"pp.not_found",
	)


def build_posts_page(shell_id, shell_block):
	content = when(
		block(
			"div",
			"Posts page",
			attrs={"id": "cafe-posts-page"},
			custom={"data-tab": "", "data-own": "", "data-user": ""},
			children=[build_title_row(), build_tabs(), build_published_panel(), build_other_panel()],
		),
		"pp.found",
	)
	for key, prop in (("pp.tab", "data-tab"), ("pp.own_flag", "data-own"), ("pp.user_id", "data-user")):
		content = attribute(content, key, prop)
	return page_layout(
		shell_id,
		shell_block,
		build_crumbs(),
		[content, build_not_found()],
		"600px",
		mobile_header=build_mobile_header("Posts", back_href="/profile", back_key="pp.profile_href"),
	)


# ---- Data script ----

POSTS_MAIN = """\
identifier = frappe.form_dict.username or ""
tab_param = frappe.form_dict.tab or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/profile/" + path_segment(identifier) + "/posts")

if not identifier:
    # Builder's editor canvas has no username in the address: show your own posts there.
    user_id = frappe.session.user
else:
    user_id = frappe.db.get_value("User", {"username": identifier}, "name")
    if not user_id and "@" in identifier and frappe.db.exists("User", identifier):
        user_id = identifier
if user_id == "Guest":
    user_id = None

if not user_id:
    data.pp = {"found": False, "not_found": True, "is_other": True, "crumb_name": "Profile", "profile_href": "/profile"}
    data.posts = []
else:
    info = frappe.db.get_value("User", user_id, ["name", "full_name", "username"], as_dict=True)
    username = info.username or info.name.split("@")[0]
    is_own = user_id == frappe.session.user
    tab = tab_param if (is_own and tab_param in ("drafts", "archived")) else "published"
    if identifier and username != identifier:
        redirect("/profile/" + path_segment(username) + "/posts" + ("?tab=" + tab if tab != "published" else ""))

    name = info.full_name or username
    rows = frappe.call("cafe.api.list_profile_posts", user=user_id, limit=0)
@@POST_ROWS@@
@@SAMPLE@@
    data.pp = {
        "found": True,
        "not_found": False,
        "is_own": is_own,
        "is_other": not is_own,
        "own_flag": "1" if is_own else "",
        "user_id": clean(frappe.session.user) if is_own else "",
        "tab": tab,
        "title": "My Posts" if is_own else "Posts from " + clean(name),
        "crumb_name": clean(name),
        "profile_href": clean("/profile/" + path_segment(username)),
        "published_empty_own": is_own and not posts,
        "published_empty_other": (not is_own) and not posts,
    }
    data.posts = posts
"""

POSTS_DATA_SCRIPT = HELPERS + POSTS_MAIN.replace("@@POST_ROWS@@\n", indent(POST_ROWS, 4)).replace(
	"@@SAMPLE@@\n", indent(SAMPLE_POST, 4)
)
