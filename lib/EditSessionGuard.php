<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice;

use OCA\Eurooffice\AppInfo\Application;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotPermittedException;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\Share\IShare;

/**
 * Keeps a save from an editor session that no longer matches the file from overwriting it.
 */
class EditSessionGuard {

    /**
     * How long later callbacks of a session reuse its conflict copy
     */
    private const COPY_TTL = 24 * 3600;

    private readonly ICache $cache;

    public function __construct(
        private readonly KeyManager $keyManager,
        private readonly ITimeFactory $timeFactory,
        ICacheFactory $cacheFactory,
    ) {
        $this->cache = $cacheFactory->createDistributed(Application::APP_ID . "-conflict");
    }

    /**
     * Whether the file was written outside the editor session holding $sessionKey since it opened.
     *
     * FileListener drops the key row on every write the connector does not make itself, and the
     * next open stores a new key, so a missing or different row means the session is stale.
     * DocumentServer gets the stored key through generateRevisionId(), hence the comparison.
     *
     * @param int $fileId - file identifier
     * @param string $sessionKey - document key from the callback
     */
    public function isStale(int $fileId, string $sessionKey): bool {
        $key = $this->keyManager->get($fileId);

        return $key === "" || DocumentService::generateRevisionId($key) !== $sessionKey;
    }

    /**
     * Save the session's content next to the file. Later callbacks of the same session (each
     * forcesave, then the close-save) update the copy the first one created.
     *
     * @param File $file - file the session was opened on
     * @param string $sessionKey - document key from the callback
     * @param string $content - document content from DocumentServer
     * @param IShare|null $share - share link the session was opened through
     *
     * @throws NotPermittedException
     */
    public function saveConflictCopy(File $file, string $sessionKey, string $content, ?IShare $share = null): File {
        $folder = $file->getParent();
        if (!$folder->isCreatable() || ($share !== null && !$this->shareAllowsCopyIn($share, $folder))) {
            throw new NotPermittedException("Can't create a conflict copy of " . $file->getName());
        }

        $cacheKey = $file->getId() . "_" . $sessionKey;

        $copyId = $this->cache->get($cacheKey);
        if (is_numeric($copyId)) {
            $copy = $folder->getFirstNodeById((int)$copyId);
            if ($copy instanceof File) {
                $copy->putContent($content);
                return $copy;
            }
        }

        $copy = $folder->newFile($folder->getNonExistingName($this->copyName($file->getName())), $content);
        $this->cache->set($cacheKey, $copy->getId(), self::COPY_TTL);

        return $copy;
    }

    /**
     * A share link resolves the file in the owner's view, where its folder is creatable even
     * when it lies outside the share or the share does not allow creating files.
     */
    private function shareAllowsCopyIn(IShare $share, Folder $folder): bool {
        if (($share->getPermissions() & Constants::PERMISSION_CREATE) === 0) {
            return false;
        }

        $root = $share->getNode();

        return $root instanceof Folder
            && ($folder->getPath() === $root->getPath() || str_starts_with($folder->getPath(), $root->getPath() . "/"));
    }

    /**
     * Name pattern the desktop client uses for its own conflict copies
     */
    private function copyName(string $fileName): string {
        $info = pathinfo($fileName);
        $suffix = " (conflicted copy " . $this->timeFactory->getDateTime()->format("Y-m-d His") . ")";

        return $info["filename"] . $suffix . (isset($info["extension"]) ? "." . $info["extension"] : "");
    }
}
