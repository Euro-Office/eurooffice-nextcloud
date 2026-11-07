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

use OCP\App\IAppManager;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Template\FileCreatedFromTemplateEvent;

use OCA\Eurooffice\TemplateFields;
use OCA\Eurooffice\TemplateManager;
use Psr\Log\LoggerInterface;

/**
 * CreateFromTemplate listener
 */
class CreateFromTemplateListener implements IEventListener {

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly IAppManager $appManager,
    ) {}

    public function handle(Event $event): void {
        if (!$event instanceof FileCreatedFromTemplateEvent) {
            return;
        }

        $template = $event->getTemplate();
        $targetFile = $event->getTarget();
        if ($template === null) {
            $templateEmpty = TemplateManager::GetEmptyTemplate($targetFile->getName());
            if ($templateEmpty) {
                $targetFile->putContent($templateEmpty);
            }
            return;
        }

        // The values typed in Nextcloud's template dialog, see BeforeGetTemplatesListener.
        // With richdocuments enabled, its fields and numbering are the ones in the dialog.
        $fields = $event->getTemplateFields();
        if (!empty($fields) && $template->getMimeType() === TemplateFields::MIMETYPE
            && !$this->appManager->isEnabledForUser("richdocuments")) {
            try {
                $targetFile->putContent(TemplateFields::fill($template->getContent(), $fields));
            } catch (\Throwable $e) {
                // A copy of the template without the user's values must not pass for the
                // document they asked for: remove it and let Nextcloud report the failure
                $this->logger->error("Could not fill the template fields of " . $targetFile->getName(), ["exception" => $e]);
                try {
                    $targetFile->delete();
                } catch (\Throwable $deleteError) {
                    $this->logger->error("Could not remove the unfilled file " . $targetFile->getName(), ["exception" => $deleteError]);
                }
                throw new \RuntimeException("Could not fill the template fields", 0, $e);
            }
        }
    }
}
