<?php
/**
 *
 * (c) Copyright Ascensio System SIA 2026
 *
 * This program is a free software product.
 * You can redistribute it and/or modify it under the terms of the GNU Affero General Public License
 * (AGPL) version 3 as published by the Free Software Foundation.
 * In accordance with Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * For details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The interactive user interfaces in modified source and object code versions of the Program
 * must display Appropriate Legal Notices, as required under Section 5 of the GNU AGPL version 3.
 *
 *
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

namespace OCA\Eurooffice\Listeners;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\FileUtility;
use OCA\Eurooffice\SettingsData;
use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IRequest;
use OCP\Server;
use OCP\Util;

/**
 * Viewer listener
 */
class ViewerListener implements IEventListener {

    public function __construct(
        private readonly AppConfig $appConfig,
        private readonly IInitialState $initialState,
        private readonly IRequest $request,
        private readonly FileUtility $fileUtility
    ) {}

    public function handle(Event $event): void {
        if (!$event instanceof LoadViewer) {
            return;
        }

        if (!empty($this->appConfig->getDocumentServerUrl())
            && $this->appConfig->settingsAreSuccessful()
            && $this->isAllowedToUse()) {
            Util::addScript("eurooffice", "eurooffice-viewer", "viewer");
            Util::addScript("eurooffice", "eurooffice-listener", "viewer");

            Util::addStyle("eurooffice", "viewer");
            Util::addStyle("eurooffice", "format");

            $this->initialState->provideLazyInitialState("settings", fn() => Server::get(SettingsData::class));
        }
    }

    /**
     * Whether the current user, or the sharer of a public link, may use the app
     */
    private function isAllowedToUse(): bool {
        if ($this->appConfig->isUserAllowedToUse()) {
            return true;
        }

        $shareToken = $this->request->getParam("token");
        if (!is_string($shareToken) || $shareToken === "") {
            return false;
        }

        [$share] = $this->fileUtility->getShare($shareToken);
        return $share !== null && $this->appConfig->isUserAllowedToUse($share->getSharedBy());
    }
}
