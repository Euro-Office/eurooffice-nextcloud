<?php
/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Controller;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\DocumentService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * Admin-only controller that proxies font-management requests to the
 * EO DocumentServer AdminPanel API (/admin/api/v1/fonts).
 *
 * Authentication toward the AdminPanel uses a short-lived JWT signed
 * with the same secret the NC admin configured in the EO settings page
 * (services.CoAuthoring.secret.browser.string on the DS side).
 *
 * Routes are registered in appinfo/routes.php under "ajax/fonts/…".
 * The Nextcloud AppFramework enforces admin-only access for controllers
 * without #[NoAdminRequired]; the explicit check in requireAdmin() provides
 * defence-in-depth for any path that bypasses the middleware (e.g. API calls).
 */
class FontController extends Controller {

    private const ADMIN_FONTS_PATH = '/admin/api/v1/fonts';
    /** Maximum font file size accepted from the browser (20 MiB) */
    private const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
    /** TTL for the inter-service Bearer JWT in seconds */
    private const JWT_TTL = 60;

    public function __construct(
        string $appName,
        IRequest $request,
        private readonly AppConfig $appConfig,
        private readonly DocumentService $documentService,
        private readonly LoggerInterface $logger,
        private readonly IGroupManager $groupManager,
        private readonly IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Explicit admin guard — defence-in-depth on top of the framework middleware.
     * Returns a 403 DataResponse if the current user is not an NC admin, null otherwise.
     */
    private function requireAdmin(): ?DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null || !$this->groupManager->isAdmin($user->getUID())) {
            return new DataResponse(['error' => 'Admin access required'], Http::STATUS_FORBIDDEN);
        }
        return null;
    }

    /**
     * Demo-mode guard — font management must not fire against shared demo infrastructure.
     * Returns a 403 DataResponse in demo mode, null otherwise.
     */
    private function requireNotDemo(): ?DataResponse {
        if ($this->appConfig->useDemo()) {
            return new DataResponse(['error' => 'Font management is not available in demo mode'], Http::STATUS_FORBIDDEN);
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Build the base URL for the AdminPanel fonts API.
     * Uses the internal DS URL so the request stays server-side.
     */
    private function fontsApiBase(): string {
        $dsUrl = $this->appConfig->getDocumentServerInternalUrl();
        if (empty($dsUrl)) {
            $dsUrl = $this->appConfig->getDocumentServerUrl();
        }
        return rtrim($dsUrl, '/') . self::ADMIN_FONTS_PATH;
    }

    /**
     * Mint a short-lived JWT signed with the DS secret for server-to-server
     * authentication against the AdminPanel fonts router.
     *
     * @throws \Exception if the JWT secret is not configured
     */
    private function makeServiceToken(): string {
        $secret = $this->appConfig->getDocumentServerSecret();
        if (empty($secret)) {
            throw new \Exception('JWT secret not configured — set the document server secret in EuroOffice settings');
        }
        $now = time();
        $payload = [
            'sub' => 'font-api',
            'iat' => $now,
            'exp' => $now + self::JWT_TTL,
        ];
        return \Firebase\JWT\JWT::encode($payload, $secret, 'HS256');
    }

    /**
     * Common HTTP options for AdminPanel API calls.
     * DocumentService::request() unconditionally sets allow_local_address and
     * handles verify => false for https + getVerifyPeerOff(), so neither is
     * needed here.
     */
    private function httpOpts(array $extra = []): array {
        return array_merge([
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $this->makeServiceToken(),
            ],
        ], $extra);
    }

    /**
     * Forward an error from the AdminPanel API to the client.
     * Tries to decode the JSON body; falls back to a generic message.
     */
    private function proxyError(string $body, int $statusCode): DataResponse {
        $decoded = json_decode($body, true);
        $message = is_array($decoded) && isset($decoded['error'])
            ? $decoded['error']
            : 'DocumentServer error';
        return new DataResponse(['error' => $message], $statusCode);
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * List custom fonts installed on the document server.
     *
     * @return DataResponse  {fonts: [{name, size, modifiedAt}]}
     */
    public function index(): DataResponse {
        if ($err = $this->requireAdmin()) {
            return $err;
        }
        if ($err = $this->requireNotDemo()) {
            return $err;
        }
        try {
            $body = $this->documentService->request(
                $this->fontsApiBase(),
                'get',
                $this->httpOpts()
            );
            return new DataResponse(json_decode($body, true));
        } catch (\Exception $e) {
            $this->logger->error('FontController::index error', ['exception' => $e]);
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Upload a font file to the document server.
     *
     * Expects multipart/form-data with a "font" file field.
     * The file is streamed as application/octet-stream to the AdminPanel
     * via a file handle to avoid loading the entire file into PHP memory.
     *
     * @return DataResponse  {name, size} on success
     */
    public function upload(): DataResponse {
        if ($err = $this->requireAdmin()) {
            return $err;
        }
        if ($err = $this->requireNotDemo()) {
            return $err;
        }

        $file = $this->request->getUploadedFile('font');

        if (empty($file) || $file['error'] !== UPLOAD_ERR_OK) {
            $errMsg = !empty($file) ? ('Upload error code: ' . $file['error']) : 'No file uploaded';
            return new DataResponse(['error' => $errMsg], Http::STATUS_BAD_REQUEST);
        }

        if ($file['size'] > self::MAX_UPLOAD_BYTES) {
            return new DataResponse(
                ['error' => 'Font file exceeds maximum size (20 MiB)'],
                Http::STATUS_REQUEST_ENTITY_TOO_LARGE
            );
        }

        $originalName = basename($file['name']);

        $stream = fopen($file['tmp_name'], 'rb');
        if ($stream === false) {
            return new DataResponse(['error' => 'Failed to read uploaded file'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }

        try {
            $opts = $this->httpOpts();
            $opts['body'] = $stream;
            $opts['headers']['Content-Type'] = 'application/octet-stream';
            $opts['headers']['X-Font-Name']  = rawurlencode($originalName);

            $body = $this->documentService->request(
                $this->fontsApiBase(),
                'post',
                $opts
            );
            return new DataResponse(json_decode($body, true), Http::STATUS_CREATED);
        } catch (\Exception $e) {
            $this->logger->error('FontController::upload error', ['exception' => $e]);
            if (method_exists($e, 'getResponse') && $e->getResponse() !== null) {
                $code = $e->getResponse()->getStatusCode() ?? 500;
                return $this->proxyError((string)($e->getResponse()->getBody() ?? ''), $code);
            }
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    /**
     * Delete a custom font by name.
     *
     * @param string $name  Font filename (e.g. "MyFont.ttf")
     * @return DataResponse  {deleted: name} on success
     */
    public function delete(string $name): DataResponse {
        if ($err = $this->requireAdmin()) {
            return $err;
        }
        if ($err = $this->requireNotDemo()) {
            return $err;
        }

        // Basic sanity — the AdminPanel also validates, but fail early.
        $safeName = basename($name);
        if ($safeName !== $name || empty($safeName)) {
            return new DataResponse(['error' => 'Invalid font name'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $url = $this->fontsApiBase() . '/' . rawurlencode($safeName);
            $body = $this->documentService->request($url, 'delete', $this->httpOpts());
            return new DataResponse(json_decode($body, true));
        } catch (\Exception $e) {
            $this->logger->error('FontController::delete error', ['exception' => $e]);
            if (method_exists($e, 'getResponse') && $e->getResponse() !== null) {
                $code = $e->getResponse()->getStatusCode() ?? 500;
                return $this->proxyError((string)($e->getResponse()->getBody() ?? ''), $code);
            }
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Trigger an async font regeneration on the document server.
     * Returns 202 immediately; the caller should poll getStatus().
     *
     * @return DataResponse  {message, status}
     */
    public function regenerate(): DataResponse {
        if ($err = $this->requireAdmin()) {
            return $err;
        }
        if ($err = $this->requireNotDemo()) {
            return $err;
        }
        try {
            $url = $this->fontsApiBase() . '/regenerate';
            $body = $this->documentService->request($url, 'post', $this->httpOpts());
            return new DataResponse(json_decode($body, true), Http::STATUS_ACCEPTED);
        } catch (\Exception $e) {
            $this->logger->error('FontController::regenerate error', ['exception' => $e]);
            if (method_exists($e, 'getResponse') && $e->getResponse() !== null) {
                $code = $e->getResponse()->getStatusCode() ?? 500;
                return $this->proxyError((string)($e->getResponse()->getBody() ?? ''), $code);
            }
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Poll the font regeneration status on the document server.
     *
     * @return DataResponse  {status, startedAt, finishedAt, error}
     */
    public function getStatus(): DataResponse {
        if ($err = $this->requireAdmin()) {
            return $err;
        }
        if ($err = $this->requireNotDemo()) {
            return $err;
        }
        try {
            $url = $this->fontsApiBase() . '/status';
            $body = $this->documentService->request($url, 'get', $this->httpOpts());
            return new DataResponse(json_decode($body, true));
        } catch (\Exception $e) {
            $this->logger->error('FontController::getStatus error', ['exception' => $e]);
            return new DataResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
}
