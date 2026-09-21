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

/**
 * Unit test bootstrap.
 *
 * The suite runs standalone: the OCP interfaces come from the nextcloud/ocp
 * dev dependency, so no Nextcloud server checkout is required.
 */
require_once __DIR__ . "/../vendor/autoload.php";

/**
 * Register the OCP stubs here instead of in composer's autoload-dev.
 *
 * "composer dump-autoload" merges autoload-dev into the very same generated
 * autoload files, so an "OCP\\" entry there ends up in the app's
 * vendor/autoload.php. Nextcloud loads that file for every app on every
 * request, which would make the stubs shadow the real OCP classes and take the
 * whole instance down. Registering them from the test bootstrap keeps them
 * confined to PHPUnit runs.
 */
spl_autoload_register(static function (string $class): void {
    $prefixes = [
        "OCP\\" => __DIR__ . "/../vendor/nextcloud/ocp/OCP/",
        "NCU\\" => __DIR__ . "/../vendor/nextcloud/ocp/NCU/"
    ];

    foreach ($prefixes as $prefix => $dir) {
        if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
            continue;
        }

        $relative = substr($class, strlen($prefix));
        $file = $dir . str_replace("\\", "/", $relative) . ".php";
        if (is_file($file)) {
            require_once $file;
        }

        return;
    }
});
