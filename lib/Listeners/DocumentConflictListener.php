<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Listeners;

use OCA\Eurooffice\AppInfo\Application;
use OCA\Eurooffice\Events\DocumentConflictEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Notification\IManager as NotificationIManager;
use OCP\Notification\IncompleteNotificationException;
use OCP\Notification\InvalidValueException;
use Psr\Log\LoggerInterface;

/**
 * Tells the editing user their changes were saved as a conflict copy
 *
 * @template-implements IEventListener<DocumentConflictEvent>
 */
class DocumentConflictListener implements IEventListener {

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly NotificationIManager $notificationManager,
    ) {}

    public function handle(Event $event): void {
        if (!$event instanceof DocumentConflictEvent) {
            return;
        }

        try {
            $notification = $this->notificationManager->createNotification();
            $notification->setApp(Application::APP_ID)
                ->setObject("document_conflict", (string)$event->getCopyId())
                ->setUser($event->getUserId());
            // Later callbacks of the session update the same copy: replace the earlier notice.
            $this->notificationManager->markProcessed($notification);

            $notification->setDateTime(new \DateTime())
                ->setSubject("document_conflict", [
                    "fileId" => $event->getFileId(),
                    "fileName" => $event->getFileName(),
                    "copyId" => $event->getCopyId(),
                    "copyName" => $event->getCopyName(),
                ]);
            $this->notificationManager->notify($notification);
        } catch (InvalidValueException | IncompleteNotificationException $e) {
            $this->logger->error("Invalid value for notification provided: " . $e->getMessage(), ["exception" => $e]);
        }
    }
}
