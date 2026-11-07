<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AdminSettingsTemplates;
use OCP\IL10N;
use OCP\L10N\IFactory;
use OCP\Settings\IDelegatedSettings;
use OCP\Settings\ISettings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

#[CoversClass(AdminSettingsTemplates::class)]
class AdminSettingsTemplatesTest extends TestCase {

    private IL10N&MockObject $l10n;

    private AdminSettingsTemplates $settings;

    protected function setUp(): void {
        parent::setUp();

        $this->l10n = $this->createMock(IL10N::class);

        $l10nFactory = $this->createMock(IFactory::class);
        $l10nFactory->expects($this->once())
            ->method("get")
            ->with("eurooffice")
            ->willReturn($this->l10n);

        $this->settings = new AdminSettingsTemplates($l10nFactory);
    }

    public function testImplementsIDelegatedSettings(): void {
        $this->assertInstanceOf(IDelegatedSettings::class, $this->settings);
        $this->assertInstanceOf(ISettings::class, $this->settings);
    }

    public function testGetSection(): void {
        $this->assertSame("eurooffice", $this->settings->getSection());
    }

    /**
     * The form has to render after the main admin form (50) and before the
     * security form (70) to keep the order of the admin page.
     */
    public function testGetPriority(): void {
        $this->assertSame(60, $this->settings->getPriority());
    }

    public function testGetName(): void {
        $this->l10n->expects($this->once())
            ->method("t")
            ->with("Templates")
            ->willReturn("Templates");

        $this->assertSame("Templates", $this->settings->getName());
    }

    /**
     * Templates are files, not app config, so there is nothing to authorize.
     */
    public function testGetAuthorizedAppConfig(): void {
        $this->assertSame([], $this->settings->getAuthorizedAppConfig());
    }
}
