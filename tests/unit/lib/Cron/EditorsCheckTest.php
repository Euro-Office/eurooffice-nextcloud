<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Cron;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Cron\EditorsCheck;
use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\EmailManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionMethod;

// RecordingEditorsCheck isn't a *Test.php file, so PHPUnit's directory-based
// test discovery never loads it on its own, and this project's composer.json
// has no autoload-dev mapping for the Tests namespace - without this, the
// class is only found when PHP happens to have already included it as a
// side effect of loading some other file.
require_once __DIR__ . "/RecordingEditorsCheck.php";

#[CoversClass(EditorsCheck::class)]
class EditorsCheckTest extends TestCase {

    /** @return array{RecordingEditorsCheck, MockObject&IManager, MockObject&INotification} */
    private function makeJob(AppConfig $appConfig, DocumentService $documentService, IGroupManager $groupManager): array {
        $urlGenerator = $this->createStub(IURLGenerator::class);
        $urlGenerator->method("linkToRouteAbsolute")->willReturn("https://nextcloud.example/apps/eurooffice/ajax/empty");
        $urlGenerator->method("getAbsoluteURL")->willReturn("https://nextcloud.example/");

        $job = new RecordingEditorsCheck(
            $this->createStub(ITimeFactory::class),
            "eurooffice",
            $urlGenerator,
            $appConfig,
            $this->createStub(IL10N::class),
            $groupManager,
            $this->createStub(EmailManager::class),
            $this->createStub(LoggerInterface::class),
            $documentService
        );

        // A single shared mock stands in for every notification built during
        // the test (buildUnavailableNotification() is called at most once per
        // run()), so setDateTime()'s call count reflects exactly what the
        // production code did with it.
        $notification = $this->createMock(INotification::class);
        $notification->method("setApp")->willReturnSelf();
        $notification->method("setObject")->willReturnSelf();
        $notification->method("setSubject")->willReturnSelf();
        $notification->method("setUser")->willReturnSelf();
        $notification->method("setDateTime")->willReturnSelf();

        $notificationManager = $this->createMock(IManager::class);
        $notificationManager->method("createNotification")->willReturn($notification);
        $job->injectedNotificationManager = $notificationManager;

        return [$job, $notificationManager, $notification];
    }

    private function runJob(RecordingEditorsCheck $job): void {
        $method = new ReflectionMethod(EditorsCheck::class, "run");
        $method->setAccessible(true);
        $method->invoke($job, []);
    }

    private function emptyGroupManager(): IGroupManager {
        $groupManager = $this->createStub(IGroupManager::class);
        $group = $this->createStub(IGroup::class);
        $group->method("getUsers")->willReturn([]);
        $groupManager->method("get")->willReturn($group);
        return $groupManager;
    }

    private function groupManagerWithOneAdmin(): IGroupManager {
        $admin = $this->createStub(IUser::class);
        $admin->method("getUID")->willReturn("admin");

        $groupManager = $this->createStub(IGroupManager::class);
        $group = $this->createStub(IGroup::class);
        $group->method("getUsers")->willReturn([$admin]);
        $groupManager->method("get")->willReturn($group);
        return $groupManager;
    }

    public function testOkToOkDoesNotWriteSettingsErrorOrNotify(): void {
        $appConfig = $this->createMock(AppConfig::class);
        $appConfig->method("getDocumentServerUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("useDemo")->willReturn(false);
        $appConfig->method("getStorageUrl")->willReturn("");
        $appConfig->method("settingsAreSuccessful")->willReturn(true);
        $appConfig->expects($this->never())->method("setSettingsError");

        $documentService = $this->createStub(DocumentService::class);
        $documentService->method("checkDocServiceUrl")->willReturn(["", "9.3.4"]);

        [$job, $notificationManager] = $this->makeJob($appConfig, $documentService, $this->emptyGroupManager());
        $notificationManager->expects($this->never())->method("notify");
        $notificationManager->expects($this->never())->method("markProcessed");

        $this->runJob($job);
    }

    public function testFailedToOkClearsErrorAndDismissesNotification(): void {
        $appConfig = $this->createMock(AppConfig::class);
        $appConfig->method("getDocumentServerUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("useDemo")->willReturn(false);
        $appConfig->method("getStorageUrl")->willReturn("");
        $appConfig->method("settingsAreSuccessful")->willReturn(false);
        $appConfig->expects($this->once())->method("setSettingsError")->with("");

        $documentService = $this->createStub(DocumentService::class);
        $documentService->method("checkDocServiceUrl")->willReturn(["", "9.3.4"]);

        [$job, $notificationManager, $notification] = $this->makeJob($appConfig, $documentService, $this->emptyGroupManager());
        $notificationManager->expects($this->never())->method("notify");
        $notificationManager->expects($this->once())->method("markProcessed");
        // Regression guard: Nextcloud's notification backend matches
        // markProcessed() on an exact timestamp whenever one is set, so a
        // freshly-built "now" timestamp here would never match the original
        // notification's stored send time and the dismissal would silently
        // match nothing.
        $notification->expects($this->never())->method("setDateTime");

        $this->runJob($job);
    }

    public function testFailedToFailedStillProbesUpdatesErrorAndDoesNotNotifyAgain(): void {
        $appConfig = $this->createMock(AppConfig::class);
        $appConfig->method("getDocumentServerUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("useDemo")->willReturn(false);
        $appConfig->method("getStorageUrl")->willReturn("");
        $appConfig->method("settingsAreSuccessful")->willReturn(false);
        $appConfig->expects($this->once())->method("setSettingsError")->with("still down");

        $documentService = $this->createMock(DocumentService::class);
        $documentService->expects($this->once())
            ->method("checkDocServiceUrl")
            ->willReturn(["still down", null]);

        [$job, $notificationManager] = $this->makeJob($appConfig, $documentService, $this->emptyGroupManager());
        $notificationManager->expects($this->never())->method("notify");
        $notificationManager->expects($this->never())->method("markProcessed");

        $this->runJob($job);
    }

    public function testOkToFailedNotifiesOnce(): void {
        $appConfig = $this->createMock(AppConfig::class);
        $appConfig->method("getDocumentServerUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("useDemo")->willReturn(false);
        $appConfig->method("getStorageUrl")->willReturn("");
        $appConfig->method("settingsAreSuccessful")->willReturn(true);
        $appConfig->expects($this->once())->method("setSettingsError")->with("down");
        $appConfig->method("getEmailNotifications")->willReturn(false);

        $documentService = $this->createStub(DocumentService::class);
        $documentService->method("checkDocServiceUrl")->willReturn(["down", null]);

        [$job, $notificationManager, $notification] = $this->makeJob($appConfig, $documentService, $this->groupManagerWithOneAdmin());
        $notificationManager->expects($this->once())->method("notify");
        $notificationManager->expects($this->never())->method("markProcessed");
        $notification->expects($this->once())->method("setDateTime");

        $this->runJob($job);
    }

    public function testConstructorUsesConfiguredInterval(): void {
        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getEditorsCheckInterval")->willReturn(300);

        [$job] = $this->makeJob($appConfig, $this->createStub(DocumentService::class), $this->emptyGroupManager());

        $this->assertSame(300, $job->getInterval());
    }
}
