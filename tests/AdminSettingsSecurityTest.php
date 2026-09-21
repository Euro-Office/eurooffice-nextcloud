<?php
/**
 *
 * (c) Copyright Ascensio System SIA 2026
 *
 * This program is a free software product.
 * You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
 * (AGPL) version 3 as published by the Free Software Foundation.
 * In accordance with Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 *
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

namespace OCA\Eurooffice\Tests;

use OCA\Eurooffice\AdminSettingsSecurity;
use OCP\IL10N;
use OCP\L10N\IFactory;
use OCP\Settings\IDelegatedSettings;
use OCP\Settings\ISettings;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

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
