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

namespace OCA\Eurooffice\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent as HttpBeforeTemplateRenderedEvent;
use OCP\DirectEditing\RegisterDirectEditorEvent;
use OCP\Files\Template\FileCreatedFromTemplateEvent;
use OCP\Files\Template\RegisterTemplateCreatorEvent;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\Files_Versions\Events\VersionRestoredEvent;
use OCA\Viewer\Event\LoadViewer;
use OCA\Eurooffice\AppConfig;
use OCA\Eurooffice\Controller\JobListController;
use OCA\Eurooffice\Listeners\CreateFromTemplateListener;
use OCA\Eurooffice\Listeners\FilesListener;
use OCA\Eurooffice\Listeners\FileSharingListener;
use OCA\Eurooffice\Listeners\DirectEditorListener;
use OCA\Eurooffice\Listeners\RegisterTemplateCreatorListener;
use OCA\Eurooffice\Listeners\ViewerListener;
use OCA\Eurooffice\Listeners\WidgetListener;
use OCA\Eurooffice\Events\DocumentUnsavedEvent;
use OCA\Eurooffice\Hooks;
use OCA\Eurooffice\Listeners\ContentSecurityPolicyListener;
use OCA\Eurooffice\Listeners\DocumentUnsavedListener;
use OCA\Eurooffice\Listeners\FileListener;
use OCA\Eurooffice\Listeners\FileVersionsListener;
use OCA\Eurooffice\Listeners\ShareListener;
use OCA\Eurooffice\Listeners\UserListener;
use OCA\Eurooffice\Notifier;
use OCA\Eurooffice\Preview;
use OCA\Eurooffice\TemplateProvider;
use OCA\Eurooffice\Vendor\Firebase\JWT\JWT;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Share\Events\ShareDeletedEvent;
use OCP\User\Events\UserDeletedEvent;
use OCP\Server;

class Application extends App implements IBootstrap {
    public const APP_ID = "eurooffice";

    private readonly AppConfig $appConfig;

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);

        $this->appConfig = Server::get(AppConfig::class);
    }

    public function register(IRegistrationContext $context): void {
        // Set the leeway for the JWT library in case the system clock is a second off
        JWT::$leeway = $this->appConfig->getJwtLeeway();

        $context->registerEventListener(FileCreatedFromTemplateEvent::class, CreateFromTemplateListener::class);
        $context->registerEventListener(LoadAdditionalScriptsEvent::class, FilesListener::class);
        $context->registerEventListener(RegisterDirectEditorEvent::class, DirectEditorListener::class);
        $context->registerEventListener(LoadViewer::class, ViewerListener::class);
        $context->registerEventListener(AddContentSecurityPolicyEvent::class, ContentSecurityPolicyListener::class);
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, FileSharingListener::class);
        $context->registerEventListener(HttpBeforeTemplateRenderedEvent::class, WidgetListener::class);
        $context->registerEventListener(DocumentUnsavedEvent::class, DocumentUnsavedListener::class);
        $context->registerEventListener(NodeDeletedEvent::class, FileListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FileListener::class);
        $context->registerEventListener(ShareDeletedEvent::class, ShareListener::class);
        $context->registerEventListener(UserDeletedEvent::class, UserListener::class);
        $context->registerEventListener(VersionRestoredEvent::class, FileVersionsListener::class);
        $context->registerEventListener(RegisterTemplateCreatorEvent::class, RegisterTemplateCreatorListener::class);

        if (interface_exists(\OCP\Files\Template\ICustomTemplateProvider::class)) {
            $context->registerTemplateProvider(TemplateProvider::class);
        }

        $context->registerPreviewProvider(Preview::class, Preview::getMimeTypeRegex());
        $context->registerNotifierService(Notifier::class);

        Server::get(JobListController::class)->checkAllJobs();
        Hooks::connectHooks();
    }

    public function boot(IBootContext $context): void {
    }
}
