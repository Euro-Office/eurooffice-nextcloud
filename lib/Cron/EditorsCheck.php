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

namespace OCA\Eurooffice\Cron;

use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\EmailManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\TimedJob;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Notification\IManager as INotificationManager;
use Psr\Log\LoggerInterface;

class EditorsCheck extends TimedJob {

    /**
     * Stable object id used to correlate the failure notification with its
     * later dismissal. Must not be a translated string, otherwise the id can
     * drift between ticks (cron resolves the server default language) and
     * markProcessed() would match nothing.
     */
    private const OBJECT_ID_UNAVAILABLE = "server_unavailable";

    public function __construct(
        ITimeFactory $time,
        private readonly string $appName,
        private readonly IURLGenerator $urlGenerator,
        private readonly AppConfig $appConfig,
        private readonly IL10N $trans,
        private readonly IGroupManager $groupManager,
        private readonly EmailManager $emailManager,
        private readonly LoggerInterface $logger,
        private readonly DocumentService $documentService,
        private readonly INotificationManager $notificationManager,
    ) {
        parent::__construct($time);
        $this->setInterval($this->appConfig->getEditorsCheckInterval());
        $this->setTimeSensitivity(IJob::TIME_SENSITIVE);
    }

    /**
     * Makes the background check
     *
     * @param array $argument unused argument
     */
    protected function run($argument): void {
        if (empty($this->appConfig->getDocumentServerUrl())) {
            $this->logger->debug("Settings are empty");
            return;
        }
        $fileUrl = $this->urlGenerator->linkToRouteAbsolute($this->appName . ".callback.emptyfile");
        if (!$this->appConfig->useDemo() && !empty($this->appConfig->getStorageUrl())) {
            $fileUrl = str_replace($this->urlGenerator->getAbsoluteURL("/"), $this->appConfig->getStorageUrl(), $fileUrl);
        }
        $host = parse_url((string) $fileUrl)["host"];
        if ($host === "localhost" || $host === "127.0.0.1") {
            $this->logger->debug("Localhost is not alowed for cron editors availability check. Please provide server address for internal requests from Nextcloud Office Docs");
            return;
        }

        $this->logger->debug("Nextcloud Office check started by cron");

        [$error, $version] = $this->documentService->checkDocServiceUrl();

        if (!empty($error)) {
            $this->logger->info("Nextcloud Office server is not available");
            $isNewFailure = $this->appConfig->settingsAreSuccessful();
            $this->appConfig->setSettingsError($error);
            if ($isNewFailure) {
                $this->notifyAdmins();
            }
        } else {
            $this->logger->debug("Nextcloud Office server availability check is finished successfully");
            if (!$this->appConfig->settingsAreSuccessful()) {
                $this->appConfig->setSettingsError("");
                $this->dismissAdminNotifications();
            }
        }
    }

    /**
     * Get the list of users to notify
     *
     * @return string[]
     */
    private function getUsersToNotify(): array {
        $notifyGroups = ["admin"];
        $notifyUsers = [];

        foreach ($notifyGroups as $notifyGroup) {
            $group = $this->groupManager->get($notifyGroup);
            if ($group === null || !($group instanceof IGroup)) {
                continue;
            }
            $users = $group->getUsers();
            foreach ($users as $user) {
                $notifyUsers[] = $user->getUID();
            }
        }
        return $notifyUsers;
    }

    /**
     * Dismiss notifications for admins when the server becomes available again
     */
    private function dismissAdminNotifications(): void {
        $notification = $this->notificationManager->createNotification();
        $notification->setApp($this->appName)
            ->setObject("editorsCheck", self::OBJECT_ID_UNAVAILABLE);
        foreach ($this->getUsersToNotify() as $uid) {
            $notification->setUser($uid);
            $this->notificationManager->markProcessed($notification);
        }
    }

    /**
     * Send notification to admins
     */
    private function notifyAdmins(): void {
        $serverUrl = $this->appConfig->getDocumentServerUrl();
        $notification = $this->notificationManager->createNotification();
        $notification->setApp($this->appName)
            ->setDateTime(new \DateTime())
            ->setObject("editorsCheck", self::OBJECT_ID_UNAVAILABLE)
            ->setSubject("editorscheck_info", ["serverUrl" => $serverUrl]);
        foreach ($this->getUsersToNotify() as $uid) {
            $notification->setUser($uid);
            $this->notificationManager->notify($notification);
            if ($this->appConfig->getEmailNotifications()) {
                $this->emailManager->notifyEditorsCheckEmail($uid, $serverUrl);
            }
        }
    }
}
