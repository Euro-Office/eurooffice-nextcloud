#!/usr/bin/env bash
# Runs regenerate-l10n.sh on a small app in a checkout path with special
# characters and checks the cases the l10n workflow relies on.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd -P)/regenerate-l10n.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
app="$tmp/[dev] x/demo"
mkdir -p "$app/appinfo" "$app/lib" "$app/l10n" "$app/translationfiles/de" "$app/translationfiles/nb"
cd "$app"

fail() { echo "FAIL: $*" >&2; exit 1; }

echo '<?xml version="1.0"?><info><id>demo</id><name>Demo</name></info>' > appinfo/info.xml
printf '<?php\n$l->t("Zeta");\n$l->t("Alpha");\n$l->t("Draft");\n' > lib/A.php
cat > translationfiles/de/demo.po <<'EOF'
msgid ""
msgstr ""
"Language: de\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"

msgid "Alpha"
msgstr "Alpha-de"

msgid "Zeta"
msgstr "Zeta-de"

#, fuzzy
msgid "Draft"
msgstr "Entwurf"
EOF
cat > translationfiles/nb/demo.po <<'EOF'
msgid ""
msgstr ""
"Language: nb\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"

msgid "Alpha"
msgstr ""
EOF
echo stale > l10n/nb.js
echo stale > l10n/nb.json
echo kept > l10n/en.js

"$script" > /dev/null || fail "regeneration failed"

grep -qF "$tmp" translationfiles/templates/demo.pot && fail "checkout path left in the pot"
grep -qx '#: lib/A.php' translationfiles/templates/demo.pot || fail "reference not normalised"
[ "$(grep '^msgid "[A-Z]' translationfiles/templates/demo.pot | tr '\n' ' ')" = 'msgid "Alpha" msgid "Demo" msgid "Draft" msgid "Zeta" ' ] ||
	fail "pot not sorted"
grep -q 'Zeta-de' l10n/de.json || fail "translation missing from l10n/de.json"
grep -q 'Entwurf' l10n/de.js l10n/de.json && fail "fuzzy translation published"
grep -q 'Entwurf' translationfiles/de/demo.po || fail "fuzzy translation dropped from the po"
[ ! -e l10n/nb.js ] && [ ! -e l10n/nb.json ] || fail "stale nb catalog kept"
[ -e l10n/en.js ] || fail "catalog without a po removed"

cp -R translationfiles "$tmp/before"
printf '<?php\n$l->t("Alpha");\n\n$l->t("Draft");\n$l->t("Zeta");\n' > lib/A.php
"$script" > /dev/null || fail "regeneration failed after moving strings"
diff -r "$tmp/before" translationfiles || fail "moving strings changed translationfiles/"

# translationtool lists it, xgettext cannot open it (needs a non-root user)
printf '<?php\n$l->t("Hidden");\n' > lib/B.php
chmod 000 lib/B.php
if "$script" > /dev/null 2>&1; then fail "a source file that xgettext cannot read did not fail"; fi

echo "regenerate-l10n.sh: all checks passed"
