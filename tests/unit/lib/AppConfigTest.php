<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AppConfig;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IAppConfig;
use OCP\IConfig;
use PHPUnit\Framework\Attributes\CoversClass;
use Test\TestCase;

/**
 * Covers the showPluginsTab admin setting (editorConfig.customization.layout.toolbar.plugins).
 */
#[CoversClass(AppConfig::class)]
class AppConfigTest extends TestCase {

    private const APP_ID = 'eurooffice';

    private function makeAppConfig(IAppConfig $appConfig): AppConfig {
        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createLocal')
            ->willReturn($this->createMock(ICache::class));

        return new AppConfig(
            self::APP_ID,
            $appConfig,
            $this->createMock(IConfig::class),
            $this->createMock(\Psr\Log\LoggerInterface::class),
            $cacheFactory,
        );
    }

    /**
     * When the admin never saved the setting the value must default to
     * "true" so the standard Plugins tab keeps its previous visibility.
     */
    public function testGetShowPluginsTabDefaultsToTrueWhenUnset(): void {
        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->method('getValueString')
            ->willReturnCallback(
                static fn (string $app, string $key, ?string $default = null): ?string => $default
            );

        $this->assertTrue($this->makeAppConfig($appConfig)->getShowPluginsTab());
    }

    public function testGetShowPluginsTabIsFalseWhenStoredFalse(): void {
        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->method('getValueString')
            ->willReturnCallback(
                static fn (string $app, string $key, ?string $default = null): ?string =>
                ($app === self::APP_ID && $key === 'showPluginsTab') ? 'false' : $default
            );

        $this->assertFalse($this->makeAppConfig($appConfig)->getShowPluginsTab());
    }

    /**
     * The saved value is stored as a JSON-encoded boolean string, matching
     * the other boolean settings (e.g. customizationChat) in this class.
     */
    public function testSetShowPluginsTabPersistsJsonBoolean(): void {
        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->expects(self::once())
            ->method('setValueString')
            ->with(self::APP_ID, 'showPluginsTab', 'false');

        $this->makeAppConfig($appConfig)->setShowPluginsTab(false);
    }
}
