<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\TemplateManager;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
use Test\TestCase;

/**
 * Covers the paths TemplateManager builds into the document-templates submodule.
 *
 * These assert that the files exist on disk, not just that the path string looks
 * plausible. A path-shape assertion passes even when the submodule layout and the
 * code disagree, and that mismatch is silent in production: getEmptyTemplate()
 * returns false and FileCreator / CreateFromTemplateListener write a 0-byte file
 * without raising anything.
 */
#[CoversClass(TemplateManager::class)]
class TemplateManagerTest extends TestCase {

    private const EXTENSIONS = [".docx", ".xlsx", ".pptx"];

    /**
     * @return array<string, string> the language code to locale directory map the
     *                               production code resolves against
     */
    private static function localePathMap(): array {
        $property = (new ReflectionClass(TemplateManager::class))->getProperty("localPath");
        $property->setAccessible(true);

        return $property->getValue();
    }

    public static function extensionProvider(): array {
        return array_combine(self::EXTENSIONS, array_map(static fn ($ext) => [$ext], self::EXTENSIONS));
    }

    /**
     * The submodule has to be checked out before any of the path assertions mean
     * anything, so fail once with a usable message instead of once per language.
     */
    public function testTemplateSubmoduleIsCheckedOut(): void {
        $localeDir = dirname(TemplateManager::getEmptyTemplatePath("default", ".docx"));
        $templateDir = dirname($localeDir);
        $submoduleDir = dirname($templateDir);

        $this->assertDirectoryExists(
            $submoduleDir,
            "document-templates submodule is not checked out; run: git submodule update --init --recursive"
        );
        $this->assertDirectoryExists(
            $templateDir,
            "the submodule is checked out but has no new/ directory; the pinned commit has the wrong layout"
        );
        $this->assertDirectoryExists($localeDir, "no default locale directory under new/");
    }

    /**
     * Guards the layout contract with the document-templates repository: the
     * per-locale templates live under new/, and dropping that segment is exactly
     * the regression that produces empty documents.
     */
    public function testEmptyTemplatePathIncludesTheNewDirectorySegment(): void {
        $path = TemplateManager::getEmptyTemplatePath("default", ".docx");

        $this->assertStringContainsString(
            DIRECTORY_SEPARATOR . "document-templates" . DIRECTORY_SEPARATOR . "new" . DIRECTORY_SEPARATOR,
            $path
        );
    }

    /**
     * Every language code the app can receive must resolve, through the production
     * function, to a template that is actually on disk.
     */
    #[DataProvider("extensionProvider")]
    public function testEveryLanguageResolvesToAnExistingTemplate(string $ext): void {
        $missing = [];

        foreach (array_keys(self::localePathMap()) as $lang) {
            if (!file_exists(TemplateManager::getEmptyTemplatePath($lang, $ext))) {
                $missing[] = $lang;
            }
        }

        $this->assertSame([], $missing, "no template{$ext} for language(s): " . implode(", ", $missing));
    }

    /**
     * An unknown language falls back to the default locale, and that fallback has
     * to resolve too, since it is the path every unmapped language ends up on.
     */
    public function testUnknownLanguageFallsBackToAnExistingDefaultTemplate(): void {
        $path = TemplateManager::getEmptyTemplatePath("zz-ZZ", ".docx");

        $this->assertStringContainsString(DIRECTORY_SEPARATOR . "default" . DIRECTORY_SEPARATOR, $path);
        $this->assertFileExists($path);
    }

    /**
     * getEmptyTemplate() is what the callers actually use; it must return real
     * file contents rather than false.
     */
    public function testGetEmptyTemplateReturnsNonEmptyContent(): void {
        $content = TemplateManager::getEmptyTemplate("whatever.docx");

        $this->assertIsString($content, "getEmptyTemplate() returned false; the template path does not resolve");
        $this->assertNotSame("", $content);
    }
}
