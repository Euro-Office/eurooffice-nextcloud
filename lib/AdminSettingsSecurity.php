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

namespace OCA\Eurooffice;

use OCA\Eurooffice\AppInfo\Application;
use OCA\Eurooffice\Controller\SettingsController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\L10N\IFactory;
use OCP\Server;
use OCP\Settings\IDelegatedSettings;

/**
 * Delegatable settings for the security administration form
 */
class AdminSettingsSecurity implements IDelegatedSettings {

    private IL10N $l10n;

    /**
     * The app scoped translation has to be resolved explicitly: settings
     * classes are built by the server container, so an injected IL10N would
     * be bound to core instead of this app.
     */
    public function __construct(IFactory $l10nFactory) {
        $this->l10n = $l10nFactory->get(Application::APP_ID);
    }

    /**
     * Print config section
     */
    #[\Override]
    public function getForm(): TemplateResponse {
        $app = Server::get(Application::class);
        $container = $app->getContainer();

        return $container->get(SettingsController::class)->indexSecurity();
    }

    /**
     * Get section ID
     */
    #[\Override]
    public function getSection(): string {
        return "eurooffice";
    }

    /**
     * Get priority order
     */
    #[\Override]
    public function getPriority(): int {
        return 70;
    }

    /**
     * Get the name shown in the admin delegation settings
     */
    #[\Override]
    public function getName(): ?string {
        return $this->l10n->t("Security");
    }

    /**
     * App config keys a delegated admin may manage through the provisioning API.
     *
     * Note the watermark keys live in the "files" app namespace
     * (AppConfig::WATERMARK_APP_NAMESPACE), which is the very same storage the
     * core Files app uses, so authorizing them here also covers core's
     * watermark configuration.
     */
    #[\Override]
    public function getAuthorizedAppConfig(): array {
        return [
            Application::APP_ID => ["/^(protection|customization_macros|customization_plugins)$/"],
            AppConfig::WATERMARK_APP_NAMESPACE => ["/^watermark_.*$/"]
        ];
    }
}
