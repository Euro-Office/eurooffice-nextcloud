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

namespace OCA\Eurooffice\Controller;

use OCA\Eurooffice\AdminSettingsSecurity;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\DocumentService;
use OCA\Eurooffice\FileVersions;
use OCA\Eurooffice\TemplateManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Preview\IMimeIconProvider;

/**
 * Settings controller for the administration page
 */
class SettingsController extends Controller {

    public function __construct(
        $appName,
        IRequest $request,
        private readonly IURLGenerator $urlGenerator,
        private readonly IL10N $trans,
        private readonly AppConfig $appConfig,
        private readonly IMimeIconProvider $mimeIconProvider,
        private readonly DocumentService $documentService
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Print config section
     */
    public function index(): TemplateResponse {
        $data = array_merge(
            $this->getConnectionStateData(),
            $this->getAddressData(),
            $this->getCommonData()
        );
        return new TemplateResponse($this->appName, "settings", $data, "blank");
    }

    /**
     * Print the "Common templates" config section
     *
     * Rendered as a separate admin settings form so that it can be delegated
     * independently of the server and common settings.
     */
    public function indexTemplates(): TemplateResponse {
        $data = array_merge(
            $this->getConnectionStateData(),
            $this->getTemplatesData()
        );
        return new TemplateResponse($this->appName, "settings-templates", $data, "blank");
    }

    /**
     * Print the "Security" config section
     *
     * Rendered as a separate admin settings form so that it can be delegated
     * independently of the server and common settings.
     */
    public function indexSecurity(): TemplateResponse {
        $data = array_merge(
            $this->getConnectionStateData(),
            $this->getSecurityData()
        );
        return new TemplateResponse($this->appName, "settings-security", $data, "blank");
    }

    /**
     * Document server connection state shared by every settings form.
     *
     * Each form uses these to decide whether it renders visible or hidden,
     * so they have to be present in every template fragment.
     */
    private function getConnectionStateData(): array {
        return [
            "documentserver" => $this->appConfig->getDocumentServerUrl(true),
            "demo" => $this->appConfig->getDemoData(),
            "successful" => $this->appConfig->settingsAreSuccessful()
        ];
    }

    /**
     * Data of the "Server settings" form
     */
    private function getAddressData(): array {
        return [
            "documentserverInternal" => $this->appConfig->getDocumentServerInternalUrl(true),
            "storageUrl" => $this->appConfig->getStorageUrl(),
            "verifyPeerOff" => $this->appConfig->getVerifyPeerOff(),
            "secret" => $this->appConfig->getDocumentServerSecret(true),
            "jwtHeader" => $this->appConfig->jwtHeader(true),
            "currentServer" => $this->urlGenerator->getAbsoluteURL("/")
        ];
    }

    /**
     * Data of the "Common settings" form, including editor customization and custom fonts
     */
    private function getCommonData(): array {
        return [
            "formats" => $this->appConfig->formatsSetting(),
            "sameTab" => $this->appConfig->getSameTab(),
            "enableSharing" => $this->appConfig->getEnableSharing(),
            "preview" => $this->appConfig->getPreview(),
            "advanced" => $this->appConfig->getAdvanced(),
            "cronChecker" => $this->appConfig->getCronChecker(),
            "emailNotifications" => $this->appConfig->getEmailNotifications(),
            "versionHistory" => $this->appConfig->getVersionHistory(),
            "limitGroups" => $this->appConfig->getLimitGroups(),
            "chat" => $this->appConfig->getCustomizationChat(),
            "compactHeader" => $this->appConfig->getCustomizationCompactHeader(),
            "feedback" => $this->appConfig->getCustomizationFeedback(),
            "forcesave" => $this->appConfig->getCustomizationForcesave(),
            "liveViewOnShare" => $this->appConfig->getLiveViewOnShare(),
            "help" => $this->appConfig->getCustomizationHelp(),
            "reviewDisplay" => $this->appConfig->getCustomizationReviewDisplay(),
            "theme" => $this->appConfig->getCustomizationTheme(true),
            "unknownAuthor" => $this->appConfig->getUnknownAuthor()
        ];
    }

    /**
     * Data of the "Common templates" form
     */
    private function getTemplatesData(): array {
        return [
            "templates" => $this->getGlobalTemplates()
        ];
    }

    /**
     * Data of the "Security" form
     */
    private function getSecurityData(): array {
        return [
            "protection" => $this->appConfig->getProtection(),
            "settingsError" => $this->appConfig->getSettingsError(),
            "watermark" => $this->appConfig->getWatermarkSettings(),
            "plugins" => $this->appConfig->getCustomizationPlugins(),
            "macros" => $this->appConfig->getCustomizationMacros(),
            "tagsEnabled" => \OCP\Server::get(\OCP\App\IAppManager::class)->isEnabledForUser("systemtags")
        ];
    }

    /**
     * Save address settings
     *
     * @param string $documentserver - document service address
     * @param string $documentserverInternal - document service address available from Nextcloud
     * @param string $storageUrl - Nextcloud address available from document server
     * @param bool $verifyPeerOff - parameter verification setting
     * @param string $secret - secret key for signature
     * @param string $jwtHeader - jwt header
     * @param bool $demo - use demo server
     */
    public function saveAddress(
        $documentserver,
        $documentserverInternal,
        $storageUrl,
        $verifyPeerOff,
        $secret,
        $jwtHeader,
        $demo
    ): DataResponse {
        $error = null;
        if (!$this->appConfig->selectDemo($demo === true)) {
            $error = $this->trans->t("The 30-day test period is over, you can no longer connect to demo Nextcloud Office server.");
        }
        if ($demo !== true) {
            $this->appConfig->setDocumentServerUrl($documentserver);
            $this->appConfig->setVerifyPeerOff($verifyPeerOff);
            $this->appConfig->setDocumentServerInternalUrl($documentserverInternal);
            $this->appConfig->setDocumentServerSecret($secret);
            $this->appConfig->setJwtHeader($jwtHeader);
        }
        $this->appConfig->setStorageUrl($storageUrl);

        $version = null;
        if (empty($error)) {
            $documentserver = $this->appConfig->getDocumentServerUrl();
            if (!empty($documentserver)) {
                [$error, $version] = $this->documentService->checkDocServiceUrl();
                $this->appConfig->setSettingsError($error);
            }
        }

        return new DataResponse([
            "documentserver" => $this->appConfig->getDocumentServerUrl(true),
            "verifyPeerOff" => $this->appConfig->getVerifyPeerOff(),
            "documentserverInternal" => $this->appConfig->getDocumentServerInternalUrl(true),
            "storageUrl" => $this->appConfig->getStorageUrl(),
            "secret" => $this->appConfig->getDocumentServerSecret(true),
            "jwtHeader" => $this->appConfig->jwtHeader(true),
            "error" => $error,
            "version" => $version,
        ]);
    }

    /**
     * Save common settings
     *
     * @param array $defFormats - formats array with default action
     * @param array $editFormats - editable formats array
     * @param bool $sameTab - open in the same tab
     * @param bool $enableSharing - enable sharingsameTab
     * @param bool $preview - generate preview files
     * @param bool $advanced - use advanced tab
     * @param bool $cronChecker - disable cron checker
     * @param bool $emailNotifications - notifications via e-mail
     * @param bool $versionHistory - keep version history
     * @param array $limitGroups - list of groups
     * @param bool $chat - display chat
     * @param bool $compactHeader - display compact header
     * @param bool $feedback - display feedback
     * @param bool $forcesave - forcesave
     * @param bool $liveViewOnShare - live view on share
     * @param bool $help - display help
     * @param string $reviewDisplay - review viewing mode
     * @param string $unknownAuthor - display unknown author
     */
    public function saveCommon(
        array $defFormats,
        array $editFormats,
        bool $sameTab,
        bool $enableSharing,
        bool $preview,
        bool $advanced,
        bool $cronChecker,
        bool $emailNotifications,
        bool $versionHistory,
        bool $chat,
        bool $compactHeader,
        bool $feedback,
        bool $forcesave,
        bool $liveViewOnShare,
        bool $help,
        string $reviewDisplay,
        string $theme,
        string $unknownAuthor,
        array $limitGroups = []
    ): DataResponse {

        $this->appConfig->setDefaultFormats($defFormats);
        $this->appConfig->setEditableFormats($editFormats);
        $this->appConfig->setEnableSharing($enableSharing);
        $this->appConfig->setSameTab($sameTab);
        $this->appConfig->setPreview($preview);
        $this->appConfig->setAdvanced($advanced);
        $this->appConfig->setCronChecker($cronChecker);
        $this->appConfig->setEmailNotifications($emailNotifications);
        $this->appConfig->setVersionHistory($versionHistory);
        $this->appConfig->setLimitGroups($limitGroups);
        $this->appConfig->setCustomizationChat($chat);
        $this->appConfig->setCustomizationCompactHeader($compactHeader);
        $this->appConfig->setCustomizationFeedback($feedback);
        $this->appConfig->setCustomizationForcesave($forcesave);
        $this->appConfig->setLiveViewOnShare($liveViewOnShare);
        $this->appConfig->setCustomizationHelp($help);
        $this->appConfig->setCustomizationReviewDisplay($reviewDisplay);
        $this->appConfig->setCustomizationTheme($theme);
        $this->appConfig->setUnknownAuthor($unknownAuthor);

        return new DataResponse();
    }

    /**
     * Save security settings
     *
     * @param array $watermarks - watermark settings
     * @param bool $plugins - enable plugins
     * @param bool $macros - run document macros
     * @param string $protection - protection
     */
    #[AuthorizedAdminSetting(settings: AdminSettingsSecurity::class)]
    public function saveSecurity(
        array $watermarks,
        bool $plugins,
        bool $macros,
        string $protection
    ): DataResponse {

        if (AppConfig::isTrue($watermarks["enabled"] ?? false)) {
            $watermarks["text"] = trim((string) ($watermarks["text"] ?? ""));
            if (empty($watermarks["text"])) {
                $watermarks["text"] = $this->trans->t("DO NOT SHARE THIS") . " {userId} {date}";
            }
        }

        $this->appConfig->setWatermarkSettings($watermarks);
        $this->appConfig->setCustomizationPlugins($plugins);
        $this->appConfig->setCustomizationMacros($macros);
        $this->appConfig->setProtection($protection);

        return new DataResponse();
    }

    /**
     * Clear all version history
     *
     * @return DataResponse
     */
    public function clearHistory(): DataResponse {

        FileVersions::clearHistory();

        return new DataResponse();
    }

    /**
     * Get global templates
     */
    private function getGlobalTemplates(): array {
        $templates = [];
        $templatesList = TemplateManager::getGlobalTemplates();

        foreach ($templatesList as $templatesItem) {
            $template = [
                "id" => $templatesItem->getId(),
                "name" => $templatesItem->getName(),
                "type" => TemplateManager::getTypeTemplate($templatesItem->getMimeType()),
                "icon" => $this->mimeIconProvider->getMimeIconUrl($templatesItem->getMimeType())
            ];
            $templates[] = $template;
        }

        return $templates;
    }
}
