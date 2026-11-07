<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice;

use DOMDocument;
use DOMElement;
use DOMXPath;
use ZipArchive;

/**
 * Reads and fills the content controls (w:sdt) of a .docx file.
 *
 * Nextcloud asks for template fields through BeforeGetTemplatesEvent and hands
 * the values back in FileCreatedFromTemplateEvent. The index of a field is
 * "ContentControls.ByIndex.N", the same form richdocuments uses. N counts the
 * controls in the main document first, then in the headers and footers, so
 * extract() and fill() must walk the parts in the same order.
 *
 * Only plain text, rich text and checkbox controls are reported: those are the
 * field types Nextcloud's template dialog can show.
 */
class TemplateFields {

    public const MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private const NS_W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
    private const INDEX_PREFIX = "ContentControls.ByIndex.";

    /**
     * Largest uncompressed XML part that is parsed. A document part of a real
     * template is a few hundred kilobytes; the limit keeps a highly compressed
     * part from exhausting memory when its DOM is built.
     */
    private const MAX_PART_SIZE = 20 * 1024 * 1024;

    /**
     * Content that cannot be rewritten as plain text without loss: tables and
     * their rows and cells, nested controls, hyperlinks, fields, pictures,
     * embedded objects, footnote, endnote and comment anchors, and tracked
     * changes. Controls holding any of these are not reported.
     */
    private const COMPLEX_CONTENT = "w:tr | w:tc | .//w:tbl | .//w:sdt | .//w:hyperlink | .//w:fldSimple | .//w:fldChar"
        . " | .//w:drawing | .//w:pict | .//w:object"
        . " | .//w:footnoteReference | .//w:endnoteReference | .//w:commentReference | .//w:commentRangeStart | .//w:commentRangeEnd"
        . " | .//w:ins | .//w:del | .//w:moveFrom | .//w:moveTo";

    /**
     * List the fillable content controls of a .docx file.
     *
     * @param string $docx the file's content
     *
     * @return array<int, array{index: string, type: string, alias: ?string, tag: ?string, id: ?int, content?: string, checked?: bool}>
     */
    public static function extract(string $docx): array {
        $fields = [];
        self::walk($docx, false, static function (DOMElement $sdt, DOMXPath $xpath, string $index) use (&$fields): void {
            $type = self::type($sdt, $xpath);
            if ($type === null) {
                return;
            }

            $field = [
                "index" => $index,
                "type" => $type,
                "alias" => self::property($sdt, $xpath, "w:alias"),
                "tag" => self::property($sdt, $xpath, "w:tag"),
                "id" => ($id = self::property($sdt, $xpath, "w:id")) !== null ? (int)$id : null,
            ];
            if ($type === "checkbox") {
                $field["checked"] = self::isChecked($sdt, $xpath);
            } else {
                $field["content"] = self::isPlaceholder($sdt, $xpath) ? "" : self::text($sdt, $xpath);
            }
            $fields[] = $field;
        });

        return $fields;
    }

    /**
     * Fill content controls and return the new file content.
     *
     * @param string $docx   the template's content
     * @param array  $values field values keyed by index, as Nextcloud's dialog
     *                       sends them: ["ContentControls.ByIndex.0" => ["content" => "…"]]
     *
     * @return string the filled .docx
     */
    public static function fill(string $docx, array $values): string {
        if (empty($values)) {
            return $docx;
        }

        return self::walk($docx, true, static function (DOMElement $sdt, DOMXPath $xpath, string $index) use ($values): void {
            $value = $values[$index] ?? null;
            if (!is_array($value)) {
                return;
            }

            $type = self::type($sdt, $xpath);
            if ($type === "checkbox" && array_key_exists("checked", $value)) {
                self::setChecked($sdt, $xpath, (bool)$value["checked"]);
            } elseif ($type === "rich-text" && array_key_exists("content", $value)) {
                self::setText($sdt, $xpath, (string)$value["content"]);
            }
        });
    }

    /**
     * Visit every content control in document order and, when $write is set,
     * save the changed parts into a new copy of the file.
     */
    private static function walk(string $docx, bool $write, callable $visit): string {
        $path = tempnam(sys_get_temp_dir(), "eotf");
        if ($path === false) {
            throw new \RuntimeException("Could not create a temporary file");
        }

        $zip = new ZipArchive();
        $opened = false;
        $closed = false;
        // A broken part is skipped below; collect libxml's messages instead of raising warnings
        $libxmlErrors = libxml_use_internal_errors(true);
        // Everything after tempnam() runs inside this try, so the copy is removed on every path,
        // including a write error that an error handler turns into an exception
        try {
            if (file_put_contents($path, $docx) === false) {
                throw new \RuntimeException("Could not write a temporary file");
            }
            if ($zip->open($path) !== true) {
                throw new \RuntimeException("Not a valid .docx file");
            }
            $opened = true;

            $counter = 0;
            foreach (self::parts($zip) as $part) {
                $stat = $zip->statName($part);
                if ($stat === false) {
                    continue;
                }
                if ($stat["size"] > self::MAX_PART_SIZE) {
                    throw new \RuntimeException("Template part " . $part . " is too large");
                }

                $xml = $zip->getFromName($part);
                if ($xml === false) {
                    // The part exists (statName found it) but could not be read: an error when filling
                    if ($write) {
                        throw new \RuntimeException("Could not read template part " . $part);
                    }
                    continue;
                }
                // loadXML() throws on an empty string; an empty part has no controls to visit
                if ($xml === "") {
                    continue;
                }

                $dom = new DOMDocument();
                $dom->preserveWhiteSpace = true;
                if (!$dom->loadXML($xml, LIBXML_NONET)) {
                    // Listing fields can skip a broken part; filling must not hand back a
                    // document whose parts could not all be read
                    if ($write) {
                        throw new \RuntimeException("Template part " . $part . " is not valid XML");
                    }
                    continue;
                }
                $xpath = self::xpath($dom);

                // Outermost controls only: nested controls are not reported
                foreach ($xpath->query("//w:sdt[not(ancestor::w:sdt)]") as $sdt) {
                    $visit($sdt, $xpath, self::INDEX_PREFIX . $counter);
                    $counter++;
                }

                if ($write && !$zip->addFromString($part, $dom->saveXML())) {
                    throw new \RuntimeException("Could not write template part " . $part);
                }
            }

            // The changes are written to the file on close, so it has to happen before reading it back
            $closed = true;
            if (!$zip->close()) {
                throw new \RuntimeException("Could not write the .docx file");
            }
            $result = file_get_contents($path);
            if ($result === false) {
                throw new \RuntimeException("Could not read the .docx file back");
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($libxmlErrors);
            try {
                if ($opened && !$closed) {
                    $zip->close();
                }
            } finally {
                // The copy holds the user's template: remove it on every path, errors included
                @unlink($path);
            }
        }

        return $result;
    }

    /**
     * The document part first, then headers and footers in name order.
     *
     * @return string[]
     */
    private static function parts(ZipArchive $zip): array {
        $extra = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (preg_match("#^word/(header|footer)\d*\.xml$#", $name)) {
                $extra[] = $name;
            }
        }
        natsort($extra);

        return array_merge(["word/document.xml"], array_values($extra));
    }

    private static function xpath(DOMDocument $dom): DOMXPath {
        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace("w", self::NS_W);
        $xpath->registerNamespace("w14", self::NS_W14);

        return $xpath;
    }

    /**
     * Field type as Nextcloud names it, or null for controls it cannot show
     * (date, drop-down, combo box, picture and the like), cannot refill as
     * text without loss (see COMPLEX_CONTENT), or whose value is bound to a
     * Custom XML part: Word would restore it from that part on opening.
     */
    private static function type(DOMElement $sdt, DOMXPath $xpath): ?string {
        $content = $xpath->query("w:sdtContent", $sdt)->item(0);
        if ($content !== null && $xpath->query(self::COMPLEX_CONTENT, $content)->length > 0) {
            return null;
        }

        $pr = $xpath->query("w:sdtPr", $sdt)->item(0);
        if ($pr === null) {
            return "rich-text";
        }
        if ($xpath->query("w:dataBinding", $pr)->length > 0) {
            return null;
        }
        if ($xpath->query("w14:checkbox", $pr)->length > 0) {
            return "checkbox";
        }
        foreach (["w:date", "w:dropDownList", "w:comboBox", "w:picture", "w:docPartObj", "w:docPartList", "w:citation", "w:bibliography", "w:group", "w:equation"] as $other) {
            if ($xpath->query($other, $pr)->length > 0) {
                return null;
            }
        }

        return "rich-text";
    }

    /**
     * The checkbox state. w14:checked is an on/off value: "1", "true" and "on"
     * are true, and so is the element without a val attribute; no element is false.
     */
    private static function isChecked(DOMElement $sdt, DOMXPath $xpath): bool {
        $node = $xpath->query("w:sdtPr/w14:checkbox/w14:checked", $sdt)->item(0);
        if (!$node instanceof DOMElement) {
            return false;
        }
        if (!$node->hasAttributeNS(self::NS_W14, "val")) {
            return true;
        }

        return in_array(strtolower($node->getAttributeNS(self::NS_W14, "val")), ["1", "true", "on"], true);
    }

    private static function property(DOMElement $sdt, DOMXPath $xpath, string $path): ?string {
        $node = $xpath->query("w:sdtPr/" . $path, $sdt)->item(0);
        if (!$node instanceof DOMElement) {
            return null;
        }
        $value = $node->getAttributeNS(str_starts_with($path, "w14:") || str_contains($path, "/w14:") ? self::NS_W14 : self::NS_W, "val");

        return $value === "" ? null : $value;
    }

    private static function isPlaceholder(DOMElement $sdt, DOMXPath $xpath): bool {
        return $xpath->query("w:sdtPr/w:showingPlcHdr", $sdt)->length > 0;
    }

    /**
     * The control's text, with paragraphs and line breaks as "\n".
     */
    private static function text(DOMElement $sdt, DOMXPath $xpath): string {
        $lines = [];
        $paragraphs = $xpath->query("w:sdtContent//w:p", $sdt);
        $blocks = $paragraphs->length > 0 ? iterator_to_array($paragraphs) : [$xpath->query("w:sdtContent", $sdt)->item(0)];
        foreach ($blocks as $block) {
            if ($block === null) {
                continue;
            }
            $line = "";
            foreach ($xpath->query(".//w:t | .//w:br | .//w:tab", $block) as $node) {
                $line .= match ($node->localName) {
                    "t" => $node->textContent,
                    "br" => "\n",
                    "tab" => "\t",
                };
            }
            $lines[] = $line;
        }

        return implode("\n", $lines);
    }

    /**
     * Replace the control's text and drop its placeholder state.
     *
     * The value is plain text, so the new text gets ONE formatting: the first
     * run's, without the placeholder character style. In a block control each
     * line becomes its own paragraph with the first paragraph's properties; in
     * an inline control lines are joined with line breaks. Bookmarks inside the
     * control are kept around the new text.
     */
    private static function setText(DOMElement $sdt, DOMXPath $xpath, string $value): void {
        $content = $xpath->query("w:sdtContent", $sdt)->item(0);
        if (!$content instanceof DOMElement) {
            return;
        }
        $dom = $sdt->ownerDocument;

        foreach ($xpath->query("w:sdtPr/w:showingPlcHdr", $sdt) as $node) {
            $node->parentNode->removeChild($node);
        }

        $bookmarkStarts = iterator_to_array($xpath->query(".//w:bookmarkStart", $content));
        $bookmarkEnds = iterator_to_array($xpath->query(".//w:bookmarkEnd", $content));

        $firstRun = $xpath->query(".//w:r", $content)->item(0);
        $runPr = $firstRun instanceof DOMElement ? $xpath->query("w:rPr", $firstRun)->item(0) : null;
        if ($runPr instanceof DOMElement) {
            $runPr = $runPr->cloneNode(true);
            foreach ($xpath->query("w:rStyle", $runPr) as $style) {
                if (stripos($style->getAttributeNS(self::NS_W, "val"), "placeholder") !== false) {
                    $runPr->removeChild($style);
                }
            }
        }

        $lines = preg_split("/\r\n|\r|\n/", $value);
        $run = static function (array $lines) use ($dom, $runPr): DOMElement {
            $run = $dom->createElementNS(self::NS_W, "w:r");
            if ($runPr instanceof DOMElement) {
                $run->appendChild($runPr->cloneNode(true));
            }
            foreach ($lines as $i => $line) {
                if ($i > 0) {
                    $run->appendChild($dom->createElementNS(self::NS_W, "w:br"));
                }
                // A tab is its own element in WordprocessingML, not a character in w:t
                foreach (explode("\t", $line) as $j => $piece) {
                    if ($j > 0) {
                        $run->appendChild($dom->createElementNS(self::NS_W, "w:tab"));
                    }
                    if ($piece === "") {
                        continue;
                    }
                    $t = $dom->createElementNS(self::NS_W, "w:t");
                    $t->setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
                    $t->appendChild($dom->createTextNode($piece));
                    $run->appendChild($t);
                }
            }

            return $run;
        };

        $firstParagraph = $xpath->query("w:p", $content)->item(0);
        $paraPr = $firstParagraph instanceof DOMElement ? $xpath->query("w:pPr", $firstParagraph)->item(0) : null;
        while ($content->firstChild !== null) {
            $content->removeChild($content->firstChild);
        }

        if ($firstParagraph instanceof DOMElement) {
            // Block control: one paragraph per line, each with the first paragraph's properties
            $paragraphs = [];
            foreach ($lines as $line) {
                $p = $dom->createElementNS(self::NS_W, "w:p");
                if ($paraPr instanceof DOMElement) {
                    $p->appendChild($paraPr->cloneNode(true));
                }
                $p->appendChild($run([$line]));
                $content->appendChild($p);
                $paragraphs[] = $p;
            }
            $first = $paragraphs[0];
            $last = $paragraphs[count($paragraphs) - 1];
            $anchor = $first->firstChild instanceof DOMElement && $first->firstChild->localName === "pPr" ? $first->firstChild->nextSibling : $first->firstChild;
            foreach ($bookmarkStarts as $node) {
                $first->insertBefore($node, $anchor);
            }
            foreach ($bookmarkEnds as $node) {
                $last->appendChild($node);
            }
        } else {
            // Inline control: the content holds runs directly
            foreach ($bookmarkStarts as $node) {
                $content->appendChild($node);
            }
            $content->appendChild($run($lines));
            foreach ($bookmarkEnds as $node) {
                $content->appendChild($node);
            }
        }
    }

    /**
     * Tick or clear a checkbox control: its state and the symbol it shows.
     */
    private static function setChecked(DOMElement $sdt, DOMXPath $xpath, bool $checked): void {
        $checkbox = $xpath->query("w:sdtPr/w14:checkbox", $sdt)->item(0);
        $state = $checkbox instanceof DOMElement ? $xpath->query("w14:checked", $checkbox)->item(0) : null;
        if (!$state instanceof DOMElement && $checkbox instanceof DOMElement) {
            // The element is optional; without it the state could not be saved
            $state = $sdt->ownerDocument->createElementNS(self::NS_W14, "w14:checked");
            $checkbox->insertBefore($state, $checkbox->firstChild);
        }
        if ($state instanceof DOMElement) {
            $state->setAttributeNS(self::NS_W14, "w14:val", $checked ? "1" : "0");
        }

        $stateName = $checked ? "w14:checkedState" : "w14:uncheckedState";
        $symbol = $xpath->query("w:sdtPr/w14:checkbox/" . $stateName, $sdt)->item(0);
        $code = $symbol instanceof DOMElement ? $symbol->getAttributeNS(self::NS_W14, "val") : "";
        $char = $code !== "" ? mb_chr((int)hexdec($code), "UTF-8") : ($checked ? "\u{2612}" : "\u{2610}");

        $t = $xpath->query("w:sdtContent//w:t", $sdt)->item(0);
        if (!$t instanceof DOMElement) {
            // No visible symbol yet: add a run for it, inside the first paragraph of a block control
            $content = $xpath->query("w:sdtContent", $sdt)->item(0);
            if (!$content instanceof DOMElement) {
                $content = $sdt->ownerDocument->createElementNS(self::NS_W, "w:sdtContent");
                $sdt->appendChild($content);
            }
            $holder = $xpath->query("w:p", $content)->item(0) ?? $content;
            $run = $sdt->ownerDocument->createElementNS(self::NS_W, "w:r");
            $t = $sdt->ownerDocument->createElementNS(self::NS_W, "w:t");
            $run->appendChild($t);
            $holder->appendChild($run);
        }
        $t->textContent = $char;
    }
}
