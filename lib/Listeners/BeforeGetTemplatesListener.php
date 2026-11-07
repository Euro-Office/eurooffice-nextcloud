<?php

declare(strict_types=1);

/**
 *
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or a Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 */

namespace OCA\Eurooffice\Listeners;

use OCA\Eurooffice\TemplateFields;
use OCP\App\IAppManager;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\Template\BeforeGetTemplatesEvent;
use OCP\Files\Template\FieldFactory;
use OCP\Files\Template\FieldType;
use OCP\Files\Template\InvalidFieldTypeException;
use OCP\ICacheFactory;
use Psr\Log\LoggerInterface;

/**
 * Reports the content controls of .docx templates as template fields, so that
 * Nextcloud asks for their values when a file is created from the template.
 *
 * @template-implements IEventListener<BeforeGetTemplatesEvent|Event>
 */
class BeforeGetTemplatesListener implements IEventListener {

    public function __construct(
        private readonly IRootFolder $rootFolder,
        private readonly ICacheFactory $cacheFactory,
        private readonly LoggerInterface $logger,
        private readonly IAppManager $appManager,
    ) {}

    /**
     * Set the fields of each .docx template when Nextcloud asks for them.
     */
    public function handle(Event $event): void {
        if (!$event instanceof BeforeGetTemplatesEvent || !$event->shouldGetFields()) {
            return;
        }
        // richdocuments numbers the same fields differently; let it handle them alone
        if ($this->appManager->isEnabledForUser("richdocuments")) {
            return;
        }

        $cache = $this->cacheFactory->createLocal("eurooffice_template_fields/");
        foreach ($event->getTemplates() as $template) {
            $fileId = (int)($template->jsonSerialize()["fileid"] ?? 0);
            $file = $fileId > 0 ? $this->rootFolder->getFirstNodeById($fileId) : null;
            if (!$file instanceof File || $file->getMimeType() !== TemplateFields::MIMETYPE) {
                continue;
            }

            try {
                $cacheKey = $file->getId() . "/" . $file->getEtag();
                $descriptors = $cache->get($cacheKey);
                if (!is_array($descriptors)) {
                    $descriptors = TemplateFields::extract($file->getContent());
                    $cache->set($cacheKey, $descriptors, 3600);
                }
                $template->setFields($this->toFields($descriptors));
            } catch (\Throwable $e) {
                $this->logger->warning("Could not read the fields of template " . $fileId, ["exception" => $e]);
            }
        }
    }

    /**
     * @return \OCP\Files\Template\Field[]
     */
    private function toFields(array $descriptors): array {
        $fields = [];
        foreach ($descriptors as $descriptor) {
            $type = FieldType::tryFrom($descriptor["type"]);
            if ($type === null) {
                continue;
            }
            try {
                $field = FieldFactory::createField($descriptor["index"], $type);
            } catch (InvalidFieldTypeException) {
                continue;
            }
            $field->alias = $descriptor["alias"];
            $field->tag = $descriptor["tag"];
            $field->id = $descriptor["id"];
            $field->setValue($type === FieldType::CheckBox ? (bool)$descriptor["checked"] : (string)$descriptor["content"]);
            $fields[] = $field;
        }

        return $fields;
    }
}
