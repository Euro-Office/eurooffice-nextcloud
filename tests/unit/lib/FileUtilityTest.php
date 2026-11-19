<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\DAV\Connector\Sabre\PublicAuth;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\FileUtility;
use OCA\Eurooffice\KeyManager;
use OCP\AppFramework\PublicShareController;
use OCP\IL10N;
use OCP\ISession;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionMethod;

#[CoversClass(FileUtility::class)]
class FileUtilityTest extends TestCase {

    private const TOKEN = "shareToken";
    private const SHARE_ID = "42";
    private const PASSWORD_HASH = "currentHash";

    public static function sessionProvider(): array {
        return [
            "current password in session" => [self::PASSWORD_HASH, [self::TOKEN => self::PASSWORD_HASH], true],
            "previous password in session" => [self::PASSWORD_HASH, [self::TOKEN => "previousHash"], false],
            "no session" => [self::PASSWORD_HASH, null, false],
            "no password and no session" => [null, null, true],
        ];
    }

    #[DataProvider("sessionProvider")]
    public function testGetShareChecksPasswordHashInSession(?string $password, ?array $frontendTokens, bool $allowed): void {
        $helper = new ReflectionMethod(PublicAuth::class, "isShareInSession");
        if (!$helper->isPublic() || !$helper->isStatic()) {
            $this->markTestSkipped("Server release before the session helper");
        }

        $share = $this->createStub(IShare::class);
        $share->method("getId")->willReturn(self::SHARE_ID);
        $share->method("getToken")->willReturn(self::TOKEN);
        $share->method("getPassword")->willReturn($password);

        $shareManager = $this->createStub(IManager::class);
        $shareManager->method("getShareByToken")->willReturn($share);

        $sessionValues = [
            "public_link_authenticated" => $frontendTokens === null ? null : [self::SHARE_ID],
            PublicShareController::DAV_AUTHENTICATED_FRONTEND => $frontendTokens === null ? null : json_encode($frontendTokens),
        ];
        $session = $this->createStub(ISession::class);
        $session->method("get")->willReturnCallback(fn (string $key) => $sessionValues[$key] ?? null);

        $trans = $this->createStub(IL10N::class);
        $trans->method("t")->willReturnArgument(0);

        $fileUtility = new FileUtility(
            $trans,
            $this->createStub(LoggerInterface::class),
            $this->createStub(AppConfig::class),
            $shareManager,
            $session,
            $this->createStub(KeyManager::class),
        );

        [$result, $error] = $fileUtility->getShare(self::TOKEN);

        $this->assertSame($allowed ? $share : null, $result);
        $this->assertSame($allowed, $error === null);
    }
}
