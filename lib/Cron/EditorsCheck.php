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
use Psr\Log\LoggerInterface;

/**
 * Editors availability check background job
 *
 */
class EditorsCheck extends TimedJob {

    public function __construct(
        ITimeFactory $time,
        private readonly string $appName,
        private readonly IURLGenerator $urlGenerator,
        private readonly AppConfig $appConfig,
        private readonly IL10N $trans,
        private readonly IGroupManager $groupManager,
        private readonly EmailManager $emailManager,
        private readonly LoggerInterface $logger,
        private readonly DocumentService $documentService
    ) {
        parent::__construct($time);

        $interval = $this->appConfig->getEditorsCheckInterval();
        if ($interval > 0 && !$this->appConfig->settingsAreSuccessful()) {
            // Recheck more often while down, so recovery is detected soon
            // after the document server actually comes back rather than
            // waiting for the next regularly scheduled check - but never
            // overriding an admin who disabled the check entirely (interval
            // of 0). Nextcloud reconstructs background jobs on every cron.php
            // run, so this is re-evaluated on each run rather than fixed at
            // registration time.
            $interval = min($interval, $this->appConfig->getEditorsCheckFailedInterval());
        }
        $this->setInterval($interval);

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

        $wasSuccessful = $this->appConfig->settingsAreSuccessful();

        [$error, $version] = $this->documentService->checkDocServiceUrl();

        if (!empty($error)) {
            $this->logger->info("Nextcloud Office server is not available");
            $this->appConfig->setSettingsError($error);
            if ($wasSuccessful) {
                $this->notifyAdmins();
            }
        } else {
            $this->logger->debug("Nextcloud Office server availability check is finished successfully");
            if (!$wasSuccessful) {
                $this->logger->info("Nextcloud Office server is available again, error state cleared");
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
     * Fetch the notification manager - overridable in tests, since it's
     * otherwise only reachable via the static service locator.
     */
    protected function getNotificationManager(): \OCP\Notification\IManager {
        return \OCP\Server::get(\OCP\Notification\IManager::class);
    }

    /**
     * Build an unsent notification identifying the "server is not
     * available" alert, without a user set - shared by notifyAdmins() and
     * dismissAdminNotifications() so both always refer to the exact same
     * notification identity.
     */
    private function buildUnavailableNotification(\OCP\Notification\IManager $notificationManager): \OCP\Notification\INotification {
        $notification = $notificationManager->createNotification();
        $notification->setApp($this->appName)
            ->setDateTime(new \DateTime())
            ->setObject("editorsCheck", $this->trans->t("Nextcloud Office server is not available"))
            ->setSubject("editorscheck_info");
        return $notification;
    }

    /**
     * Send notification to admins
     */
    private function notifyAdmins(): void {
        $notificationManager = $this->getNotificationManager();
        $notification = $this->buildUnavailableNotification($notificationManager);
        foreach ($this->getUsersToNotify() as $uid) {
            $notification->setUser($uid);
            $notificationManager->notify($notification);
            if ($this->appConfig->getEmailNotifications()) {
                $this->emailManager->notifyEditorsCheckEmail($uid);
            }
        }
    }

    /**
     * Dismiss the "server is not available" notification for every admin
     * who received it, once the document server is reachable again - so a
     * recovered connection doesn't leave a stale alert behind. Omitting the
     * user on the notification (unlike notifyAdmins()) marks it processed
     * for all users that have it, not just one.
     */
    private function dismissAdminNotifications(): void {
        $notificationManager = $this->getNotificationManager();
        $notification = $this->buildUnavailableNotification($notificationManager);
        $notificationManager->markProcessed($notification);
    }
}
