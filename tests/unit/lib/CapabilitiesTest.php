<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Capabilities;
use OCP\App\IAppManager;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

#[CoversClass(Capabilities::class)]
class CapabilitiesTest extends TestCase {

    private AppConfig&MockObject $appConfig;
    private IUserSession&MockObject $userSession;
    private Capabilities $capabilities;

    protected function setUp(): void {
        parent::setUp();

        $this->appConfig = $this->createMock(AppConfig::class);
        $this->appConfig->method("getDocumentServerUrl")->willReturn("https://docs.example/");
        $this->appConfig->method("formatsSetting")->willReturn([
            "docx" => ["mime" => ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], "type" => "word", "edit" => true, "def" => true],
            "odt" => ["mime" => ["application/vnd.oasis.opendocument.text"], "type" => "word", "def" => false],
            "txt" => ["mime" => ["text/plain"], "edit" => true],
        ]);

        $appManager = $this->createMock(IAppManager::class);
        $appManager->method("getAppVersion")->with("eurooffice")->willReturn("11.0.6");

        $urlGenerator = $this->createMock(IURLGenerator::class);
        $urlGenerator->method("linkToRouteAbsolute")
            ->with("eurooffice.editor.index", ["fileId" => "0123456789"])
            ->willReturn("https://cloud.example/index.php/apps/eurooffice/0123456789");
        $urlGenerator->method("linkToOCSRouteAbsolute")
            ->with("eurooffice.editorApi.config", ["fileId" => "0123456789"])
            ->willReturn("https://cloud.example/ocs/v2.php/apps/eurooffice/api/v1/config/0123456789");

        $this->userSession = $this->createMock(IUserSession::class);

        $this->capabilities = new Capabilities($this->appConfig, $appManager, $urlGenerator, $this->userSession);
    }

    private function logIn(): void {
        $user = $this->createMock(IUser::class);
        $user->method("getUID")->willReturn("alice");
        $this->userSession->method("getUser")->willReturn($user);
    }

    public function testDescribesTheEditorForAllowedUsers(): void {
        $this->logIn();
        $this->appConfig->method("settingsAreSuccessful")->willReturn(true);
        $this->appConfig->method("isUserAllowedToUse")->with("alice")->willReturn(true);

        $this->assertSame([
            "eurooffice" => [
                "version" => "11.0.6",
                "editor" => "https://cloud.example/index.php/apps/eurooffice/{fileId}",
                "config" => "https://cloud.example/ocs/v2.php/apps/eurooffice/api/v1/config/{fileId}",
                "formats" => [
                    "docx" => ["type" => "word", "edit" => true],
                    "odt" => ["type" => "word", "edit" => false],
                ],
            ],
        ], $this->capabilities->getCapabilities());
    }

    public function testNothingWithoutUser(): void {
        $this->userSession->method("getUser")->willReturn(null);
        $this->appConfig->method("settingsAreSuccessful")->willReturn(true);

        $this->assertSame([], $this->capabilities->getCapabilities());
    }

    public function testNothingWhenTheDocumentServerIsNotWorking(): void {
        $this->logIn();
        $this->appConfig->method("settingsAreSuccessful")->willReturn(false);
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);

        $this->assertSame([], $this->capabilities->getCapabilities());
    }

    public function testNothingForUsersOutsideTheAllowedGroups(): void {
        $this->logIn();
        $this->appConfig->method("settingsAreSuccessful")->willReturn(true);
        $this->appConfig->method("isUserAllowedToUse")->with("alice")->willReturn(false);

        $this->assertSame([], $this->capabilities->getCapabilities());
    }
}
