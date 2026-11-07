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

    private static function docx(): string {
        $body = "<w:p><w:r><w:t>Til: </w:t></w:r>"
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

    public function testFillWithoutValuesReturnsTheFileUnchanged(): void {
        $docx = self::docx();

        $this->assertSame($docx, TemplateFields::fill($docx, []));
    }
}
