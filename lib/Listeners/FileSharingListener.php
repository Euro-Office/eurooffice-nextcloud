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

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\SettingsData;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Server;
use OCP\Util;

/**
 * File Sharing listener
 */
class FileSharingListener implements IEventListener {

    public function __construct(
        private readonly AppConfig $appConfig,
        private readonly IInitialState $initialState
    ) {}

    public function handle(Event $event): void {
        if (!$event instanceof BeforeTemplateRenderedEvent) {
            return;
        }

        if (!empty($this->appConfig->getDocumentServerUrl())
            && $this->appConfig->settingsAreSuccessful()) {
            $shareType = "";
            if (method_exists($event, "getShare")) {
                $share = $event->getShare();
                $shareType = $share->getNodeType();

                $sharedBy = $share->getSharedBy();
                if (!$this->appConfig->isUserAllowedToUse($sharedBy)) {
                    return;
                }
            }

            if ($this->appConfig->getSameTab() || $shareType === "file") {
                Util::addScript("eurooffice", "eurooffice-listener");
                // Styles for the bundle above; it renders the Smart Picker modal, which
                // is unstyled and full-frame without them.
                Util::addStyle("eurooffice", "eurooffice-listener");
            }

            $this->initialState->provideLazyInitialState("settings", fn() => Server::get(SettingsData::class));

            Util::addScript("eurooffice", "eurooffice-main");
            Util::addScript("eurooffice", "eurooffice-template");
            Util::addStyle("eurooffice", "main");
            Util::addStyle("eurooffice", "format");
        }
    }
}
