"""Helpers that build Builder blocks. Shared by the shell and every page."""

import html as htmllib
import random
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LUCIDE = REPO / "vendor_src" / "node_modules" / "lucide-static" / "icons"

_ids = random.Random("cafe.builder")


def block_id():
	return "".join(_ids.choices("0123456789abcdefghijklmnopqrstuvwxyz", k=9))


# Publications is built and tested but not launched yet - every page that
# surfaces it (Explore, Settings, the write flow, Home/Post bylines) checks
# this one flag, and generate.py unpublishes the three pages that exist only
# for it (cafe-publication, cafe-publication-members, cafe-invite). Flip it
# back to True, regenerate, and migrate when it's ready to ship - nothing
# else needs to change, the feature itself was never removed.
PUBLICATIONS_ENABLED = False


# Real Espresso semantic tokens (see tokens.py), not raw hex: a value only
# needs to change in one place (styles.css's :root, kept in sync with
# tokens.py) instead of at every one of these call sites.
INK = "var(--ink-gray-8)"
INK_BLACK = "var(--ink-gray-9)"
INK_7 = "var(--ink-gray-7)"
MUTED = "var(--ink-gray-5)"
OUTLINE = "var(--outline-gray-1)"
SURFACE_1 = "var(--surface-gray-1)"
SURFACE_2 = "var(--surface-gray-2)"
# INK's own value doubles as the solid dark button/chip background in a few
# places, but that's a surface role, not a text role - a different token
# with the same colour, same as Espresso's own semantic naming intends.
SOLID_BG = "var(--surface-gray-10)"
DIALOG_SHADOW = "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)"


def block(
	element,
	name=None,
	classes=(),
	attrs=None,
	custom=None,
	text=None,
	children=(),
	html=None,
	styles=None,
	inner_html=None,
):
	"""`styles` are the block's static CSS (camelCase keys, as Builder stores them).
	`text` is plain text, shown by Builder as the block's innerHTML. `html` is
	raw markup (used for svg icons) and is marked as a raw-html block."""
	if text is not None:
		html_content, raw = htmllib.escape(text), False
	elif inner_html is not None:
		html_content, raw = inner_html, False  # markup inside a normal block, so it can still have a binding
	else:
		html_content, raw = html, bool(html)
	return {
		"attributes": attrs or {},
		"baseStyles": styles or {},
		"blockId": block_id(),
		"blockName": name,
		"children": list(children),
		"classes": list(classes),
		"clientScript": {},
		"customAttributes": custom or {},
		"dataKey": None,
		"draggable": False,
		"dynamicValues": [],
		"element": element,
		"elementBeforeConversion": None,
		"extendedFromComponent": None,
		"innerHTML": html_content,
		"isChildOfComponent": None,
		"isRepeaterBlock": False,
		"mobileStyles": {},
		"originalElement": "__raw_html__" if raw else None,
		"props": {},
		"rawStyles": {},
		"referenceBlockId": None,
		"tabletStyles": {},
		"visibilityCondition": None,
	}


def icon(name, size, color=None, styles=None):
	"""A lucide icon as an inline svg. Builder wraps it in a div, and that div
	carries the size, so the svg just fills it. The stroke is 1.5, not lucide's
	2, because that is what frappe-ui draws."""
	source = (LUCIDE / f"{name}.svg").read_text()
	inner = re.search(r"<svg[^>]*>(.*)</svg>", source, re.S).group(1).strip()
	markup = (
		'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" '
		'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
		f'aria-hidden="true" style="display:block">{inner}</svg>'
	)
	box = {"width": f"{size}px", "height": f"{size}px", "flexShrink": "0"}
	if color:
		box["color"] = color
	return block("svg", f"icon/{name}", html=markup, styles={**box, **(styles or {})})


# ---- Plain HTML, for parts made of many small elements ----
#
# Builder renders every block through a template that it compiles again on each
# request, at about 1-2 ms per block. A part with dozens of tiny elements (the
# app shell) is far cheaper as one block that holds ready-made HTML. The styles
# go inline, because the editor canvas shows only what is on the element itself.


def kebab(name):
	return re.sub(r"([A-Z])", lambda m: "-" + m.group(1).lower(), name)


def css(styles):
	return ";".join(f"{kebab(key)}:{value}" for key, value in (styles or {}).items())


VOID_TAGS = {"input", "img", "br", "hr"}


def html_el(tag, classes=(), attrs=None, styles=None, children=(), text=None):
	"""One HTML element as a string. `children` are strings from html_el or svg."""
	parts = []
	if classes:
		parts.append(f'class="{htmllib.escape(" ".join(classes), quote=True)}"')
	for key, value in (attrs or {}).items():
		parts.append(f'{key}="{htmllib.escape(str(value), quote=True)}"')
	if styles:
		parts.append(f'style="{htmllib.escape(css(styles), quote=True)}"')
	if tag in VOID_TAGS:
		return f"<{tag} {' '.join(parts)}>"
	inner = htmllib.escape(text) if text is not None else "".join(children)
	return f"<{tag} {' '.join(parts)}>{inner}</{tag}>"


def raw_block(name, inner_html, classes=(), styles=None):
	"""A block that holds ready-made HTML. Use it for a static cluster of small
	elements; anything with a data binding must stay a normal block. Builder
	puts the HTML inside a div, which carries `styles`."""
	return block("div", name, classes, html=inner_html, styles=styles)


def svg(name, size, color=None):
	"""A lucide icon as an inline svg of a fixed size (stroke 1.5, like frappe-ui)."""
	source = (LUCIDE / f"{name}.svg").read_text()
	inner = re.search(r"<svg[^>]*>(.*)</svg>", source, re.S).group(1).strip()
	style = f"display:block;flex-shrink:0;width:{size}px;height:{size}px" + (
		f";color:{color}" if color else ""
	)
	return (
		f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
		'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
		f'aria-hidden="true" style="{style}">{inner}</svg>'
	)


# The Cafe brand mark: Frappe's black-rounded-square app-icon badge with the
# glyph in white, same as every other Frappe product's logo. Supplied directly
# from the Figma source (not a lucide icon, so it isn't read from LUCIDE like
# icon()/svg() above) - background and glyph are one fixed-colour unit, not a
# tintable icon, so it always renders the same regardless of surrounding text
# colour.
_CAFE_LOGO_INNER = (
	'<rect x="1" width="36" height="36" rx="7.2" fill="#171717"/>'
	'<path d="M27.1788 16.2768L20.7223 9.82031C21.312 10.4101 20.98 11.783 19.9906 13.393C19.3847 14.379 18.5323 15.4538 '
	"17.494 16.4921C16.4557 17.5303 15.3809 18.3828 14.395 18.9887C12.7849 19.9781 11.412 20.31 10.8223 19.7203L17.2788 "
	"26.1768C17.8686 26.7666 19.2415 26.4346 20.8515 25.4452C21.8374 24.8393 22.9122 23.9869 23.9505 22.9486C24.9888 "
	'21.9103 25.8412 20.8355 26.4471 19.8496C27.4365 18.2395 27.7685 16.8666 27.1788 16.2768Z" fill="white"/>'
	'<path fill-rule="evenodd" clip-rule="evenodd" d="M11.459 19.0822C11.4913 19.0977 11.6391 19.1529 12.0364 '
	"19.0674C12.5178 18.9639 13.1656 18.6882 13.9234 18.2225C14.8414 17.6584 15.8617 16.8518 16.8573 15.8563C17.8528 "
	"14.8607 18.6594 13.8404 19.2235 12.9224C19.6892 12.1646 19.9649 11.5168 20.0684 11.0355C20.1538 10.6381 20.0987 "
	"10.4904 20.0832 10.4581C20.0554 10.4448 19.9645 10.4146 19.7501 10.4355C19.4387 10.4659 18.9981 10.5966 18.4466 "
	"10.8635C17.3518 11.3932 16.0018 12.3704 14.6866 13.6856C13.3714 15.0008 12.3942 16.3508 11.8644 17.4457C11.5976 "
	"17.9971 11.4668 18.4377 11.4365 18.7491C11.4156 18.9636 11.4458 19.0545 11.459 19.0822ZM21.6552 12.027C21.4535 "
	"12.6137 21.1429 13.2369 20.7571 13.8649C20.1094 14.9187 19.2111 16.0481 18.1301 17.1291C17.049 18.2101 15.9197 "
	"19.1085 14.8659 19.7561C14.2379 20.142 13.6147 20.4526 13.028 20.6543L17.9091 25.5354C17.9202 25.5415 18.055 "
	"25.6182 18.493 25.524C18.9743 25.4204 19.6221 25.1448 20.3799 24.6791C21.298 24.1149 22.3182 23.3084 23.3138 "
	"22.3128C24.3094 21.3172 25.1159 20.297 25.68 19.379C26.1457 18.6212 26.4214 17.9733 26.5249 17.492C26.6191 "
	"17.054 26.5425 16.9192 26.5363 16.9081L21.6552 12.027ZM21.3583 9.18455L27.8148 15.6411C28.4392 16.2655 28.4386 "
	"17.1548 28.2847 17.8705C28.1223 18.6256 27.7373 19.4692 27.2136 20.3214C26.5659 21.3752 25.6676 22.5046 24.5866 "
	"23.5856C23.5056 24.6666 22.3762 25.565 21.3224 26.2126C20.4702 26.7363 19.6265 27.1213 18.8714 27.2837C18.1558 "
	"27.4376 17.2665 27.4383 16.642 26.8139L10.1855 20.3573C9.6808 19.8526 9.58712 19.168 9.64498 18.5744C9.70363 "
	"17.9729 9.92679 17.3175 10.2441 16.6617C10.8828 15.3419 11.9952 13.8314 13.4138 12.4128C14.8324 10.9942 16.3428 "
	"9.88179 17.6626 9.24317C18.3185 8.92581 18.9739 8.70265 19.5754 8.64401C20.169 8.58615 20.8536 8.67983 21.3583 "
	'9.18455Z" fill="white"/>'
)


def cafe_logo_svg(size):
	"""The Cafe brand mark as a raw svg string, for raw_block/html_el usage."""
	return (
		f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 38 38" fill="none" '
		f'aria-hidden="true" style="display:block;flex-shrink:0">{_CAFE_LOGO_INNER}</svg>'
	)


def cafe_logo(size):
	"""The Cafe brand mark as a Builder block, for use as a normal child (same
	calling convention as icon())."""
	return block(
		"svg",
		"icon/cafe-logo",
		html=cafe_logo_svg(size),
		styles={"width": f"{size}px", "height": f"{size}px", "flexShrink": "0"},
	)


def instance_of(component_id, component_block, name):
	"""A page's reference to a component. Builder rebuilds the children of a
	component from the instance's children, matched by `referenceBlockId`, so
	the instance needs one empty child per child of the component."""

	def mirror(source):
		node = block(None, children=[mirror(child) for child in source.get("children") or []])
		node["isChildOfComponent"] = component_id
		node["referenceBlockId"] = source["blockId"]
		return node

	node = block(None, name=name, children=[mirror(c) for c in component_block.get("children") or []])
	node["extendedFromComponent"] = component_id
	return node


def bind(key, prop, kind):
	"""A binding of a block property to a key of the data script's data. Inside a
	repeater the key is looked up on the current item."""
	return {"comesFrom": "dataScript", "key": key, "property": prop, "type": kind}


# ---- Colours and small helpers shared by the pages ----

GRAY_6 = "var(--ink-gray-6)"
GRAY_7 = "var(--ink-gray-7)"
GRAY_4 = "var(--ink-gray-4)"
BUTTON_BORDER = "var(--outline-gray-2)"
NBSP = "\u00a0"


def text_style(size, weight="420", color=INK, spacing="0.02em", line="1.15", **extra):
	return {
		"fontSize": f"{size}px",
		"fontWeight": weight,
		"color": color,
		"letterSpacing": spacing,
		"lineHeight": line,
		**extra,
	}


def when(node, key):
	"""Render the block only when the data script's `key` is truthy."""
	node["visibilityCondition"] = {"key": key, "comesFrom": "dataScript"}
	return node


def show(node, key, prop="innerHTML"):
	"""Fill a block property from a key of the data script's data."""
	node["dynamicValues"] = [*node["dynamicValues"], bind(key, prop, "key")]
	return node


def attribute(node, key, prop):
	node["dynamicValues"] = [*node["dynamicValues"], bind(key, prop, "attribute")]
	return node


def label(text, name=None, **style):
	return block("span", name, text=text, styles=style or None)
