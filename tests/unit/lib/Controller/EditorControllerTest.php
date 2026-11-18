<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Controller;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\EditorController;
use OCA\Eurooffice\Crypt;
use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\EmailManager;
use OCA\Eurooffice\FileUtility;
use OCA\Eurooffice\KeyManager;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Files\IRootFolder;
use OCP\IAvatarManager;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Share\IManager;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

#[CoversClass(EditorController::class)]
class EditorControllerTest extends TestCase {

    private AppConfig&MockObject $appConfig;
    private IUserSession&MockObject $userSession;
    private IInitialState&MockObject $initialState;

    protected function setUp(): void {
        parent::setUp();

        $this->appConfig = $this->createMock(AppConfig::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->initialState = $this->createMock(IInitialState::class);
    }

    private function makeController(): EditorController {
        $trans = $this->createMock(IL10N::class);
        $trans->method("t")->willReturnArgument(0);

        $request = $this->createMock(IRequest::class);
        $request->method("getRequestUri")->willReturn("/apps/eurooffice/local?fileName=a.docx");

        $urlGenerator = $this->createMock(IURLGenerator::class);
        $urlGenerator->method("linkToRoute")->willReturn("/login?redirect_url=local");

        $appManager = $this->createMock(IAppManager::class);
        $appManager->method("isEnabledForUser")->willReturn(false);

        return new EditorController(
            "eurooffice",
            $request,
            $this->createStub(IRootFolder::class),
            $this->userSession,
            $this->createStub(IUserManager::class),
            $urlGenerator,
            $trans,
            $this->createStub(LoggerInterface::class),
            $this->appConfig,
            $this->createStub(Crypt::class),
            $this->createStub(IManager::class),
            $this->createStub(IGroupManager::class),
            $this->createStub(FileUtility::class),
            $this->createStub(IAvatarManager::class),
            $this->createStub(EmailManager::class),
            $this->createStub(DocumentService::class),
            $this->createStub(KeyManager::class),
            null,
            null,
            $this->initialState,
            $appManager
        );
    }

    private function allowLocalSession(): void {
        $this->userSession->method("isLoggedIn")->willReturn(true);
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);
        $this->appConfig->method("getLocalSessionEnabled")->willReturn(true);
        $this->appConfig->method("getDocumentServerUrl")->willReturn("https://ds.example/");
    }

    public function testLocalRedirectsAnonymousUsersToLogin(): void {
        $this->userSession->method("isLoggedIn")->willReturn(false);

        $response = $this->makeController()->local("a.docx");

        $this->assertInstanceOf(RedirectResponse::class, $response);
        $this->assertSame("/login?redirect_url=local", $response->getRedirectURL());
    }

    public function testLocalRendersErrorWhenDisabled(): void {
        $this->userSession->method("isLoggedIn")->willReturn(true);
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);
        $this->appConfig->method("getLocalSessionEnabled")->willReturn(false);

        $response = $this->makeController()->local("a.docx");

        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertSame("error", $response->getTemplateName());
        $this->assertSame("Opening documents in the browser only is disabled", $response->getParams()["errors"][0]["error"]);
    }

    public function testLocalRendersErrorWithoutDocumentServer(): void {
        $this->userSession->method("isLoggedIn")->willReturn(true);
        $this->appConfig->method("isUserAllowedToUse")->willReturn(true);
        $this->appConfig->method("getLocalSessionEnabled")->willReturn(true);
        $this->appConfig->method("getDocumentServerUrl")->willReturn("");

        $response = $this->makeController()->local("a.docx");

        $this->assertSame("error", $response->getTemplateName());
    }

    public function testLocalRendersEditorInFrameWithCsp(): void {
        $this->allowLocalSession();
        $this->initialState->expects($this->once())->method("provideInitialState")->with("assistant-enabled", false);

        $response = $this->makeController()->local("../Report.docx", true, true);

        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertSame("editor", $response->getTemplateName());
        $this->assertSame("base", $response->getRenderAs());

        $params = $response->getParams();
        $this->assertTrue($params["localSession"]);
        $this->assertSame("Report.docx", $params["fileName"]);
        $this->assertNull($params["fileId"]);
        $this->assertTrue($params["inframe"]);
        $this->assertTrue($params["inviewer"]);

        $policy = $response->getContentSecurityPolicy()->buildPolicy();
        $this->assertStringContainsString("frame-src", $policy);
        $this->assertStringContainsString("https://ds.example/", $policy);
        $this->assertStringContainsString("blob:", $policy);
        $this->assertStringContainsString("'wasm-unsafe-eval'", $policy);
    }

    public function testLocalRendersFullPageByDefault(): void {
        $this->allowLocalSession();

        $response = $this->makeController()->local("a.docx");

        $this->assertSame(TemplateResponse::RENDER_AS_USER, $response->getRenderAs());
        $this->assertFalse($response->getParams()["inframe"]);
        $this->assertFalse($response->getParams()["inviewer"]);
    }
}
