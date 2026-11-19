<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Events;

use OCP\EventDispatcher\Event;

/**
 * An editor save went to a conflict copy because the file changed outside the editor session
 */
class DocumentConflictEvent extends Event {

    public function __construct(
        private readonly string $userId,
        private readonly int $fileId,
        private readonly string $fileName,
        private readonly int $copyId,
        private readonly string $copyName,
    ) {
        parent::__construct();
    }

    public function getUserId(): string {
        return $this->userId;
    }

    public function getFileId(): int {
        return $this->fileId;
    }

    public function getFileName(): string {
        return $this->fileName;
    }

    public function getCopyId(): int {
        return $this->copyId;
    }

    public function getCopyName(): string {
        return $this->copyName;
    }
}
