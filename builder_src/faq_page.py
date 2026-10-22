"""The FAQ page: /faq. Plain, static Q&A content - no data script beyond the
page itself, open to everyone (not gated like Settings), reached from the
logo menu next to Settings/Logout.

Each item's answer is built as one raw HTML blob (blocks.py's raw_block/
html_el), not individual native blocks per line or list item - nobody edits
a single bullet point piece by piece in Builder's canvas, so one block per
item is the cheap, appropriate choice here (same reasoning as the Settings
page's own skeleton-loader rows)."""

from blocks import GRAY_6, INK, OUTLINE, block, html_el, raw_block, text_style
from layout import crumb_current, crumb_link, crumb_separator, page_layout

TITLE_STYLES = {
	"margin": "0",
	"fontFamily": "Newsreader",
	"fontSize": "32px",
	"fontWeight": "400",
	"lineHeight": "1.6",
	"letterSpacing": "0.015em",
	"color": "#000000",
}
QUESTION_STYLES = {"margin": "0", **text_style(16, "600", INK, "0.015em")}
ANSWER_STYLES = {"margin": "8px 0 0", **text_style(14, "420", GRAY_6, "0.02em", "1.6")}
LIST_STYLES = {"margin": "8px 0 0", "paddingLeft": "20px", **text_style(14, "420", GRAY_6, "0.02em", "1.6")}
ITEM_STYLES = {"padding": "20px 0"}

# Each item is (question, pieces). A piece is a plain string (one answer
# paragraph) or ("ul" | "ol", [list items]) - in order, matching how the
# answer actually reads: sometimes an intro line, then a list, then
# sometimes a closing line.
FAQ_ITEMS = [
	(
		"How do I earn cafe points?",
		[
			"You earn points in these ways:",
			(
				"ul",
				[
					"+10 for signing up (one time only).",
					# One long string split across lines for readability, not a missing
					# comma - ends in a single trailing comma (same below).
					"+10 for completing your profile (one time only). A complete profile has a "  # nosemgrep: string-concat-in-list
					"bio, introduction, photo, job title, company, at least one work history "
					"entry, and at least one education entry.",
					"+2 when you publish a post (first publish only, not edits).",
					"+1 each time your post or comment is upvoted.",
					"−1 each time your comment is downvoted. Posts can't be downvoted.",  # noqa: RUF001
					"+2 when someone saves your post, and −2 if they unsave it.",  # noqa: RUF001
					"+5 when someone reposts your article, and −5 if they undo the repost.",  # noqa: RUF001
				],
			),
			"You can't earn or lose points by interacting with your own content.",
		],
	),
	(
		"What do points unlock?",
		[
			(
				"ul",
				[
					"100 points: repost someone else's article.",
					"250 points: flag a post.",
					"500 points: downvote a comment. Posts can't be downvoted.",
				],
			),
		],
	),
	(
		"How do I write and publish a post?",
		[
			(
				"ol",
				[
					"Click New Post.",
					"Write your title and story.",
					"Click Publish.",
					"In the Story Preview dialog, check the cover image, excerpt, and tags.",
					"Click Publish again.",
				],
			),
			"To edit a published post later, make your changes and click Update.",
		],
	),
	(
		"How do @mentions work?",
		[
			"Type @ followed by a username, then choose the person from the dropdown. "  # nosemgrep: string-concat-in-list
			"They're notified when the post is published. Editing the post later won't "
			"notify them again.",
		],
	),
	(
		"What's the difference between Save and Repost?",
		[
			"Save is a private bookmark that only you can see. Repost shares the article "  # nosemgrep: string-concat-in-list
			"with your followers and shows it on your profile. The author gets +2 points "
			"for a save and +5 for a repost, and loses them if it's undone.",
		],
	),
	(
		"How is the Explore page ranked?",
		[
			"Users are ranked by total cafe points, highest first. Explore is also the "  # nosemgrep: string-concat-in-list
			"search page, so it works as a leaderboard.",
		],
	),
	(
		"Can I edit a post after publishing?",
		[
			"Yes. Your changes update the post as normal. Editing doesn't notify "  # nosemgrep: string-concat-in-list
			"mentioned people again and doesn't award points again.",
		],
	),
	(
		"Where can I find my published, draft, archived, and saved posts?",
		[
			"All four are on the Manage all posts page, reached from your profile - "  # nosemgrep: string-concat-in-list
			"each has its own tab there.",
		],
	),
]


def build_list(tag, items):
	return html_el(
		tag, None, None, LIST_STYLES, [html_el("li", None, None, None, text=item) for item in items]
	)


def build_item_html(question, pieces, first):
	styles = dict(ITEM_STYLES)
	if not first:
		styles["borderTop"] = f"1px solid {OUTLINE}"
	body = [html_el("p", None, None, QUESTION_STYLES, text=question)]
	for piece in pieces:
		if isinstance(piece, tuple):
			tag, items = piece
			body.append(build_list(tag, items))
		else:
			body.append(html_el("p", None, None, ANSWER_STYLES, text=piece))
	return html_el("div", None, None, styles, body)


def build_faq(shell_id, shell_block):
	title = block("h1", "Title", text="Frequently asked questions", styles=TITLE_STYLES)
	items_html = "".join(
		build_item_html(question, pieces, first=(i == 0)) for i, (question, pieces) in enumerate(FAQ_ITEMS)
	)
	items = raw_block("Items", items_html, styles={"marginTop": "16px"})
	crumbs = [crumb_link("Cafe", "/"), crumb_separator(), crumb_current("FAQ")]
	return page_layout(shell_id, shell_block, crumbs, [title, items], "640px")


# No session/data dependency - open to Guest and logged-in users alike.
FAQ_DATA_SCRIPT = ""
