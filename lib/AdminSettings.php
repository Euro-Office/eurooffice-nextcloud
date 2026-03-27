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
 * All the Product's GUI elements, including illustrations and icon sets, as well as technical
 * writing content are licensed under the terms of the Creative Commons Attribution-ShareAlike 4.0 International.
 * See the License terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

namespace OCA\Eurooffice;

use OCA\Eurooffice\AppInfo\Application;
use OCA\Eurooffice\Controller\SettingsController;
use OCP\Settings\ISettings;

/**
 * Settings controller for the administration page
 */
class AdminSettings implements ISettings {

    public function __construct() {
    }

    /**
     * Print config section
     *
     * @return TemplateResponse
     */
    public function getForm() {
        $app = \OC::$server->query(Application::class);
        $container = $app->getContainer();
        $response = $container->query(SettingsController::class)->index();
        return $response;
    }

    /**
     * Get section ID
     *
     * @return string
     */
    public function getSection() {
        return "eurooffice";
    }

    /**
     * Get priority order
     *
     * @return int
     */
    public function getPriority() {
        return 50;
    }
}
