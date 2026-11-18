<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Controller;

use OCA\DAV\CalDAV\TimezoneService;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\EditorApiController;
use OCA\Eurooffice\Crypt;
use OCA\Eurooffice\ExtraPermissions;
use OCA\Eurooffice\FileUtility;
use OCA\Eurooffice\Vendor\Firebase\JWT\JWT;
use OCA\Eurooffice\Vendor\Firebase\JWT\Key;
use OCP\AppFramework\Http;
use OCP\Files\IRootFolder;
use OCP\Files\Lock\ILockManager;
use OCP\IAvatar;
use OCP\IAvatarManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\ITagManager;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\L10N\IFactory;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

#[CoversClass(EditorApiController::class)]
class EditorApiControllerTest extends TestCase {

    private const SECRET = "local-session-test-secret-with-32-chars!";

    private AppConfig&MockObject $appConfig;
    private IUserSession&MockObject $userSession;
    private IRequest&MockObject $request;

    protected function setUp(): void {
        parent::setUp();

        $this->appConfig = $this->createMock(AppConfig::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->request = $this->createMock(IRequest::class);
        $this->request->method("isUserAgent")->willReturn(false);
    }

    private function makeController(): EditorApiController {
        $trans = $this->createMock(IL10N::class);
        $trans->method("t")->willReturnArgument(0);
        $trans->method("getLocaleCode")->willReturn("de_DE");

        $l10nFactory = $this->createMock(IFactory::class);
        $l10nFactory->method("findLanguage")->willReturn("de_DE");

        $avatar = $this->createMock(IAvatar::class);
        $avatar->method("exists")->willReturn(false);
        $avatarManager = $this->createMock(IAvatarManager::class);
        $avatarManager->method("getAvatar")->willReturn($avatar);

        return new EditorApiController(
            "eurooffice",
            $this->request,
            $this->createStub(IRootFolder::class),
            $this->userSession,
            $this->createStub(IUserManager::class),
            $this->createStub(IURLGenerator::class),
            $trans,
            $this->createStub(LoggerInterface::class),
            $this->appConfig,
            $this->createStub(Crypt::class),
            $this->createStub(ITagManager::class),
            $this->createStub(ILockManager::class),
            $this->createStub(TimezoneService::class),
            $this->createStub(FileUtility::class),
            $avatarManager,
            $this->createStub(ExtraPermissions::class),
            $l10nFactory
        );
    }

    private function loginUser(): void {
        $user = $this->createMock(IUser::class);
        $user->method("getUID")->willReturn("alice");
        $user->method("getDisplayName")->willReturn("Alice");
        $this->userSession->method("getUser")->willReturn($user);
    }

    private function configureFormats(): void {
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);
        $this->appConfig->method("getLocalSessionEnabled")->willReturn(true);
        $this->appConfig->method("formatsSetting")->willReturn([
            "docx" => ["mime" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "type" => "word", "edit" => true],
            "xlsx" => ["mime" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "type" => "cell", "edit" => true],
        ]);
        $this->appConfig->method("getCustomizationReviewDisplay")->willReturn("original");
        $this->appConfig->method("getDocumentServerUrl")->willReturn("https://ds.example/");
        $this->appConfig->method("getDocumentServerSecret")->willReturn(self::SECRET);
        $this->appConfig->method("getJwtExpiration")->willReturn(5);
        $this->appConfig->method("getSystemValue")->willReturn("instance-id");
    }

    public function testLocalConfigRequiresLogin(): void {
        $this->userSession->method("getUser")->willReturn(null);

        $response = $this->makeController()->localConfig("report.docx");

        $this->assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
    }

    public function testLocalConfigRejectsDisabledSetting(): void {
        $this->loginUser();
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);
        $this->appConfig->method("getLocalSessionEnabled")->willReturn(false);

        $response = $this->makeController()->localConfig("report.docx");

        $this->assertSame(Http::STATUS_FORBIDDEN, $response->getStatus());
    }

    public function testLocalConfigRejectsUnsupportedFormat(): void {
        $this->loginUser();
        $this->configureFormats();

        $response = $this->makeController()->localConfig("archive.zip");

        $this->assertSame(Http::STATUS_UNPROCESSABLE_ENTITY, $response->getStatus());
        $this->assertSame("Format is not supported", $response->getData()["error"]);
    }

    public function testLocalConfigBuildsViewOnlyLocalSession(): void {
        $this->loginUser();
        $this->configureFormats();

        $response = $this->makeController()->localConfig("../sub/Report Q3.DOCX", true, true);
        $params = $response->getData();

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
        $this->assertSame("word", $params["documentType"]);
        $this->assertSame("docx", $params["document"]["fileType"]);
        $this->assertSame("Report Q3.DOCX", $params["document"]["title"]);
        $this->assertArrayNotHasKey("url", $params["document"]);
        $this->assertArrayNotHasKey("key", $params["document"]);
        $this->assertFalse($params["document"]["permissions"]["edit"]);
        $this->assertTrue($params["document"]["permissions"]["download"]);
        $this->assertSame("view", $params["editorConfig"]["mode"]);
        $this->assertSame(["type" => "local"], $params["editorConfig"]["session"]);
        $this->assertArrayNotHasKey("callbackUrl", $params["editorConfig"]);
        $this->assertSame("de-DE", $params["editorConfig"]["lang"]);
        $this->assertSame("instance-id_alice", $params["editorConfig"]["user"]["id"]);
        $this->assertSame("Alice", $params["editorConfig"]["user"]["name"]);
        $this->assertTrue($params["editorConfig"]["customization"]["close"]["visible"]);
        $this->assertSame("https://ds.example/", $params["documentServerUrl"]);

        $decoded = (array)JWT::decode($params["token"], new Key(self::SECRET, "HS256"));
        $this->assertSame("word", $decoded["documentType"]);
    }

    public function testLocalConfigHonoursDisabledDownload(): void {
        $this->loginUser();
        $this->configureFormats();
        $this->appConfig->method("getDisableDownload")->willReturn(true);

        $params = $this->makeController()->localConfig("sheet.xlsx")->getData();

        $this->assertSame("cell", $params["documentType"]);
        $this->assertFalse($params["document"]["permissions"]["download"]);
        $this->assertFalse($params["document"]["permissions"]["print"]);
        $this->assertFalse($params["document"]["permissions"]["copy"]);
        $this->assertArrayNotHasKey("close", $params["editorConfig"]["customization"] ?? []);
    }
}
