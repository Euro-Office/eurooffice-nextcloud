<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\TemplateFields;
use PHPUnit\Framework\Attributes\CoversClass;
use Test\TestCase;
use ZipArchive;

/**
 * Covers reading and filling content controls in a .docx built on the fly:
 * an inline text control, a block control over two paragraphs, a checkbox, a
 * date control (not reported) and a text control in the header.
 */
#[CoversClass(TemplateFields::class)]
class TemplateFieldsTest extends TestCase {

    private const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private const W14 = "http://schemas.microsoft.com/office/word/2010/wordml";

    private static function sdtPr(string $alias, string $tag, int $id, string $extra = ""): string {
        return "<w:sdtPr><w:alias w:val=\"{$alias}\"/><w:tag w:val=\"{$tag}\"/><w:id w:val=\"{$id}\"/>{$extra}</w:sdtPr>";
    }

    /**
     * A small .docx with the default controls, or with the given body; an
     * empty string for $footer adds an empty footer part.
     */
    private static function docx(?string $body = null, ?string $footer = null): string {
        $body ??= "<w:p><w:r><w:t>Til: </w:t></w:r>"
            . "<w:sdt>" . self::sdtPr("Modtager", "recipient", 11, "<w:showingPlcHdr/><w:text/>")
            . "<w:sdtContent><w:r><w:rPr><w:rStyle w:val=\"PlaceholderText\"/><w:b/></w:rPr><w:t>Klik for at skrive</w:t></w:r></w:sdtContent></w:sdt></w:p>"
            . "<w:sdt>" . self::sdtPr("Brødtekst", "body", 12)
            . "<w:sdtContent><w:p><w:pPr><w:jc w:val=\"both\"/></w:pPr><w:r><w:t>Første</w:t></w:r></w:p><w:p><w:r><w:t>Anden</w:t></w:r></w:p></w:sdtContent></w:sdt>"
            . "<w:p><w:sdt>" . self::sdtPr("Bekræftet", "confirmed", 13, "<w14:checkbox><w14:checked w14:val=\"0\"/><w14:checkedState w14:val=\"2612\"/><w14:uncheckedState w14:val=\"2610\"/></w14:checkbox>")
            . "<w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt></w:p>"
            . "<w:p><w:sdt>" . self::sdtPr("Dato", "date", 14, "<w:date/>")
            . "<w:sdtContent><w:r><w:t>1. januar</w:t></w:r></w:sdtContent></w:sdt></w:p>";
        $header = "<w:p><w:sdt>" . self::sdtPr("Sagsnr.", "case", 15)
            . "<w:sdtContent><w:r><w:t>00.00</w:t></w:r></w:sdtContent></w:sdt></w:p>";

        $ns = "xmlns:w=\"" . self::W . "\" xmlns:w14=\"" . self::W14 . "\"";
        $path = tempnam(sys_get_temp_dir(), "eotft");
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString("[Content_Types].xml", "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>");
        $zip->addFromString("word/document.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document {$ns}><w:body>{$body}</w:body></w:document>");
        $zip->addFromString("word/header1.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:hdr {$ns}>{$header}</w:hdr>");
        if ($footer !== null) {
            $zip->addFromString("word/footer1.xml", $footer);
        }
        $zip->close();
        $content = file_get_contents($path);
        unlink($path);

        return $content;
    }

    private static function part(string $docx, string $name): string {
        $path = tempnam(sys_get_temp_dir(), "eotft");
        file_put_contents($path, $docx);
        $zip = new ZipArchive();
        $zip->open($path);
        $xml = $zip->getFromName($name);
        $zip->close();
        unlink($path);

        return $xml;
    }

    public function testExtractReportsTextAndCheckboxControlsInDocumentOrder(): void {
        $fields = TemplateFields::extract(self::docx());

        $this->assertSame(
            ["ContentControls.ByIndex.0", "ContentControls.ByIndex.1", "ContentControls.ByIndex.2", "ContentControls.ByIndex.4"],
            array_column($fields, "index"),
            "the date control (index 3) is skipped, the header control comes after the body"
        );
        $this->assertSame(["rich-text", "rich-text", "checkbox", "rich-text"], array_column($fields, "type"));
        $this->assertSame(["recipient", "body", "confirmed", "case"], array_column($fields, "tag"));
        $this->assertSame("Modtager", $fields[0]["alias"]);
        $this->assertSame(11, $fields[0]["id"]);
        $this->assertSame("", $fields[0]["content"], "a placeholder is not reported as content");
        $this->assertSame("Første\nAnden", $fields[1]["content"]);
        $this->assertFalse($fields[2]["checked"]);
        $this->assertSame("00.00", $fields[3]["content"]);
    }

    public function testFillWritesTextCheckboxAndHeader(): void {
        $filled = TemplateFields::fill(self::docx(), [
            "ContentControls.ByIndex.0" => ["content" => "Ishøj Kommune & <Borgerservice>"],
            "ContentControls.ByIndex.1" => ["content" => "Linje 1\nLinje 2"],
            "ContentControls.ByIndex.2" => ["checked" => true],
            "ContentControls.ByIndex.4" => ["content" => "27.15"],
        ]);

        $fields = TemplateFields::extract($filled);
        $this->assertSame("Ishøj Kommune & <Borgerservice>", $fields[0]["content"]);
        $this->assertSame("Linje 1\nLinje 2", $fields[1]["content"]);
        $this->assertTrue($fields[2]["checked"]);
        $this->assertSame("27.15", $fields[3]["content"]);

        $document = self::part($filled, "word/document.xml");
        $this->assertStringNotContainsString("showingPlcHdr", $document, "the placeholder state is cleared");
        $this->assertStringNotContainsString("PlaceholderText", $document, "the placeholder style is dropped");
        $this->assertStringContainsString("<w:b/>", $document, "the run's own formatting is kept");
        $this->assertStringContainsString("<w:jc w:val=\"both\"/>", $document, "the paragraph's formatting is kept");
        $this->assertStringContainsString("☒", $document, "the checkbox shows the checked symbol");
        $this->assertStringContainsString("1. januar", $document, "controls without a value are untouched");
    }

    public function testControlsAroundTablesRowsAndCellsAreNotReportedOrFilled(): void {
        $cell = "<w:tc><w:p><w:r><w:t>Celle</w:t></w:r></w:p></w:tc>";
        $body = "<w:sdt>" . self::sdtPr("Tabel", "table", 21) . "<w:sdtContent><w:tbl><w:tr>{$cell}</w:tr></w:tbl></w:sdtContent></w:sdt>"
            . "<w:tbl><w:sdt>" . self::sdtPr("Række", "row", 22) . "<w:sdtContent><w:tr>{$cell}</w:tr></w:sdtContent></w:sdt>"
            . "<w:tr><w:sdt>" . self::sdtPr("Celle", "cell", 23) . "<w:sdtContent>{$cell}</w:sdtContent></w:sdt></w:tr></w:tbl>"
            . "<w:p><w:sdt>" . self::sdtPr("Navn", "name", 24) . "<w:sdtContent><w:r><w:t>Navn</w:t></w:r></w:sdtContent></w:sdt></w:p>";
        $docx = self::docx($body);

        $fields = TemplateFields::extract($docx);
        $this->assertSame(["name", "case"], array_column($fields, "tag"));
        $this->assertSame("ContentControls.ByIndex.3", $fields[0]["index"], "skipped controls still count, so indexes stay stable");

        $filled = TemplateFields::fill($docx, [
            "ContentControls.ByIndex.0" => ["content" => "x"],
            "ContentControls.ByIndex.1" => ["content" => "x"],
            "ContentControls.ByIndex.2" => ["content" => "x"],
            "ContentControls.ByIndex.3" => ["content" => "Ishøj"],
        ]);
        $document = self::part($filled, "word/document.xml");
        $this->assertSame(3, substr_count($document, "<w:t>Celle</w:t>"), "tables, rows and cells are left intact");
        $this->assertSame("Ishøj", TemplateFields::extract($filled)[0]["content"]);
    }

    public function testFillAddsTheCheckedStateWhenTheTemplateLacksIt(): void {
        $body = "<w:p><w:sdt>" . self::sdtPr("Haster", "urgent", 31, "<w14:checkbox><w14:checkedState w14:val=\"2612\"/><w14:uncheckedState w14:val=\"2610\"/></w14:checkbox>")
            . "<w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt></w:p>";
        $docx = self::docx($body);
        $this->assertFalse(TemplateFields::extract($docx)[0]["checked"]);

        $filled = TemplateFields::fill($docx, ["ContentControls.ByIndex.0" => ["checked" => true]]);

        $this->assertTrue(TemplateFields::extract($filled)[0]["checked"]);
        $this->assertStringContainsString("☒", self::part($filled, "word/document.xml"));
    }

    public function testEmptyPartsAreSkippedAndNoTemporaryFileIsLeft(): void {
        $before = glob(sys_get_temp_dir() . "/eotf*") ?: [];
        $docx = self::docx(null, "");

        $this->assertCount(4, TemplateFields::extract($docx));
        $filled = TemplateFields::fill($docx, ["ContentControls.ByIndex.0" => ["content" => "x"]]);
        $this->assertSame("x", TemplateFields::extract($filled)[0]["content"]);

        $this->assertSame($before, glob(sys_get_temp_dir() . "/eotf*") ?: [], "the temporary copy is removed");
    }

    public function testControlsWithContentThatCannotBeRewrittenAreSkipped(): void {
        $wrap = fn (string $tag, int $id, string $inner) => "<w:p><w:sdt>" . self::sdtPr($tag, $tag, $id) . "<w:sdtContent>{$inner}</w:sdtContent></w:sdt></w:p>";
        $body = $wrap("nested", 41, "<w:sdt><w:sdtContent><w:r><w:t>Indre</w:t></w:r></w:sdtContent></w:sdt>")
            . $wrap("link", 42, "<w:hyperlink><w:r><w:t>Link</w:t></w:r></w:hyperlink>")
            . $wrap("field", 43, "<w:fldSimple w:instr=\"DATE\"><w:r><w:t>1-1-2026</w:t></w:r></w:fldSimple>")
            . $wrap("picture", 44, "<w:r><w:drawing/></w:r>")
            . $wrap("smarttag", 46, "<w:smartTag w:element=\"place\"><w:r><w:t>Ishøj</w:t></w:r></w:smartTag>")
            . $wrap("plain", 45, "<w:r><w:rPr><w:b/></w:rPr><w:t>Tekst</w:t><w:tab/><w:br/></w:r><w:proofErr w:type=\"spellStart\"/>");

        $this->assertSame(["plain", "case"], array_column(TemplateFields::extract(self::docx($body)), "tag"));
    }

    public function testBlockLinesBecomeParagraphsAndBookmarksAreKept(): void {
        $body = "<w:sdt>" . self::sdtPr("Brødtekst", "body", 51) . "<w:sdtContent>"
            . "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr><w:bookmarkStart w:id=\"7\" w:name=\"Bodytext\"/><w:r><w:t>Gammel</w:t></w:r><w:bookmarkEnd w:id=\"7\"/></w:p>"
            . "</w:sdtContent></w:sdt>";

        $filled = TemplateFields::fill(self::docx($body), ["ContentControls.ByIndex.0" => ["content" => "Første\nAnden\nTredje"]]);
        $document = self::part($filled, "word/document.xml");

        $this->assertSame("Første\nAnden\nTredje", TemplateFields::extract($filled)[0]["content"]);
        $this->assertSame(3, substr_count($document, "<w:jc w:val=\"center\"/>"), "each line is a paragraph with the original properties");
        $this->assertStringNotContainsString("<w:br/>", $document);
        $this->assertSame(1, substr_count($document, "w:bookmarkStart"));
        $this->assertSame(1, substr_count($document, "w:bookmarkEnd"));
        $this->assertLessThan(strpos($document, "Første"), strpos($document, "w:bookmarkStart"), "the bookmark starts before the text");
        $this->assertGreaterThan(strpos($document, "Tredje"), strpos($document, "w:bookmarkEnd"), "and ends after it");
    }

    public function testFillCanClearACheckboxAndEmptyATextControl(): void {
        $docx = TemplateFields::fill(self::docx(), ["ContentControls.ByIndex.2" => ["checked" => true]]);

        $filled = TemplateFields::fill($docx, [
            "ContentControls.ByIndex.1" => ["content" => ""],
            "ContentControls.ByIndex.2" => ["checked" => false],
        ]);

        $fields = TemplateFields::extract($filled);
        $this->assertSame("", $fields[1]["content"]);
        $this->assertFalse($fields[2]["checked"]);
        $this->assertStringContainsString("☐", self::part($filled, "word/document.xml"));
    }

    public function testCheckboxWithoutVisibleSymbolGetsOne(): void {
        $body = "<w:p><w:sdt>" . self::sdtPr("Haster", "urgent", 61, "<w14:checkbox><w14:checked w14:val=\"0\"/></w14:checkbox>")
            . "<w:sdtContent/></w:sdt></w:p>";

        $filled = TemplateFields::fill(self::docx($body), ["ContentControls.ByIndex.0" => ["checked" => true]]);

        $this->assertTrue(TemplateFields::extract($filled)[0]["checked"]);
        $this->assertStringContainsString("☒", self::part($filled, "word/document.xml"));
    }

    public function testInvalidFilesThrowOnFillAndLeaveNoTemporaryFile(): void {
        $before = glob(sys_get_temp_dir() . "/eotf*") ?: [];
        $brokenPart = self::docx(null, "<w:ftr");

        $this->assertCount(4, TemplateFields::extract($brokenPart), "listing fields skips a broken part");
        foreach (["not a zip", $brokenPart] as $broken) {
            try {
                TemplateFields::fill($broken, ["ContentControls.ByIndex.0" => ["content" => "x"]]);
                $this->fail("filling a file with a broken part must throw");
            } catch (\RuntimeException) {
                $this->assertTrue(true);
            }
        }

        $this->assertSame($before, glob(sys_get_temp_dir() . "/eotf*") ?: [], "no temporary copy is left");
    }

    public function testControlsWithNotesCommentsOrTrackedChangesAreSkipped(): void {
        $wrap = fn (string $tag, int $id, string $inner) => "<w:p><w:sdt>" . self::sdtPr($tag, $tag, $id) . "<w:sdtContent>{$inner}</w:sdtContent></w:sdt></w:p>";
        $body = $wrap("footnote", 71, "<w:r><w:t>Tekst</w:t></w:r><w:r><w:footnoteReference w:id=\"1\"/></w:r>")
            . $wrap("comment", 72, "<w:commentRangeStart w:id=\"0\"/><w:r><w:t>Tekst</w:t></w:r><w:commentRangeEnd w:id=\"0\"/><w:r><w:commentReference w:id=\"0\"/></w:r>")
            . $wrap("inserted", 73, "<w:ins w:id=\"5\" w:author=\"A\"><w:r><w:t>Ny</w:t></w:r></w:ins>")
            . $wrap("deleted", 74, "<w:del w:id=\"6\" w:author=\"A\"><w:r><w:delText>Gammel</w:delText></w:r></w:del>")
            . $wrap("plain", 75, "<w:r><w:t>Tekst</w:t></w:r>");

        $this->assertSame(["plain", "case"], array_column(TemplateFields::extract(self::docx($body)), "tag"));
    }

    public function testControlsBoundToCustomXmlAreSkipped(): void {
        $binding = "<w:dataBinding w:xpath=\"/root/name\" w:storeItemID=\"{00000000-0000-0000-0000-000000000001}\"/>";
        $body = "<w:p><w:sdt>" . self::sdtPr("Bundet", "bound", 81, $binding . "<w:text/>")
            . "<w:sdtContent><w:r><w:t>Fra XML</w:t></w:r></w:sdtContent></w:sdt></w:p>"
            . "<w:p><w:sdt>" . self::sdtPr("Bundet flueben", "boundbox", 82, $binding . "<w14:checkbox><w14:checked w14:val=\"0\"/></w14:checkbox>")
            . "<w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt></w:p>"
            . "<w:p><w:sdt>" . self::sdtPr("Fri", "free", 83) . "<w:sdtContent><w:r><w:t>Tekst</w:t></w:r></w:sdtContent></w:sdt></w:p>";

        $this->assertSame(["free", "case"], array_column(TemplateFields::extract(self::docx($body)), "tag"));
    }

    public function testCheckedStateAcceptsEveryOnOffSpelling(): void {
        $box = fn (int $id, string $checked) => "<w:p><w:sdt>" . self::sdtPr("Boks", "box" . $id, $id, "<w14:checkbox>{$checked}</w14:checkbox>")
            . "<w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt></w:p>";
        $cases = [
            "<w14:checked w14:val=\"1\"/>" => true,
            "<w14:checked w14:val=\"true\"/>" => true,
            "<w14:checked w14:val=\"on\"/>" => true,
            "<w14:checked/>" => true,
            "<w14:checked w14:val=\"0\"/>" => false,
            "<w14:checked w14:val=\"false\"/>" => false,
            "" => false,
        ];
        $body = "";
        $id = 90;
        foreach (array_keys($cases) as $checked) {
            $body .= $box($id++, $checked);
        }

        $fields = TemplateFields::extract(self::docx($body));
        $this->assertSame(array_values($cases), array_slice(array_column($fields, "checked"), 0, count($cases)));
    }

    public function testTabStopsAreNotReadAsTabs(): void {
        $body = "<w:sdt>" . self::sdtPr("Adresse", "address", 101) . "<w:sdtContent>"
            . "<w:p><w:pPr><w:tabs><w:tab w:val=\"left\" w:pos=\"2268\"/><w:tab w:val=\"left\" w:pos=\"4536\"/></w:tabs></w:pPr><w:r><w:t>Vej</w:t><w:tab/><w:t>1</w:t></w:r></w:p>"
            . "</w:sdtContent></w:sdt>";

        $this->assertSame("Vej\t1", TemplateFields::extract(self::docx($body))[0]["content"]);
    }

    public function testCharactersXmlDoesNotAllowAreRemovedOrTurnedIntoLineBreaks(): void {
        $filled = TemplateFields::fill(self::docx(), ["ContentControls.ByIndex.0" => ["content" => "Linje 1\x0BLinje 2\x01\x1F slut"]]);

        $this->assertSame("Linje 1\nLinje 2 slut", TemplateFields::extract($filled)[0]["content"]);
        $document = self::part($filled, "word/document.xml");
        $this->assertSame(0, preg_match("/[\x01-\x08\x0B\x0C\x0E-\x1F]/", $document), "the saved part holds no character XML forbids");
    }

    public function testTabsAreWrittenAsTabElements(): void {
        $filled = TemplateFields::fill(self::docx(), ["ContentControls.ByIndex.0" => ["content" => "Navn\tAdresse"]]);

        $this->assertSame("Navn\tAdresse", TemplateFields::extract($filled)[0]["content"]);
        $document = self::part($filled, "word/document.xml");
        $this->assertStringContainsString("<w:tab/>", $document);
        $this->assertStringNotContainsString("\t", $document);
    }

    public function testTooLargePartIsRejectedBeforeParsing(): void {
        $big = "<?xml version=\"1.0\"?><w:ftr xmlns:w=\"" . self::W . "\"><w:p><w:r><w:t>" . str_repeat("a", 21 * 1024 * 1024) . "</w:t></w:r></w:p></w:ftr>";

        $this->expectException(\RuntimeException::class);
        TemplateFields::extract(self::docx(null, $big));
    }

    public function testFillWithoutValuesReturnsTheFileUnchanged(): void {
        $docx = self::docx();

        $this->assertSame($docx, TemplateFields::fill($docx, []));
    }
}
