<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AdminSettingsSecurity;
use OCP\IL10N;
use OCP\L10N\IFactory;
use OCP\Settings\IDelegatedSettings;
use OCP\Settings\ISettings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

#[CoversClass(AdminSettingsSecurity::class)]
class AdminSettingsSecurityTest extends TestCase {

    private IL10N&MockObject $l10n;

    private AdminSettingsSecurity $settings;

    protected function setUp(): void {
        parent::setUp();

        $this->l10n = $this->createMock(IL10N::class);

        $l10nFactory = $this->createMock(IFactory::class);
        $l10nFactory->expects($this->once())
            ->method("get")
            ->with("eurooffice")
            ->willReturn($this->l10n);

        $this->settings = new AdminSettingsSecurity($l10nFactory);
    }

    public function testImplementsIDelegatedSettings(): void {
        $this->assertInstanceOf(IDelegatedSettings::class, $this->settings);
        $this->assertInstanceOf(ISettings::class, $this->settings);
    }

    public function testGetSection(): void {
        $this->assertSame("eurooffice", $this->settings->getSection());
    }

    /**
     * The form has to render after the templates form (60) to keep the order
     * of the admin page.
     */
    public function testGetPriority(): void {
        $this->assertSame(70, $this->settings->getPriority());
    }

    public function testGetName(): void {
        $this->l10n->expects($this->once())
            ->method("t")
            ->with("Security")
            ->willReturn("Security");

        $this->assertSame("Security", $this->settings->getName());
    }

    /**
     * Only the keys the security form writes may be managed by a delegated
     * admin. The watermark keys live in the files app namespace.
     */
    public function testGetAuthorizedAppConfig(): void {
        $this->assertSame(
            [
                "eurooffice" => ["/^(protection|customization_macros|customization_plugins)$/"],
                "files" => ["/^watermark_.*$/"]
            ],
            $this->settings->getAuthorizedAppConfig()
        );
    }

    /**
     * The form must not hand out the document server credentials or any other
     * key belonging to a form that is not delegatable.
     */
    public function testGetAuthorizedAppConfigExcludesServerSettings(): void {
        $patterns = $this->settings->getAuthorizedAppConfig()["eurooffice"];

        foreach (["DocumentServerUrl", "jwt_secret", "secret", "StorageUrl", "groups"] as $key) {
            foreach ($patterns as $pattern) {
                $this->assertSame(
                    0,
                    preg_match($pattern, $key),
                    "Key \"" . $key . "\" must not be authorized by \"" . $pattern . "\""
                );
            }
        }
    }
}
