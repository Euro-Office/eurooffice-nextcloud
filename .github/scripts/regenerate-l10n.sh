#!/usr/bin/env bash
# Regenerates translationfiles/ (pot and po files) and l10n/ (runtime
# catalogs) from the sources and the translations.
#
# Run it from the repository root. The l10n workflow runs it on ubuntu-24.04
# with gettext 0.21; another gettext version can format the files differently.
# Needs php, curl and gettext.
set -euo pipefail

TOOL_URL=https://raw.githubusercontent.com/nextcloud/docker-ci/5ed96fa6f9535415f9da1e672f38d7f7c659b2ee/translations/translationtool/translationtool.phar
TOOL_SHA256=667ca0a3d7ca8858f66f72007792d5bbab867dba6b1bb458d95ec7a74f17385f

root=$(pwd -P)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Pinned so an upstream change cannot silently change the generated files
tool=${TRANSLATIONTOOL:-${XDG_CACHE_HOME:-$HOME/.cache}/translationtool-$TOOL_SHA256.phar}
if [ ! -f "$tool" ]; then
	mkdir -p "$(dirname "$tool")"
	curl -sSfLo "$tool.part" "$TOOL_URL"
	mv "$tool.part" "$tool"
fi
cp "$tool" "$work/translationtool.phar"
tool=$work/translationtool.phar
if [ "$(php -r 'echo hash_file("sha256", $argv[1]);' "$tool")" != "$TOOL_SHA256" ]; then
	echo "translationtool.phar does not match the pinned checksum" >&2
	exit 1
fi

# translationtool ignores the exit status of xgettext, so a failing source file
# would silently leave its strings out of the pot
mkdir "$work/bin"
cat > "$work/bin/xgettext" <<'EOF'
#!/bin/sh
"$L10N_XGETTEXT" "$@" || { echo "$*" >> "$L10N_FAILED"; exit 1; }
EOF
chmod +x "$work/bin/xgettext"
L10N_XGETTEXT=$(command -v xgettext) L10N_FAILED=$work/failed PATH="$work/bin:$PATH" \
	php "$tool" create-pot-files
if [ -s "$work/failed" ]; then
	echo "xgettext failed, the pot file is incomplete:" >&2
	cat "$work/failed" >&2
	exit 1
fi

# The output must not depend on the time, the checkout path or the order the
# strings appear in, or CI and a developer's machine never agree:
# - xgettext stamps the current time into POT-Creation-Date, and msgmerge
#   copies it into every po
# - source references are absolute paths, and xgettext wraps them by length
#   before the path is stripped
# - translationtool derives .vue hints from the fake file it builds and
#   truncates the path by a fixed offset, leaving a fragment that varies with
#   the checkout path (real TRANSLATORS comments do not end in a .vue line
#   number, so they survive)
# References keep the file but drop the line number (one per line), and the
# messages are sorted, so a change that only moves a string does not touch
# translationfiles/.
# gettext 0.21 on ubuntu-24.04 has no --add-location=file, hence awk.
normalise() {
	for f in "$@"; do
		sed -E -e '/^"POT-Creation-Date: /d' -e '/^#\. TRANSLATORS .*\.vue:[0-9]+$/d' "$f" |
			ROOT="$root/" awk '
				/^#: / {
					while ((p = index($0, ENVIRON["ROOT"])) > 0)
						$0 = substr($0, 1, p - 1) substr($0, p + length(ENVIRON["ROOT"]))
					for (i = 2; i <= NF; i++) { sub(/:[0-9]+$/, "", $i); if (!seen[$i]++) refs[++n] = $i }
					next
				}
				{ for (i = 1; i <= n; i++) print "#: " refs[i]; n = 0; split("", seen); print }
				END { for (i = 1; i <= n; i++) print "#: " refs[i] }
			' > "$f.tmp"
		mv "$f.tmp" "$f"
	done
}
pot=$(echo translationfiles/templates/*.pot)
normalise "$pot"
msgcat --sort-output -o "$pot.tmp" "$pot"
mv "$pot.tmp" "$pot"

# translationtool only writes the pot; msgmerge makes the po files learn about
# new source strings so Weblate can show them
for po in translationfiles/*/*.po; do
	msgmerge --quiet --update --backup=none --no-fuzzy-matching "$po" "$pot"
done
normalise translationfiles/*/*.po

# Convert into an empty directory, so a locale without translations loses its
# old catalog instead of keeping it, and leave out fuzzy ("Needs editing")
# entries, which translationtool would publish
convert=$work/convert
mkdir -p "$convert/app/appinfo" "$convert/app/l10n"
cp appinfo/info.xml "$convert/app/appinfo/"
for po in translationfiles/*/*.po; do
	mkdir -p "$convert/$(dirname "$po")"
	msgattrib --no-fuzzy -o "$convert/$po" "$po"
done
(cd "$convert" && php "$tool" convert-po-files)
for dir in translationfiles/*/; do
	lang=$(basename "$dir")
	[ "$lang" != templates ] || continue
	for ext in js json; do
		rm -f "l10n/$lang.$ext"
		[ ! -f "$convert/app/l10n/$lang.$ext" ] || cp "$convert/app/l10n/$lang.$ext" l10n/
	done
done

if grep -rlF "$root/" translationfiles l10n; then
	echo "the files above still contain the checkout path" >&2
	exit 1
fi
