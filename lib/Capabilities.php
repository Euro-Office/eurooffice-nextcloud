<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice;

use OCA\Eurooffice\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\Capabilities\ICapability;
use OCP\IURLGenerator;
use OCP\IUserSession;

/**
 * Lets clients such as the desktop editors find out that documents on this
 * server open in Nextcloud Office, and where.
 */
class Capabilities implements ICapability {

    public function __construct(
        private readonly AppConfig $appConfig,
        private readonly IAppManager $appManager,
        private readonly IURLGenerator $urlGenerator,
        private readonly IUserSession $userSession
    ) {}

    /**
     * @return array{eurooffice?: array{version: string, editor: string, config: string, formats: array<string, array{type: string, edit: bool}>}}
     */
    public function getCapabilities(): array {
        $user = $this->userSession->getUser();
        if ($user === null
            || empty($this->appConfig->getDocumentServerUrl())
            || !$this->appConfig->settingsAreSuccessful()
            || !$this->appConfig->isUserAllowedToUse($user->getUID())) {
            return [];
        }

        $formats = [];
        foreach ($this->appConfig->formatsSetting() as $ext => $format) {
            if (empty($format["type"])) {
                continue;
            }
            $formats[$ext] = [
                "type" => $format["type"],
                "edit" => !empty($format["edit"]),
            ];
        }

        // {fileId} stays a placeholder: the route needs some value to build the URL
        $placeholder = "0123456789";
        $editor = $this->urlGenerator->linkToRouteAbsolute(Application::APP_ID . ".editor.index", ["fileId" => $placeholder]);
        $config = $this->urlGenerator->linkToOCSRouteAbsolute(Application::APP_ID . ".editorApi.config", ["fileId" => $placeholder]);

        return [
            Application::APP_ID => [
                "version" => $this->appManager->getAppVersion(Application::APP_ID),
                "editor" => str_replace($placeholder, "{fileId}", $editor),
                "config" => str_replace($placeholder, "{fileId}", $config),
                "formats" => $formats,
            ],
        ];
    }
}
