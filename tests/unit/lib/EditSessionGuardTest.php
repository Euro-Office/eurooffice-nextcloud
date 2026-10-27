<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\EditSessionGuard;
use OCA\Eurooffice\KeyManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotPermittedException;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

#[CoversClass(EditSessionGuard::class)]
class EditSessionGuardTest extends TestCase {

    private const STORED_KEY = "ocinstance_11111111-2222-4333-8444-555555555555";

    private KeyManager&MockObject $keyManager;
    private ICache&MockObject $cache;
    private EditSessionGuard $guard;

    protected function setUp(): void {
        $this->keyManager = $this->createMock(KeyManager::class);
        $this->cache = $this->createMock(ICache::class);

        $cacheFactory = $this->createStub(ICacheFactory::class);
        $cacheFactory->method("createDistributed")->willReturn($this->cache);

        $timeFactory = $this->createStub(ITimeFactory::class);
        $timeFactory->method("getDateTime")->willReturn(new \DateTime("2026-10-26 23:15:00"));

        $this->guard = new EditSessionGuard($this->keyManager, $timeFactory, $cacheFactory);
    }

    public function testSessionWithTheStoredKeyIsCurrent(): void {
        $this->keyManager->method("get")->with(42)->willReturn(self::STORED_KEY);

        // DocumentServer is given the hashed key, never the stored one.
        $this->assertFalse($this->guard->isStale(42, DocumentService::generateRevisionId(self::STORED_KEY)));
        $this->assertTrue($this->guard->isStale(42, self::STORED_KEY));
    }

    public function testSessionIsStaleOnceTheKeyRowIsGone(): void {
        $this->keyManager->method("get")->willReturn("");

        $this->assertTrue($this->guard->isStale(42, DocumentService::generateRevisionId(self::STORED_KEY)));
    }

    public function testSessionIsStaleOnceANewerSessionStoredAnotherKey(): void {
        $this->keyManager->method("get")->willReturn("ocinstance_66666666-7777-4888-9999-000000000000");

        $this->assertTrue($this->guard->isStale(42, DocumentService::generateRevisionId(self::STORED_KEY)));
    }

    public function testFirstCallbackCreatesACopyNextToTheFile(): void {
        $copy = $this->file(77, "report (conflicted copy 2026-10-26 231500).docx");
        $folder = $this->createMock(Folder::class);
        $folder->method("isCreatable")->willReturn(true);
        $folder->expects($this->once())->method("getNonExistingName")
            ->with("report (conflicted copy 2026-10-26 231500).docx")
            ->willReturnArgument(0);
        $folder->expects($this->once())->method("newFile")
            ->with("report (conflicted copy 2026-10-26 231500).docx", "EDITOR")
            ->willReturn($copy);

        $this->cache->method("get")->with("42_9876543210")->willReturn(null);
        $this->cache->expects($this->once())->method("set")->with("42_9876543210", 77, $this->greaterThan(0));

        $this->assertSame($copy, $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR"));
    }

    public function testLaterCallbacksOfTheSessionUpdateItsCopy(): void {
        $copy = $this->file(77, "report (conflicted copy 2026-10-26 231500).docx");
        $copy->expects($this->once())->method("putContent")->with("EDITOR AGAIN");
        $folder = $this->createMock(Folder::class);
        $folder->method("isCreatable")->willReturn(true);
        $folder->method("getFirstNodeById")->with(77)->willReturn($copy);
        $folder->expects($this->never())->method("newFile");

        $this->cache->method("get")->willReturn(77);

        $this->assertSame($copy, $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR AGAIN"));
    }

    public function testCopyGoneSinceTheLastCallbackIsCreatedAgain(): void {
        $folder = $this->createMock(Folder::class);
        $folder->method("getFirstNodeById")->willReturn(null);
        $folder->method("isCreatable")->willReturn(true);
        $folder->method("getNonExistingName")->willReturnArgument(0);
        $folder->expects($this->once())->method("newFile")->willReturn($this->file(78, "copy"));

        $this->cache->method("get")->willReturn(77);

        $this->assertSame(78, $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR")->getId());
    }

    public function testNoCopyWithoutCreatePermission(): void {
        $folder = $this->createMock(Folder::class);
        $folder->method("isCreatable")->willReturn(false);
        $folder->expects($this->never())->method("newFile");

        $this->cache->method("get")->willReturn(null);

        $this->expectException(NotPermittedException::class);
        $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR");
    }

    public function testShareLinkToASingleFileGetsNoCopy(): void {
        // The link resolves the file in the owner's view: its folder is creatable there.
        $folder = $this->folder("/owner/files/Documents");
        $folder->expects($this->never())->method("newFile");
        $share = $this->share(Constants::PERMISSION_ALL, $this->createStub(File::class));

        $this->expectException(NotPermittedException::class);
        $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR", $share);
    }

    public function testShareLinkWithoutCreatePermissionGetsNoCopy(): void {
        $folder = $this->folder("/owner/files/Shared");
        $folder->expects($this->never())->method("newFile");
        $share = $this->share(Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE, $this->folder("/owner/files/Shared"));

        $this->expectException(NotPermittedException::class);
        $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR", $share);
    }

    public function testShareLinkDoesNotReachASiblingFolderWithTheSamePrefix(): void {
        $folder = $this->folder("/owner/files/Shared-private");
        $folder->expects($this->never())->method("newFile");
        $share = $this->share(Constants::PERMISSION_ALL, $this->folder("/owner/files/Shared"));

        $this->expectException(NotPermittedException::class);
        $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR", $share);
    }

    public function testShareLinkWithCreatePermissionGetsACopyInsideTheShare(): void {
        $folder = $this->folder("/owner/files/Shared/Reports");
        $folder->method("getNonExistingName")->willReturnArgument(0);
        $folder->expects($this->once())->method("newFile")->willReturn($this->file(78, "copy"));
        $share = $this->share(Constants::PERMISSION_ALL, $this->folder("/owner/files/Shared"));

        $this->cache->method("get")->willReturn(null);

        $this->assertSame(78, $this->guard->saveConflictCopy($this->file(42, "report.docx", $folder), "9876543210", "EDITOR", $share)->getId());
    }

    public function testNameWithoutExtension(): void {
        $folder = $this->createMock(Folder::class);
        $folder->method("isCreatable")->willReturn(true);
        $folder->method("getNonExistingName")->willReturnArgument(0);
        $folder->expects($this->once())->method("newFile")
            ->with("notes (conflicted copy 2026-10-26 231500)")
            ->willReturn($this->file(78, "copy"));

        $this->guard->saveConflictCopy($this->file(42, "notes", $folder), "9876543210", "EDITOR");
    }

    private function folder(string $path): Folder&MockObject {
        $folder = $this->createMock(Folder::class);
        $folder->method("getPath")->willReturn($path);
        $folder->method("isCreatable")->willReturn(true);
        return $folder;
    }

    private function share(int $permissions, File|Folder $node): IShare {
        $share = $this->createStub(IShare::class);
        $share->method("getPermissions")->willReturn($permissions);
        $share->method("getNode")->willReturn($node);
        return $share;
    }

    private function file(int $id, string $name, ?Folder $parent = null): File&MockObject {
        $file = $this->createMock(File::class);
        $file->method("getId")->willReturn($id);
        $file->method("getName")->willReturn($name);
        if ($parent !== null) {
            $file->method("getParent")->willReturn($parent);
        }
        return $file;
    }
}
