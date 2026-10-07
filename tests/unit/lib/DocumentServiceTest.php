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
use ReflectionMethod;

#[CoversClass(DocumentService::class)]
class DocumentServiceTest extends TestCase {

    private static function convertRequest(): Request {
        return new Request("POST", "https://documentserver.example/converter");
    }

    public static function transientClassificationProvider(): array {
        $request = self::convertRequest();
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

    /**
     * isTransientConvertError() is private - classification is tested
     * directly via reflection rather than by driving the whole poll loop
     * (and its real sleep()s) for every exception type.
     */
    #[DataProvider("transientClassificationProvider")]
    public function testIsTransientConvertErrorClassification(Exception $exception, bool $expectedTransient): void {
        $service = $this->getMockBuilder(DocumentService::class)
            ->disableOriginalConstructor()
            ->onlyMethods([])
            ->getMock();

        $method = new ReflectionMethod(DocumentService::class, "isTransientConvertError");
        $method->setAccessible(true);

        $this->assertSame($expectedTransient, $method->invoke($service, $exception));
    }

    public static function nonTransientExceptionProvider(): array {
        $request = self::convertRequest();

        return [
            "HTTP 500" => [new RequestException("HTTP failure", $request, new Response(500))],
            "request without response" => [new RequestException("Request failed", $request)],
            "invalid configuration" => [new InvalidArgumentException("Invalid URI")],
            "blocked local address" => [new LocalServerException("Local address blocked")],
        ];
    }

    /**
     * A non-transient failure (bad config, a non-gateway HTTP error, ...)
     * must propagate immediately - no retry, no polling, and importantly no
     * generic "-2 Timeout conversion error" replacing the real cause.
     */
    #[DataProvider("nonTransientExceptionProvider")]
    public function testNonTransientFailurePropagatesImmediately(Exception $exception): void {
        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getDocumentServerInternalUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("getConverterPollTimeout")->willReturn(120);
        $appConfig->method("getDocumentServerSecret")->willReturn("");
        $appConfig->method("useDemo")->willReturn(false);

        $service = $this->getMockBuilder(DocumentService::class)
            ->setConstructorArgs([
                $this->createStub(IL10N::class),
                $appConfig,
                $this->createStub(IURLGenerator::class),
                $this->createStub(Crypt::class),
                $this->createStub(LoggerInterface::class),
            ])
            ->onlyMethods(["request"])
            ->getMock();
        $service->expects($this->once())->method("request")->willThrowException($exception);

        $this->expectExceptionObject($exception);

        $service->sendRequestToConvertService(
            "https://nextcloud.example/document.docx",
            "docx",
            "pdf",
            "revision"
        );
    }

    /**
     * When every poll fails transiently and the deadline is reached before
     * DocumentServer ever answers, the real exception behind those failures
     * (most commonly a wrong or unreachable DocumentServerInternalUrl, which
     * surfaces as a connection exception) must be rethrown - not masked
     * behind the generic "-2 Timeout conversion error", which would read as
     * "DocumentServer is slow" rather than "DocumentServer is unreachable".
     *
     * getConverterPollTimeout() returns 0 so the deadline is already in the
     * past once the first (and only) request fails, keeping this test fast
     * and deterministic - no real sleep() is reached.
     */
    public function testRethrowsLastTransientExceptionWhenDeadlineExpiresWithoutAnyResponse(): void {
        $exception = new ConnectException("Connection failed", self::convertRequest());

        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getDocumentServerInternalUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("getConverterPollTimeout")->willReturn(0);
        $appConfig->method("getDocumentServerSecret")->willReturn("");
        $appConfig->method("useDemo")->willReturn(false);

        $service = $this->getMockBuilder(DocumentService::class)
            ->setConstructorArgs([
                $this->createStub(IL10N::class),
                $appConfig,
                $this->createStub(IURLGenerator::class),
                $this->createStub(Crypt::class),
                $this->createStub(LoggerInterface::class),
            ])
            ->onlyMethods(["request"])
            ->getMock();
        $service->expects($this->once())->method("request")->willThrowException($exception);

        $this->expectExceptionObject($exception);

        $service->sendRequestToConvertService(
            "https://nextcloud.example/document.docx",
            "docx",
            "pdf",
            "revision"
        );
    }

    /**
     * A transient failure followed by a successful response must return
     * that response normally - the earlier failure must not leak into the
     * result, and a later timeout in the same call (not exercised here)
     * must still report the generic -2 rather than re-surfacing this
     * already-recovered-from exception.
     */
    public function testRecoversAfterTransientFailureAndClearsLastException(): void {
        $exception = new ConnectException("Connection failed", self::convertRequest());
        $successBody = json_encode(["endConvert" => true, "fileUrl" => "https://documentserver.example/converted.pdf"]);

        $appConfig = $this->createStub(AppConfig::class);
        $appConfig->method("getDocumentServerInternalUrl")->willReturn("https://documentserver.example/");
        $appConfig->method("getConverterPollTimeout")->willReturn(30);
        $appConfig->method("getDocumentServerSecret")->willReturn("");
        $appConfig->method("useDemo")->willReturn(false);

        $service = $this->getMockBuilder(DocumentService::class)
            ->setConstructorArgs([
                $this->createStub(IL10N::class),
                $appConfig,
                $this->createStub(IURLGenerator::class),
                $this->createStub(Crypt::class),
                $this->createStub(LoggerInterface::class),
            ])
            ->onlyMethods(["request"])
            ->getMock();

        $callCount = 0;
        $service->expects($this->exactly(2))
            ->method("request")
            ->willReturnCallback(function () use (&$callCount, $exception, $successBody) {
                $callCount++;
                if ($callCount === 1) {
                    throw $exception;
                }
                return $successBody;
            });

        $response = $service->sendRequestToConvertService(
            "https://nextcloud.example/document.docx",
            "docx",
            "pdf",
            "revision"
        );

        $this->assertSame(true, $response["endConvert"]);
        $this->assertSame("https://documentserver.example/converted.pdf", $response["fileUrl"]);
    }
}
