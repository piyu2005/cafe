"""The Search page: people and publications, each filtered as you type."""

from blocks import INK, MUTED, OUTLINE, SOLID_BG, SURFACE_2, bind, block, html_el, raw_block, svg
from layout import crumb_current, crumb_link, crumb_separator, page_layout
from posts_page import TAB_STYLES

TABS = [("writers", "Writers"), ("publications", "Publications")]
TITLE_STYLES = {
	"margin": "0",
	"fontFamily": "Newsreader",
	"fontSize": "32px",
	"fontWeight": "400",
	"lineHeight": "1.6",
	"letterSpacing": "0.015em",
	"color": "#000000",
}
ROW_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"gap": "12px",
	"height": "44px",
	"padding": "6px 8px",
	"borderRadius": "8px",
}


def build_person_row():
	"""The template row of the list. Builder repeats it once per person in
	`data.people`, on the server, so the first paint already has the names. The
	look duplicates .cafe-person in styles.css, which styles the rows that
	search.js creates while typing."""
	avatar_image = block(
		"img",
		"Avatar image",
		attrs={"src": "", "alt": ""},
		styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
	)
	avatar_image["dynamicValues"] = [bind("user_image", "src", "attribute")]
	avatar_image["visibilityCondition"] = {"key": "user_image", "comesFrom": "dataScript"}
	# Both avatar children share one grid cell. On the page only one of them is
	# rendered; the editor canvas ignores the conditions and shows both.
	avatar_initial = block(
		"span", "Avatar initial", classes=["initial"], text="P", styles={"gridArea": "1 / 1"}
	)
	avatar_initial["dynamicValues"] = [bind("initial", "innerHTML", "key")]
	avatar_initial["visibilityCondition"] = {"key": "no_image", "comesFrom": "dataScript"}
	avatar = block(
		"span",
		"Avatar",
		["cafe-avatar"],
		children=[avatar_image, avatar_initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "32px",
			"height": "32px",
			"overflow": "hidden",
			"borderRadius": "9999px",
			"backgroundColor": SURFACE_2,
			"color": MUTED,
			"fontSize": "16px",
			"fontWeight": "500",
			"letterSpacing": "0.02em",
			"textTransform": "uppercase",
		},
	)
	name = block(
		"span",
		"Name",
		["cafe-person-name"],
		text="Priyanshi Hodage",
		styles={
			"overflow": "hidden",
			"fontSize": "16px",
			"letterSpacing": "0.02em",
			"color": "#000000",
			"textOverflow": "ellipsis",
			"whiteSpace": "nowrap",
		},
	)
	name["dynamicValues"] = [bind("full_name", "innerHTML", "key")]
	row = block(
		"a",
		"Person",
		["cafe-person"],
		attrs={"href": "/profile"},
		children=[avatar, name],
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "12px",
			"height": "44px",
			"padding": "6px 8px",
			"borderRadius": "8px",
		},
	)
	row["dynamicValues"] = [bind("href", "href", "attribute")]
	return row


def build_publication_row():
	"""Same row shape as a writer's, with a brand mark instead of an avatar - a
	rounded square, not a circle, same distinction the app's own logo and
	profile avatars already draw between an org and a person."""
	tile = block(
		"span",
		"Tile",
		["cafe-pub-tile"],
		text="F",
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "32px",
			"height": "32px",
			"borderRadius": "8px",
			"backgroundColor": SOLID_BG,
			"color": "#ffffff",
			"fontSize": "14px",
			"fontWeight": "600",
			"letterSpacing": "0.02em",
			"textTransform": "uppercase",
		},
	)
	tile["dynamicValues"] = [bind("initial", "innerHTML", "key")]
	title = block(
		"span",
		"Title",
		["cafe-person-name"],
		text="Frappe Thoughts",
		styles={
			"overflow": "hidden",
			"fontSize": "16px",
			"letterSpacing": "0.02em",
			"color": "#000000",
			"textOverflow": "ellipsis",
			"whiteSpace": "nowrap",
		},
	)
	title["dynamicValues"] = [bind("title", "innerHTML", "key")]
	left = block(
		"span",
		"Left",
		styles={"display": "flex", "alignItems": "center", "gap": "12px", "minWidth": "0"},
		children=[tile, title],
	)
	row = block(
		"a",
		"Publication",
		["cafe-person"],
		attrs={"href": "/publications/frappe-thoughts"},
		children=[left],
		styles=ROW_STYLES,
	)
	row["dynamicValues"] = [bind("href", "href", "attribute")]
	return row


def build_search_box(input_id, aria_label):
	return raw_block(
		"Search box",
		svg("search", 16, MUTED).replace(
			'style="', 'style="position:absolute;top:6px;left:8px;pointer-events:none;', 1
		)
		+ html_el(
			"input",
			None,
			{
				"id": input_id,
				"type": "text",
				"placeholder": "Search",
				"aria-label": aria_label,
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
		styles={"position": "relative", "display": "block", "marginTop": "8px"},
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
				"aria-selected": "true" if key == "writers" else "false",
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
	return raw_block("Tabs", tablist, styles={"marginTop": "16px"})


def build_writers_panel():
	people = block(
		"div",
		"People",
		["cafe-people"],
		attrs={"id": "cafe-people", "aria-live": "polite"},
		styles={"display": "flex", "flexDirection": "column", "gap": "4px", "marginTop": "16px"},
		children=[build_person_row()],
	)
	people["isRepeaterBlock"] = True
	people["dataKey"] = bind("people", "innerHTML", "key")
	return block(
		"div",
		"Writers panel",
		attrs={"id": "cafe-panel-writers", "role": "tabpanel"},
		children=[people],
	)


def build_publications_panel():
	publications = block(
		"div",
		"Publications",
		["cafe-people"],
		attrs={"id": "cafe-publications", "aria-live": "polite"},
		styles={"display": "flex", "flexDirection": "column", "gap": "4px", "marginTop": "16px"},
		children=[build_publication_row()],
	)
	publications["isRepeaterBlock"] = True
	publications["dataKey"] = bind("publications", "innerHTML", "key")
	return block(
		"div",
		"Publications panel",
		attrs={"id": "cafe-panel-publications", "role": "tabpanel", "hidden": "hidden"},
		children=[publications],
	)


def build_search(shell_id, shell_block):
	title = block(
		"h1",
		"Title",
		["cafe-title"],
		attrs={"id": "cafe-search-title"},
		text="Writers at Cafe",
		styles=TITLE_STYLES,
	)
	crumbs = [crumb_link("Cafe", "/"), crumb_separator(), crumb_current("Explore")]
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[
			title,
			build_search_box("cafe-search-input", "Search writers"),
			build_tabs(),
			build_writers_panel(),
			build_publications_panel(),
		],
		"640px",
	)


# Runs on the server for every visit. Builder puts what it returns into the
# page as raw HTML (its template engine does not escape), and a name is chosen
# by the user, so every value that reaches the HTML is escaped here.
SEARCH_DATA_SCRIPT = """\
if frappe.session.user == "Guest":
    redirect("/login?redirect=/search")

people = frappe.call("cafe.api.list_people")
for person in people:
    identifier = person.get("username") or person.get("name")
    label = person.get("full_name") or identifier
    segment = identifier
    for char, code in (("%", "%25"), ("/", "%2F"), ("?", "%3F"), ("#", "%23"), ("\\\\", "%5C"), (" ", "%20")):
        segment = segment.replace(char, code)
    person["href"] = frappe.utils.escape_html("/profile/" + segment)
    person["full_name"] = frappe.utils.escape_html(label)
    person["initial"] = frappe.utils.escape_html(label.strip()[:1])
    image = person.get("user_image") or ""
    person["user_image"] = frappe.utils.escape_html(image) if image.startswith(("/", "https://", "http://")) else ""
    person["no_image"] = not person["user_image"]
data.people = people

publications = frappe.call("cafe.api.list_publications")
for pub in publications:
    segment = pub.get("handle") or ""
    for char, code in (("%", "%25"), ("/", "%2F"), ("?", "%3F"), ("#", "%23"), ("\\\\", "%5C"), (" ", "%20")):
        segment = segment.replace(char, code)
    title = pub.get("title") or pub.get("handle") or ""
    pub["href"] = frappe.utils.escape_html("/publications/" + segment)
    pub["title"] = frappe.utils.escape_html(title)
    pub["initial"] = frappe.utils.escape_html(title.strip()[:1] or "?")
data.publications = publications
"""
