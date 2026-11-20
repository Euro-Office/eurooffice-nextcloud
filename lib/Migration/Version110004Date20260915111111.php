<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH or an Nextcloud affiliate company and Euro-Office contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Eurooffice\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IAppConfig;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Remove pdf from the stored defFormats app-config value.
 *
 * Without a stored value, PDF opens in files_pdfviewer when that app is
 * enabled and in Euro-Office otherwise (AppConfig::formatsSetting). Leaving
 * pdf: true in defFormats on instances whose admin saved settings before
 * this change would silently override that default.
 */
class Version110004Date20260915111111 extends SimpleMigrationStep {

    public function __construct(
        private IAppConfig $appConfig,
    ) {
    }

    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        return null;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $appName = 'eurooffice';
        $key = 'defFormats';

        $raw = $this->appConfig->getValueString($appName, $key, '');
        if (empty($raw)) {
            return;
        }

        $formats = json_decode($raw, true);
        if (!is_array($formats) || !array_key_exists('pdf', $formats)) {
            return;
        }

        unset($formats['pdf']);
        $this->appConfig->setValueString($appName, $key, json_encode($formats));
        $output->info('Removed pdf from eurooffice defFormats');
    }
}
