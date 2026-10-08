<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Tests\Unit\Cron;

use OCA\Eurooffice\Cron\EditorsCheck;
use OCP\Notification\IManager;

/**
 * Test double exposing the protected run() method and letting a test
 * substitute the notification manager that EditorsCheck would otherwise
 * only reach through the static service locator.
 */
class RecordingEditorsCheck extends EditorsCheck {
    public IManager $injectedNotificationManager;

    protected function getNotificationManager(): IManager {
        return $this->injectedNotificationManager;
    }
}
