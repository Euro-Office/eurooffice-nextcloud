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
 * Fields are indexed "ContentControls.ByIndex.N", the form richdocuments uses,
 * but numbered our own way: the outermost controls of the main document first,
 * then those of the headers and footers. extract() and fill() walk the parts in
 * the same order. richdocuments numbers differently, so the listeners do
 * nothing when it is enabled.
 *
 * Only text and checkbox controls are reported, the types Nextcloud's dialog shows.
 */
class TemplateFields {

    public const MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private const NS_W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
    private const INDEX_PREFIX = "ContentControls.ByIndex.";

    /** Guards against a highly compressed part; real document parts are far smaller. */
    private const MAX_PART_SIZE = 20 * 1024 * 1024;

    /**
     * Anything in a control's content besides paragraphs and runs of text, line
     * breaks, tabs, formatting and bookmarks. A control holding such content
     * (a table, picture, field, note, comment, tracked change, nested control
     * and so on) is left alone: rewriting it as text would lose it.
     */
    private const UNSUPPORTED_CONTENT = ".//*[not(ancestor-or-self::w:pPr or ancestor-or-self::w:rPr)]"
        . "[not(self::w:p or self::w:r or self::w:t or self::w:br or self::w:tab"
        . " or self::w:bookmarkStart or self::w:bookmarkEnd or self::w:proofErr or self::w:lastRenderedPageBreak)]";

    /**
     * List the fillable content controls of a .docx file.
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
     * @param array $values as Nextcloud's dialog sends them: ["ContentControls.ByIndex.0" => ["content" => "…"]]
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
     * Visit every content control in document order. When $write is set, save
     * the changes and return the new file; a part that cannot be read is then
     * an error, while listing fields just skips it.
     */
    private static function walk(string $docx, bool $write, callable $visit): string {
        $path = tempnam(sys_get_temp_dir(), "eotf");
        if ($path === false) {
            throw new \RuntimeException("Could not create a temporary file");
        }

        $zip = null;
        $libxmlErrors = libxml_use_internal_errors(true);
        try {
            if (file_put_contents($path, $docx) === false) {
                throw new \RuntimeException("Could not write a temporary file");
            }
            $archive = new ZipArchive();
            if ($archive->open($path) !== true) {
                throw new \RuntimeException("Not a valid .docx file");
            }
            $zip = $archive;

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
                if ($xml === "") {
                    continue;
                }
                $dom = new DOMDocument();
                $dom->preserveWhiteSpace = true;
                if ($xml === false || !$dom->loadXML($xml, LIBXML_NONET)) {
                    if ($write) {
                        throw new \RuntimeException("Could not read template part " . $part);
                    }
                    continue;
                }
                $xpath = self::xpath($dom);

                foreach ($xpath->query("//w:sdt[not(ancestor::w:sdt)]") as $sdt) {
                    $visit($sdt, $xpath, self::INDEX_PREFIX . $counter);
                    $counter++;
                }

                if ($write && !$zip->addFromString($part, $dom->saveXML())) {
                    throw new \RuntimeException("Could not write template part " . $part);
                }
            }

            $written = $zip->close();
            $zip = null;
            if (!$written) {
                throw new \RuntimeException("Could not write the .docx file");
            }

            return file_get_contents($path);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($libxmlErrors);
            // Drop pending changes, so the archive does not rewrite the file when it is freed
            $zip?->unchangeAll();
            @unlink($path);
        }
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
     * "rich-text" or "checkbox", or null for a control we leave alone: other
     * control types, unsupported content, or a value bound to a Custom XML
     * part (w:dataBinding), which Word would restore from that part.
     */
    private static function type(DOMElement $sdt, DOMXPath $xpath): ?string {
        $content = $xpath->query("w:sdtContent", $sdt)->item(0);
        if ($content !== null && $xpath->query(self::UNSUPPORTED_CONTENT, $content)->length > 0) {
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
     * w14:checked is an on/off value: "1", "true", "on" and a missing val all mean checked.
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

    /**
     * The val attribute of an element under w:sdtPr, or null when it is missing or empty.
     */
    private static function property(DOMElement $sdt, DOMXPath $xpath, string $path): ?string {
        $node = $xpath->query("w:sdtPr/" . $path, $sdt)->item(0);
        if (!$node instanceof DOMElement) {
            return null;
        }
        $value = $node->getAttributeNS(str_contains($path, "w14:") ? self::NS_W14 : self::NS_W, "val");

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
            // Run content only: a w:tab under w:pPr/w:tabs is a tab stop
            foreach ($xpath->query(".//w:r/w:t | .//w:r/w:br | .//w:r/w:tab", $block) as $node) {
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
     * Keep the typed text valid in XML 1.0: a vertical tab (a pasted manual line
     * break) becomes a line break, and characters XML does not allow are dropped.
     */
    private static function xmlSafe(string $value): string {
        $value = mb_scrub(str_replace("\x0B", "\n", $value), "UTF-8");

        return preg_replace("/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u", "", $value) ?? "";
    }

    /**
     * Replace the control's text and clear its placeholder state.
     *
     * The new text takes the first run's formatting, minus the placeholder style.
     * In a block control each line is a paragraph with the first paragraph's
     * properties; in an inline control lines are joined with line breaks.
     * Bookmarks inside the control are kept around the new text.
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

        $lines = preg_split("/\r\n|\r|\n/", self::xmlSafe($value));
        $run = static function (array $lines) use ($dom, $runPr): DOMElement {
            $run = $dom->createElementNS(self::NS_W, "w:r");
            if ($runPr instanceof DOMElement) {
                $run->appendChild($runPr->cloneNode(true));
            }
            foreach ($lines as $i => $line) {
                if ($i > 0) {
                    $run->appendChild($dom->createElementNS(self::NS_W, "w:br"));
                }
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
            $anchor = $first->firstChild instanceof DOMElement && $first->firstChild->localName === "pPr" ? $first->firstChild->nextSibling : $first->firstChild;
            foreach ($bookmarkStarts as $node) {
                $first->insertBefore($node, $anchor);
            }
            foreach ($bookmarkEnds as $node) {
                $paragraphs[count($paragraphs) - 1]->appendChild($node);
            }
        } else {
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
        $dom = $sdt->ownerDocument;
        $checkbox = $xpath->query("w:sdtPr/w14:checkbox", $sdt)->item(0);
        if ($checkbox instanceof DOMElement) {
            $state = $xpath->query("w14:checked", $checkbox)->item(0);
            if (!$state instanceof DOMElement) {
                $state = $checkbox->insertBefore($dom->createElementNS(self::NS_W14, "w14:checked"), $checkbox->firstChild);
            }
            $state->setAttributeNS(self::NS_W14, "w14:val", $checked ? "1" : "0");
        }

        $symbol = $xpath->query("w:sdtPr/w14:checkbox/" . ($checked ? "w14:checkedState" : "w14:uncheckedState"), $sdt)->item(0);
        $code = $symbol instanceof DOMElement ? $symbol->getAttributeNS(self::NS_W14, "val") : "";
        $char = $code !== "" ? mb_chr((int)hexdec($code), "UTF-8") : ($checked ? "\u{2612}" : "\u{2610}");

        $t = $xpath->query("w:sdtContent//w:t", $sdt)->item(0);
        if (!$t instanceof DOMElement) {
            $content = $xpath->query("w:sdtContent", $sdt)->item(0) ?? $sdt->appendChild($dom->createElementNS(self::NS_W, "w:sdtContent"));
            $holder = $xpath->query("w:p", $content)->item(0) ?? $content;
            $t = $holder->appendChild($dom->createElementNS(self::NS_W, "w:r"))->appendChild($dom->createElementNS(self::NS_W, "w:t"));
        }
        $t->textContent = $char;
    }
}
