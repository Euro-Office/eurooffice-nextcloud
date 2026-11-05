<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Controller;

use OC\Files\Node;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\EditorController;
use OCA\Eurooffice\Crypt;
use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\EmailManager;
use OCA\Eurooffice\FileUtility;
use OCA\Eurooffice\KeyManager;
use OCP\App\IAppManager;
use OCP\AppFramework\Services\IInitialState;
use OCP\Files\FileInfo;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Storage\IStorage;
use OCP\IAvatarManager;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Share\IManager;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

#[CoversClass(EditorController::class)]
class EditorControllerTest extends TestCase {

    /**
     * A user id in the share access list whose account no longer exists
     * makes IUserManager::get() return null. The entry must be skipped
     * instead of failing the whole request with a TypeError (#173).
     */
    public function testUsersSkipsAccessListEntriesOfDeletedUsers(): void {
        $currentUser = $this->createUser("admin", "admin@example.com");
        $alice = $this->createUser("alice", "alice@example.com");

        $userSession = $this->createMock(IUserSession::class);
        $userSession->method("getUser")->willReturn($currentUser);

        $userManager = $this->createMock(IUserManager::class);
        $userManager->method("get")->willReturnMap([
            ["deleted-user", null],
            ["alice", $alice],
        ]);

        $storage = $this->createMock(IStorage::class);
        $storage->method("instanceOfStorage")->willReturn(false);
        $fileInfo = $this->createMock(FileInfo::class);
        $fileInfo->method("getStorage")->willReturn($storage);

        // getFileInfo() is not part of OCP\Files\File; the controller relies on the server node class.
        $file = $this->createMock(Node\File::class);
        $file->method("isReadable")->willReturn(true);
        $file->method("getPermissions")->willReturn(0);
        $file->method("getFileInfo")->willReturn($fileInfo);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method("getById")->with(42)->willReturn([$file]);
        $root = $this->createMock(IRootFolder::class);
        $root->method("getUserFolder")->with("admin")->willReturn($userFolder);

        $shareManager = $this->createMock(IManager::class);
        $shareManager->method("allowEnumeration")->willReturn(true);
        $shareManager->method("limitEnumerationToGroups")->willReturn(false);
        $shareManager->method("getAccessList")->with($file)->willReturn([
            "users" => ["deleted-user", "alice"],
        ]);

        $groupManager = $this->createMock(IGroupManager::class);
        $groupManager->method("getUserGroupIds")->willReturn([]);

        $appConfig = $this->createMock(AppConfig::class);
        $appConfig->method("isUserAllowedToUse")->willReturn(true);

        $controller = new EditorController(
            "eurooffice",
            $this->createMock(IRequest::class),
            $root,
            $userSession,
            $userManager,
            $this->createMock(IURLGenerator::class),
            $this->createMock(IL10N::class),
            $this->createMock(LoggerInterface::class),
            $appConfig,
            $this->createMock(Crypt::class),
            $shareManager,
            $groupManager,
            $this->createMock(FileUtility::class),
            $this->createMock(IAvatarManager::class),
            $this->createMock(EmailManager::class),
            $this->createMock(DocumentService::class),
            $this->createMock(KeyManager::class),
            null,
            null,
            $this->createMock(IInitialState::class),
            $this->createMock(IAppManager::class),
        );

        $response = $controller->users(42);

        $this->assertSame([
            ["name" => "alice", "id" => "alice", "email" => "alice@example.com"],
        ], $response->getData());
    }

    private function createUser(string $uid, string $email): IUser {
        $user = $this->createMock(IUser::class);
        $user->method("getUID")->willReturn($uid);
        $user->method("getDisplayName")->willReturn($uid);
        $user->method("getEMailAddress")->willReturn($email);
        return $user;
    }
}
