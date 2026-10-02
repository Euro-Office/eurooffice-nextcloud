<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit\Controller;

use OCA\Eurooffice\AdminSettingsSecurity;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\SettingsController;
use OCA\Eurooffice\DocumentService;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Preview\IMimeIconProvider;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use ReflectionMethod;
use Test\TestCase;

#[CoversClass(SettingsController::class)]
class SettingsControllerTest extends TestCase {

    private IGroupManager&MockObject $groupManager;

    private SettingsController $controller;

    protected function setUp(): void {
        parent::setUp();

        $this->groupManager = $this->createMock(IGroupManager::class);

        $this->controller = new SettingsController(
            "eurooffice",
            $this->createMock(IRequest::class),
            $this->createMock(IURLGenerator::class),
            $this->createMock(IL10N::class),
            $this->createMock(AppConfig::class),
            $this->createMock(IMimeIconProvider::class),
            $this->createMock(DocumentService::class),
            $this->groupManager
        );
    }

    private function createGroup(string $gid, string $displayName): IGroup&MockObject {
        $group = $this->createMock(IGroup::class);
        $group->method("getGID")->willReturn($gid);
        $group->method("getDisplayName")->willReturn($displayName);
        return $group;
    }

    public function testSearchGroupsReturnsIdAndDisplayName(): void {
        $this->groupManager->expects($this->once())
            ->method("search")
            ->with("adm", 10)
            ->willReturn([
                "admin" => $this->createGroup("admin", "Administrators"),
                "admins-eu" => $this->createGroup("admins-eu", "EU admins")
            ]);

        $response = $this->controller->searchGroups("adm");

        $this->assertSame(
            [
                ["id" => "admin", "displayname" => "Administrators"],
                ["id" => "admins-eu", "displayname" => "EU admins"]
            ],
            $response->getData()
        );
    }

    /**
     * A delegate of the security form must be able to look up the groups
     * for the watermark picker.
     */
    public function testSearchGroupsIsAuthorizedForSecurityDelegates(): void {
        $attributes = (new ReflectionMethod(SettingsController::class, "searchGroups"))
            ->getAttributes(AuthorizedAdminSetting::class);

        $this->assertCount(1, $attributes);
        $this->assertSame(AdminSettingsSecurity::class, $attributes[0]->newInstance()->getSettings());
    }
}
