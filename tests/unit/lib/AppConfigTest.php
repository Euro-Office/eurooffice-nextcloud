<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AppConfig;
use OCP\App\IAppManager;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IAppConfig;
use OCP\IConfig;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Log\LoggerInterface;
use Test\TestCase;

#[CoversClass(AppConfig::class)]
class AppConfigTest extends TestCase {

    protected function tearDown(): void {
        $this->restoreService(IAppManager::class);
        parent::tearDown();
    }

    public static function pdfDefaultProvider(): array {
        return [
            "no stored value, files_pdfviewer enabled" => ["", true, false],
            "no stored value, files_pdfviewer disabled" => ["", false, true],
            "stored pdf off, files_pdfviewer disabled" => ['{"pdf":false}', false, false],
            "stored pdf on, files_pdfviewer enabled" => ['{"pdf":true}', true, true],
            "only other formats stored, files_pdfviewer disabled" => ['{"docx":true}', false, true],
        ];
    }

    #[DataProvider("pdfDefaultProvider")]
    public function testPdfDefault(string $storedDefFormats, bool $pdfViewerEnabled, bool $expected): void {
        $appManager = $this->createMock(IAppManager::class);
        $appManager->method("isEnabledForUser")->with("files_pdfviewer")->willReturn($pdfViewerEnabled);
        $this->overwriteService(IAppManager::class, $appManager);

        $this->assertSame($expected, $this->createAppConfig($storedDefFormats)->formatsSetting()["pdf"]["def"]);
    }

    private function createAppConfig(string $storedDefFormats): AppConfig {
        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->method("getValueString")->willReturnCallback(
            static fn (string $app, string $key, string $default = "") => $key === "defFormats" ? $storedDefFormats : $default
        );

        $cache = $this->createMock(ICache::class);
        $cache->method("get")->with("document_formats")->willReturn(json_encode([
            ["name" => "pdf", "mime" => ["application/pdf"], "type" => "pdf", "actions" => ["view"], "convert" => ["pdf"]],
            ["name" => "docx", "mime" => ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], "type" => "word", "actions" => ["view", "edit"], "convert" => ["pdf"]],
        ]));
        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method("createLocal")->willReturn($cache);

        return new AppConfig("eurooffice", $appConfig, $this->createMock(IConfig::class), $this->createMock(LoggerInterface::class), $cacheFactory);
    }
}
