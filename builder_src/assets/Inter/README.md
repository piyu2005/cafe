inter-var-subset.woff2 is Builder's own Inter.var.woff2
(apps/builder/builder/public/fonts/Inter/Inter.var.woff2), subset to Latin +
punctuation with fonttools so it still supports every weight/optical-size
value Cafe uses (the wght and opsz axes are untouched), just without the
Cyrillic/Greek/Arabic/CJK glyphs Cafe's English UI never renders. 264KB -> 96KB.

Rebuild after a Builder upgrade changes the source font:

	fonttools subset apps/builder/builder/public/fonts/Inter/Inter.var.woff2 \
	  --output-file=inter-var-subset.woff2 --flavor=woff2 \
	  --unicodes="U+0000-00FF,U+0100-017F,U+0180-024F,U+2000-206F,U+20A0-20CF,U+2122,U+FEFF" \
	  --layout-features="kern,liga,calt,ccmp,mark,mkmk,cv11,cv05,cv06,cv10,ss01,ss02,ss03,ss04,ss06,ss07,ss08" \
	  --no-glyph-names --name-IDs="1,2,4,6,16,17" --name-languages="0" --drop-tables+=STAT

cv11 must stay in --layout-features: it's the single-story "a" Inter's CSS
(reset.css's font-variation-settings) turns on for every page, and dropping
it would silently swap in the wrong glyph shape.
