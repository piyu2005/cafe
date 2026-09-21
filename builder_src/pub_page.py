"""The publication pages: /publications/<handle>, its members, and /invite.
pub_*.js draw them into #mna-pub, #mna-pub-members and #mna-invite from the
same cafe.api methods the old pages used.

Builder's editor and the folder thumbnail do not run scripts, so each root
starts with a still picture; the script replaces it."""

from blocks import INK, INK_BLACK, SURFACE_2, attribute, block, html_el, raw_block, svg
from data_scripts import HELPERS
from layout import build_mobile_header, crumb_current, crumb_link, crumb_separator, page_layout

PUB_PARTS = ["core", "detail", "members", "invite"]


def bar(width, height="12px", radius="6px"):
	return html_el(
		"div",
		None,
		None,
		{"width": width, "height": height, "borderRadius": radius, "backgroundColor": SURFACE_2},
	)


def detail_picture():
	tile = html_el(
		"div",
		None,
		None,
		{
			"width": "64px",
			"height": "64px",
			"borderRadius": "16px",
			"backgroundColor": INK,
			"flexShrink": "0",
		},
	)
	lines = html_el(
		"div",
		None,
		None,
		{"flex": "1", "display": "flex", "flexDirection": "column", "gap": "10px"},
		[bar("40%", "20px"), bar("25%"), bar("70%")],
	)
	rows = "".join(
		html_el(
			"div",
			None,
			None,
			{"padding": "20px 0", "borderTop": "1px solid #ededed"},
			[bar("60%", "14px"), html_el("div", None, None, {"height": "8px"}), bar("90%")],
		)
		for _ in range(3)
	)
	return html_el(
		"div", None, None, {"display": "flex", "gap": "16px", "alignItems": "center"}, [tile, lines]
	) + html_el("div", None, None, {"marginTop": "24px"}, [rows])


def rows_picture(count=4):
	return "".join(
		html_el(
			"div",
			None,
			None,
			{
				"display": "flex",
				"alignItems": "center",
				"gap": "12px",
				"padding": "10px 12px",
				"borderBottom": "1px solid #ededed",
			},
			[
				html_el(
					"span",
					None,
					None,
					{
						"width": "24px",
						"height": "24px",
						"borderRadius": "9999px",
						"backgroundColor": SURFACE_2,
					},
				),
				bar("40%"),
			],
		)
		for _ in range(count)
	)


def crumb_link_with_id(label, href, crumb_id):
	return block("a", "Crumb", text=label, attrs={"href": href, "id": crumb_id})


def crumb_current_with_id(label, crumb_id):
	return block(
		"span", "Current", ["current"], text=label, attrs={"id": crumb_id}, styles={"color": INK_BLACK}
	)


def root_block(root_id, name, picture):
	root = block(
		"div",
		name,
		["mna-p-root"],
		attrs={"id": root_id},
		custom={"data-handle": ""},
		children=[raw_block("Preview", picture, ["mna-p-preview"])],
	)
	return attribute(root, "w.id", "data-handle")


def new_post_button():
	"""The + of the phone's top bar: a new post, as in the old page."""
	styles = {
		"display": "grid",
		"placeItems": "center",
		"width": "28px",
		"height": "28px",
		"borderRadius": "8px",
		"backgroundColor": INK,
		"color": "#ffffff",
	}
	return html_el(
		"a",
		["mna-btn", "mna-btn-solid"],
		{"href": "/write", "aria-label": "New Post"},
		styles,
		[svg("plus", 16)],
	)


def build_publication(shell_id, shell_block):
	crumbs = [
		crumb_link("Cafe", "/"),
		crumb_separator(),
		crumb_link("Explore", "/"),
		crumb_separator(),
		crumb_current_with_id("Publication", "mna-p-crumb"),
	]
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[root_block("mna-pub", "Publication", detail_picture())],
		"760px",
		mobile_header=build_mobile_header("Publication", back=False, action=new_post_button()),
		container_class="mna-container-pub",
	)


def build_members(shell_id, shell_block):
	crumbs = [
		crumb_link("Cafe", "/"),
		crumb_separator(),
		crumb_link_with_id("Publication", "/", "mna-p-crumb"),
		crumb_separator(),
		crumb_current("Members"),
	]
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[root_block("mna-pub-members", "Members", rows_picture())],
		"640px",
		mobile_header=build_mobile_header("Members", back_href="/"),
		container_class="mna-container-pub",
	)


def build_invite(shell_id, shell_block):
	crumbs = [
		crumb_link("Cafe", "/"),
		crumb_separator(),
		crumb_link_with_id("Publication", "/", "mna-p-crumb-pub"),
		crumb_separator(),
		crumb_current("Invite"),
	]
	title = block(
		"h1",
		"Title",
		["mna-title"],
		attrs={"id": "mna-p-invite-title"},
		text="Invite people",
		styles={
			"margin": "0",
			"fontFamily": "Newsreader",
			"fontSize": "32px",
			"fontWeight": "400",
			"lineHeight": "1.6",
			"letterSpacing": "0.015em",
			"color": "#000000",
		},
	)
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[title, root_block("mna-invite", "Invite", rows_picture())],
		"640px",
		mobile_header=build_mobile_header("Invite", back_href="/", bell=False),
		container_class="mna-container-invite",
	)


def data_script(after=""):
	"""Sends a guest to sign in first; the scripts load everything else."""
	return (
		HELPERS
		+ f"""\
handle = frappe.form_dict.handle or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/publications/" + path_segment(handle){after})

data.w = {{"id": clean(handle)}}
"""
	)


PUBLICATION_DATA_SCRIPT = data_script()
MEMBERS_DATA_SCRIPT = data_script(' + "/members"')
INVITE_DATA_SCRIPT = (
	HELPERS
	+ """\
handle = frappe.form_dict.pub or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/invite%3Fpub%3D" + path_segment(handle))

data.w = {"id": clean(handle)}
"""
)
