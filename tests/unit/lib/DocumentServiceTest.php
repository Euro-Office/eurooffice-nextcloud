<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit;

use Exception;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use InvalidArgumentException;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Crypt;
use OCA\Eurooffice\DocumentService;
use OCP\Http\Client\LocalServerException;
use OCP\IL10N;
use OCP\IURLGenerator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

#[CoversClass(DocumentService::class)]
class DocumentServiceTest extends TestCase {
    public static function convertExceptionProvider(): array {
        $request = new Request("POST", "https://documentserver.example/converter");
        $cases = [];

        foreach ([400, 401, 403, 404, 408, 429, 500, 501, 502, 503, 504, 505] as $status) {
            $cases["HTTP " . $status] = [
                new RequestException("HTTP failure", $request, new Response($status)),
                in_array($status, [502, 503, 504], true),
            ];
        }

        $cases["connection failure"] = [new ConnectException("Connection failed", $request), true];
        $cases["request without response"] = [new RequestException("Request failed", $request), false];
        $cases["invalid configuration"] = [new InvalidArgumentException("Invalid URI"), false];
        $cases["blocked local address"] = [new LocalServerException("Local address blocked"), false];
        $cases["generic exception with gateway code"] = [new Exception("Configuration failed", 504), false];

        return $cases;
    }

    #[DataProvider("convertExceptionProvider")]
    public function testConvertPollRetriesOnlyTransientExceptions(Exception $exception, bool $transient): void {
        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getDocumentServerInternalUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("getConverterPollTimeout")->willReturn(10);
        $appConfig->method("getDocumentServerSecret")->willReturn("");
        $appConfig->method("useDemo")->willReturn(false);

        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($transient ? $this->once() : $this->never())
            ->method("debug")
            ->with("Converter poll failed transiently, will retry", ["exception" => $exception]);

        $service = $this->getMockBuilder(DocumentService::class)
            ->setConstructorArgs([
                $this->createStub(IL10N::class),
                $appConfig,
                $this->createStub(IURLGenerator::class),
                $this->createStub(Crypt::class),
                $logger,
            ])
            ->onlyMethods(["request"])
            ->getMock();
        $service->expects($this->once())->method("request")->willThrowException($exception);

        if ($transient) {
            $this->assertSame([], $service->sendRequestToConvertService(
                "https://nextcloud.example/document.docx",
                "docx",
                "pdf",
                "revision",
                true
            ));
            return;
        }

        try {
            $service->sendRequestToConvertService(
                "https://nextcloud.example/document.docx",
                "docx",
                "pdf",
                "revision",
                true
            );
        } catch (Exception $actual) {
            $this->assertSame($exception, $actual);
            return;
        }

        $this->fail("The original exception must be rethrown");
    }
}
