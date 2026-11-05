<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Controller;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\SettingsController;
use OCA\Eurooffice\DocumentService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Preview\IMimeIconProvider;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

#[CoversClass(SettingsController::class)]
class SettingsControllerTest extends TestCase {

    private AppConfig&MockObject $appConfig;

    protected function setUp(): void {
        parent::setUp();

        $this->appConfig = $this->createMock(AppConfig::class);
    }

    private function makeController(): SettingsController {
        return new SettingsController(
            "eurooffice",
            $this->createStub(IRequest::class),
            $this->createStub(IURLGenerator::class),
            $this->createStub(IL10N::class),
            $this->appConfig,
            $this->createStub(IMimeIconProvider::class),
            $this->createStub(DocumentService::class)
        );
    }

    private function saveCommon(SettingsController $controller, array $localSession = []): DataResponse {
        return $controller->saveCommon(
            ["docx" => true],
            ["docx" => true],
            true,
            false,
            false,
            false,
            true,
            false,
            true,
            true,
            false,
            false,
            false,
            false,
            true,
            "original",
            "theme-light",
            "",
            [],
            ...$localSession
        );
    }

    public function testSaveCommonStoresLocalSessionSettings(): void {
        $this->appConfig->expects($this->once())->method("setLocalSessionEnabled")->with(false);
        $this->appConfig->expects($this->once())->method("setLocalSessionMaxSize")->with(10485760);
        $this->appConfig->expects($this->once())->method("setLocalSessionForceE2ee")->with(false);

        $response = $this->saveCommon($this->makeController(), [false, 10485760, false]);

        $this->assertInstanceOf(DataResponse::class, $response);
    }

    public function testSaveCommonKeepsLocalSessionDefaultsForOldClients(): void {
        $this->appConfig->expects($this->once())->method("setLocalSessionEnabled")->with(true);
        $this->appConfig->expects($this->once())->method("setLocalSessionMaxSize")->with(AppConfig::LOCAL_SESSION_DEFAULT_MAX_SIZE);
        $this->appConfig->expects($this->once())->method("setLocalSessionForceE2ee")->with(true);

        $this->saveCommon($this->makeController());
    }
}
