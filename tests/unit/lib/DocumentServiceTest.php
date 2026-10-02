<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Tests\Unit;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Crypt;
use OCA\Eurooffice\DocumentService;
use OCP\IL10N;
use OCP\IURLGenerator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Log\LoggerInterface;
use Test\TestCase;

#[CoversClass(DocumentService::class)]
class DocumentServiceTest extends TestCase {

    private const SECRET_TOO_SHORT = "The secret key must be at least 32 characters long. Generate a new one, for example with \"openssl rand -hex 32\", and set the same key in the Euro-Office DocumentServer and in the Nextcloud Office settings.";
    private const NOT_CONFIGURED = "Nextcloud Office app is not configured. Please contact admin";

    public static function secretProvider(): array {
        return [
            "short secret" => ["secret", self::SECRET_TOO_SHORT],
            "31 characters" => [str_repeat("a", 31), self::SECRET_TOO_SHORT],
            "32 characters" => [str_repeat("a", 32), self::NOT_CONFIGURED],
            "no secret" => ["", self::NOT_CONFIGURED],
        ];
    }

    #[DataProvider("secretProvider")]
    public function testCheckDocServiceUrlValidatesSecretLength(string $secret, string $expectedError): void {
        $trans = $this->createStub(IL10N::class);
        $trans->method("t")->willReturnArgument(0);

        $urlGenerator = $this->createStub(IURLGenerator::class);
        $urlGenerator->method("getAbsoluteURL")->willReturn("https://cloud.example.com/");

        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getDocumentServerUrl")->willReturn("https://docs.example.com/");
        $appConfig->method("getDocumentServerSecret")->willReturn($secret);
        $appConfig->method("getDocumentServerInternalUrl")->willReturn("");

        $documentService = new DocumentService(
            $trans,
            $appConfig,
            $urlGenerator,
            $this->createStub(Crypt::class),
            $this->createStub(LoggerInterface::class),
        );

        $this->assertSame([$expectedError, null], $documentService->checkDocServiceUrl());
    }
}
