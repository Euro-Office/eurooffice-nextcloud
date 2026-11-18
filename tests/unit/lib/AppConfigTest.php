<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AppConfig;
use OCP\IAppConfig;
use OCP\ICacheFactory;
use OCP\IConfig;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

#[CoversClass(AppConfig::class)]
class AppConfigTest extends TestCase {

    public static function verifyPeerOffSystemValueProvider(): array {
        return [
            "native bool true" => [true, true],
            "native bool false" => [false, false],
            "string true" => ["true", true],
            "string false" => ["false", false],
            "not set" => [null, false],
        ];
    }

    /**
     * Without a value saved in the admin panel, verify_peer_off falls back to
     * the "eurooffice" section of config.php, where `true` is the natural way
     * to write it (#151).
     */
    #[DataProvider("verifyPeerOffSystemValueProvider")]
    public function testGetVerifyPeerOffFallsBackToConfigPhp(mixed $systemValue, bool $expected): void {
        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->method("getValueString")->willReturn("");

        $section = $systemValue === null ? [] : ["verify_peer_off" => $systemValue];
        $config = $this->createMock(IConfig::class);
        $config->method("getSystemValue")->with("eurooffice")->willReturn($section);

        $eoConfig = new AppConfig(
            "eurooffice",
            $appConfig,
            $config,
            $this->createMock(LoggerInterface::class),
            $this->createMock(ICacheFactory::class),
        );

        $this->assertSame($expected, $eoConfig->getVerifyPeerOff());
    }
}
