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

    style("eurooffice", "settings");
    style("eurooffice", "template");
    \OCP\Util::addScript("eurooffice", "eurooffice-settings", 'core');
    \OCP\Util::addScript("eurooffice", "eurooffice-template", 'core');
?>
<div class="section section-eurooffice section-eurooffice-addr">

    <div class="eurooffice-description">
        <h1><?php p($l->t("Welcome to Nextcloud Office!")) ?></h1>
        <p><?php p($l->t("Edit and collaborate on text documents, spreadsheets, presentations, and PDFs within Nextcloud using Nextcloud Office.")) ?></p>
        <div class="useful-links">
            <a href="https://helpcenter.eurooffice.com/integration/nextcloud.aspx" target="_blank"><?php p($l->t("Learn more")) ?></a>
            <a href="https://feedback.eurooffice.com/forums/966080-your-voice-matters?category_id=519288" target="_blank"><?php p($l->t("Suggest a feature")) ?></a>
        </div>
    </div>

    <div id="euroofficeAddrSettings">
        <h2><?php p($l->t("Server settings")) ?></h2>
        <p class="settings-hint"><?php p($l->t("Nextcloud Office Location specifies the address of the server with the document services installed. Please change the '<documentserver>' for the server address in the below line.")) ?></p>

        <p><?php p($l->t("Nextcloud Office address")) ?></p>
        <p><input id="euroofficeUrl" value="<?php p($_["documentserver"]) ?>" placeholder="https://<documentserver>/" type="text"></p>

        <p>
            <input type="checkbox" class="checkbox" id="euroofficeVerifyPeerOff"
                <?php if ($_["verifyPeerOff"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeVerifyPeerOff"><?php p($l->t("Disable certificate verification (insecure)")) ?></label>
        </p>

        <p class="eurooffice-header"><?php p($l->t("Secret key (leave blank to disable)")) ?></p>
        <p class="groupbottom">
            <input id="euroofficeSecret" value="<?php p($_["secret"]) ?>" placeholder="secret" type="password" />
            <input type="checkbox" id="personal-show" class="hidden-visually" name="show" />
            <label id="euroofficeSecret-show" for="personal-show" class="personal-show-label"></label>
        </p>

        <p>
            <a id="euroofficeAdv" class="eurooffice-header">
                <?php p($l->t("Advanced server settings")) ?>
                <span class="icon icon-triangle-s"></span>
            </a>
        </p>
        <div id="euroofficeSecretPanel" class="eurooffice-hide">
            <p class="eurooffice-header"><?php p($l->t("Authorization header (leave blank to use default header)")) ?></p>
            <p><input id="euroofficeJwtHeader" value="<?php p($_["jwtHeader"]) ?>" placeholder="Authorization" type="text"></p>

            <p class="eurooffice-header"><?php p($l->t("Nextcloud Office address for internal requests from the server")) ?></p>
            <p><input id="euroofficeInternalUrl" value="<?php p($_["documentserverInternal"]) ?>" placeholder="https://<documentserver>/" type="text"></p>

            <p class="eurooffice-header"><?php p($l->t("Server address for internal requests from Nextcloud Office")) ?></p>
            <p><input id="euroofficeStorageUrl" value="<?php p($_["storageUrl"]) ?>" placeholder="<?php p($_["currentServer"]) ?>" type="text"></p>
        </div>
    </div>

    <br />
    <div>
        <button id="euroofficeAddrSave" class="button primary"><?php p($l->t("Save")) ?></button>

        <div class="eurooffice-demo eurooffice-hide">
            <input type="checkbox" class="checkbox" id="euroofficeDemo"
                <?php if ($_["demo"]["enabled"]) { ?>checked="checked"<?php } ?>
                <?php if (!$_["demo"]["available"]) { ?>disabled="disabled"<?php } ?> />
            <label for="euroofficeDemo"><?php p($l->t("Connect to demo Nextcloud Office server")) ?></label>

            <br />
            <?php if ($_["demo"]["available"]) { ?>
            <em><?php p($l->t("This is a public test server, please do not use it for private sensitive data. The server will be available during a 30-day period.")) ?></em>
            <?php } else { ?>
            <em><?php p($l->t("The 30-day test period is over, you can no longer connect to demo Nextcloud Office server.")) ?></em>
            <?php } ?>
        </div>
    </div>

</div>

<div class="section section-eurooffice section-eurooffice-common <?php if (empty($_["documentserver"]) && !$_["demo"]["enabled"] || !$_["successful"]) { ?>eurooffice-hide<?php } ?>">
    <h2><?php p($l->t("Common settings")) ?></h2>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeGroups"
            <?php if (count($_["limitGroups"]) > 0) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeGroups"><?php p($l->t("Allow the following groups to access the editors")) ?></label>
        <input type="hidden" id="euroofficeLimitGroups" value="<?php p(implode("|", $_["limitGroups"])) ?>" />
        <div id="euroofficeLimitGroupsPicker" class="eurooffice-picker-mount eurooffice-hide"></div>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficePreview"
            <?php if ($_["preview"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficePreview"><?php p($l->t("Use Nextcloud Office to generate a document preview (it will take up disk space)")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeSameTab"
            <?php if ($_["sameTab"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeSameTab"><?php p($l->t("Open file in the same tab")) ?></label>
    </p>

    <p <?php if ($_["sameTab"]) { ?> style="display: none" <?php } ?> id="euroofficeEnableSharingBlock">
        <input type="checkbox" class="checkbox" id="euroofficeEnableSharing"
            <?php if ($_["enableSharing"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeEnableSharing"><?php p($l->t("Enable sharing (might increase editors loading time)")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeAdvanced"
            <?php if ($_["advanced"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeAdvanced"><?php p($l->t("Provide advanced document permissions using Nextcloud Office")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeVersionHistory"
            <?php if ($_["versionHistory"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeVersionHistory"><?php p($l->t("Keep metadata for each version once the document is edited (it will take up disk space)")) ?></label>
        <button id="euroofficeClearVersionHistory" class="button"><?php p($l->t("Clear")) ?></button>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeCronChecker"
            <?php if ($_["cronChecker"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeCronChecker"><?php p($l->t("Enable background connection check to the editors")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeEmailNotifications"
            <?php if ($_["emailNotifications"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeEmailNotifications"><?php p($l->t("Enable e-mail notifications")) ?></label>
    </p>

    <p class="eurooffice-header">
        <?php p($l->t("Unknown author display name")) ?>
    </p>
    <p><input id="euroofficeUnknownAuthor" value="<?php p($_["unknownAuthor"]) ?>" placeholder="" type="text"></p>

    <p class="eurooffice-header"><?php p($l->t("The default application for opening the format")) ?></p>
    <div class="eurooffice-exts">
        <?php foreach ($_["formats"] as $format => $setting) { ?>
            <?php if (array_key_exists("mime", $setting)) { ?>
            <div>
                <input type="checkbox" class="checkbox"
                    id="euroofficeDefFormat<?php p($format) ?>"
                    name="<?php p($format) ?>"
                    <?php if (array_key_exists("def", $setting) && $setting["def"]) { ?>checked="checked"<?php } ?> />
                <label for="euroofficeDefFormat<?php p($format) ?>"><?php p($format) ?></label>
            </div>
            <?php } ?>
        <?php } ?>
    </div>

    <p class="eurooffice-header">
        <?php p($l->t("Open the file for editing (due to format restrictions, the data might be lost when saving to the formats from the list below)")) ?>
    </p>
    <div class="eurooffice-exts">
        <?php foreach ($_["formats"] as $format => $setting) { ?>
            <?php if (array_key_exists("editable", $setting) && $setting["editable"]) { ?>
            <div>
                <input type="checkbox" class="checkbox"
                    id="euroofficeEditFormat<?php p($format) ?>"
                    name="<?php p($format) ?>"
                    <?php if (array_key_exists("edit", $setting) && $setting["edit"]) { ?>checked="checked"<?php } ?> />
                <label for="euroofficeEditFormat<?php p($format) ?>"><?php p($format) ?></label>
            </div>
            <?php } ?>
        <?php } ?>
    </div>
    <br />

    <h2>
        <?php p($l->t("Editor customization settings")) ?>
    </h2>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeForcesave"
            <?php if ($_["forcesave"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeForcesave"><?php p($l->t("Keep intermediate versions when editing (forcesave)")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeLiveViewOnShare"
            <?php if ($_["liveViewOnShare"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeLiveViewOnShare"><?php p($l->t("Enable live-viewing mode when accessing file by public link")) ?></label>
    </p>

    <p class="eurooffice-header">
        <?php p($l->t("The customization section allows personalizing the editor interface")) ?>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeChat"
            <?php if ($_["chat"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeChat"><?php p($l->t("Display Chat menu button")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeCompactHeader"
            <?php if ($_["compactHeader"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeCompactHeader"><?php p($l->t("Display the header more compact")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeFeedback"
            <?php if ($_["feedback"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeFeedback"><?php p($l->t("Display Feedback & Support menu button")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeHelp"
            <?php if ($_["help"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeHelp"><?php p($l->t("Display Help menu button")) ?></label>
    </p>

    <p class="eurooffice-header">
        <?php p($l->t("REVIEW mode for viewing")) ?>
    </p>
    <div class="eurooffice-tables">
        <div>
            <input type="radio" class="radio"
                id="euroofficeReviewDisplay_markup"
                name="reviewDisplay"
                <?php if ($_["reviewDisplay"] === "markup") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeReviewDisplay_markup"><?php p($l->t("Markup")) ?></label>
        </div>
        <div>
            <input type="radio" class="radio"
                id="euroofficeReviewDisplay_final"
                name="reviewDisplay"
                <?php if ($_["reviewDisplay"] === "final") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeReviewDisplay_final"><?php p($l->t("Final")) ?></label>
        </div>
        <div>
            <input type="radio" class="radio"
                id="euroofficeReviewDisplay_original"
                name="reviewDisplay"
                <?php if ($_["reviewDisplay"] === "original") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeReviewDisplay_original"><?php p($l->t("Original")) ?></label>
        </div>
    </div>

    <p class="eurooffice-header">
        <?php p($l->t("Default editor theme")) ?>
    </p>
    <div class="eurooffice-tables">
        <div>
            <input type="radio" class="radio"
                id="euroofficeTheme_theme-system"
                name="theme"
                <?php if ($_["theme"] === "theme-system") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeTheme_theme-system"><?php p($l->t("Same as system")) ?></label>
        </div>
        <div>
            <input type="radio" class="radio"
                id="euroofficeTheme_default-light"
                name="theme"
                <?php if ($_["theme"] === "default-light") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeTheme_default-light"><?php p($l->t("Light")) ?></label>
        </div>
        <div>
            <input type="radio" class="radio"
                id="euroofficeTheme_default-dark"
                name="theme"
                <?php if ($_["theme"] === "default-dark") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeTheme_default-dark"><?php p($l->t("Dark")) ?></label>
        </div>
    </div>

    <br />
    <p><button id="euroofficeSave" class="button primary"><?php p($l->t("Save")) ?></button></p>
</div>

<div class="section section-eurooffice section-eurooffice-fonts <?php if ($_["demo"]["enabled"] || empty($_["documentserver"]) || !$_["successful"]) { ?>eurooffice-hide<?php } ?>">
    <h2><?php p($l->t("Custom fonts")) ?></h2>
    <p class="settings-hint"><?php p($l->t("Upload custom fonts (TTF, OTF, TTC, WOFF, WOFF2) to make them available in the document editor. Click Regenerate after uploading or deleting fonts to apply changes.")) ?></p>
    <div id="eurooffice-font-manager"></div>
</div>

<div class="section section-eurooffice section-eurooffice-templates <?php if (empty($_["documentserver"]) && !$_["demo"]["enabled"] || !$_["successful"]) { ?>eurooffice-hide<?php } ?>">

    <h2>
        <?php p($l->t("Common templates")) ?>
        <input id="euroofficeAddTemplate" type="file" class="hidden-visually" />
        <label for="euroofficeAddTemplate" class="icon-add" title="<?php p($l->t("Add a new template")) ?>"></label>
    </h2>
    <ul class="eurooffice-template-container">
        <?php foreach ($_["templates"] as $template) { ?>
            <li data-id=<?php p($template["id"]) ?> class="eurooffice-template-item" >
                <img src="<?php p($template["icon"]) ?>" />
                <p><?php p($template["name"]) ?></p>
                <span class="eurooffice-template-download"></span>
                <span class="eurooffice-template-delete icon-delete"></span>
            </li>
        <?php } ?>
    </ul>

</div>

<div class="section section-eurooffice section-eurooffice-watermark <?php if (empty($_["documentserver"]) && !$_["demo"]["enabled"] || !$_["successful"]) { ?>eurooffice-hide<?php } ?>">
    <h2><?php p($l->t("Security")) ?></h2>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficePlugins"
            <?php if ($_["plugins"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficePlugins"><?php p($l->t("Enable plugins")) ?></label>
    </p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeMacros"
            <?php if ($_["macros"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeMacros"><?php p($l->t("Run document macros")) ?></label>
    </p>

    <p class="eurooffice-header">
        <?php p($l->t("Enable document protection for")) ?>
    </p>
    <div class="eurooffice-tables">
        <div>
            <input type="radio" class="radio"
                id="euroofficeProtection_all"
                name="protection"
                <?php if ($_["protection"] === "all") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeProtection_all"><?php p($l->t("All users")) ?></label>
        </div>
        <div>
            <input type="radio" class="radio"
                id="euroofficeProtection_owner"
                name="protection"
                <?php if ($_["protection"] === "owner") { ?>checked="checked"<?php } ?> />
            <label for="euroofficeProtection_owner"><?php p($l->t("Owner only")) ?></label>
        </div>
    </div>

    <br />
    <p class="settings-hint"><?php p($l->t("Secure view enables you to secure documents by embedding a watermark")) ?></p>

    <p>
        <input type="checkbox" class="checkbox" id="euroofficeWatermark_enabled"
            <?php if ($_["watermark"]["enabled"]) { ?>checked="checked"<?php } ?> />
        <label for="euroofficeWatermark_enabled"><?php p($l->t("Enable watermarking")) ?></label>
    </p>

    <div id="euroofficeWatermarkSettings" <?php if (!$_["watermark"]["enabled"]) { ?>class="eurooffice-hide"<?php } ?> >
        <br />
        <p><?php p($l->t("Watermark text")) ?></p>
        <br />
        <p class="settings-hint"><?php p($l->t("Supported placeholders")) ?>: {userId}, {userDisplayName}, {email}, {date}, {themingName}</p>
        <p><input id="euroofficeWatermark_text" value="<?php p($_["watermark"]["text"]) ?>" placeholder="<?php p($l->t("DO NOT SHARE THIS")) ?> {userId} {date}" type="text"></p>

        <br />
        <?php if ($_["tagsEnabled"]) { ?>
        <p>
            <input type="checkbox" class="checkbox" id="euroofficeWatermark_allTags"
                <?php if ($_["watermark"]["allTags"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeWatermark_allTags"><?php p($l->t("Show watermark on tagged files")) ?></label>
            <input type="hidden" id="euroofficeWatermark_allTagsList" value="<?php p(implode("|", $_["watermark"]["allTagsList"])) ?>" />
            <div id="euroofficeWatermark_allTagsListPicker" class="eurooffice-picker-mount eurooffice-hide"></div>
        </p>
        <?php } ?>

        <p>
            <input type="checkbox" class="checkbox" id="euroofficeWatermark_allGroups"
                <?php if ($_["watermark"]["allGroups"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeWatermark_allGroups"><?php p($l->t("Show watermark for users of groups")) ?></label>
            <input type="hidden" id="euroofficeWatermark_allGroupsList" value="<?php p(implode("|", $_["watermark"]["allGroupsList"])) ?>" />
            <div id="euroofficeWatermark_allGroupsListPicker" class="eurooffice-picker-mount eurooffice-hide"></div>
        </p>

        <p>
            <input type="checkbox" class="checkbox" id="euroofficeWatermark_shareAll"
                <?php if ($_["watermark"]["shareAll"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeWatermark_shareAll"><?php p($l->t("Show watermark for all shares")) ?></label>
        </p>

        <p <?php if ($_["watermark"]["shareAll"]) { ?>class="eurooffice-hide"<?php } ?> >
            <input type="checkbox" class="checkbox" id="euroofficeWatermark_shareRead"
                <?php if ($_["watermark"]["shareRead"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeWatermark_shareRead"><?php p($l->t("Show watermark for read only shares")) ?></label>
        </p>

        <br />
        <p><?php p($l->t("Link shares")) ?></p>
        <p>
            <input type="checkbox" class="checkbox" id="euroofficeWatermark_linkAll"
                <?php if ($_["watermark"]["linkAll"]) { ?>checked="checked"<?php } ?> />
            <label for="euroofficeWatermark_linkAll"><?php p($l->t("Show watermark for all link shares")) ?></label>
        </p>

        <div id="euroofficeWatermark_link_sensitive" <?php if ($_["watermark"]["linkAll"]) { ?>class="eurooffice-hide"<?php } ?> >
            <p>
                <input type="checkbox" class="checkbox" id="euroofficeWatermark_linkSecure"
                    <?php if ($_["watermark"]["linkSecure"]) { ?>checked="checked"<?php } ?> />
                <label for="euroofficeWatermark_linkSecure"><?php p($l->t("Show watermark for download hidden shares")) ?></label>
            </p>

            <p>
                <input type="checkbox" class="checkbox" id="euroofficeWatermark_linkRead"
                    <?php if ($_["watermark"]["linkRead"]) { ?>checked="checked"<?php } ?> />
                <label for="euroofficeWatermark_linkRead"><?php p($l->t("Show watermark for read only link shares")) ?></label>
            </p>

            <?php if ($_["tagsEnabled"]) { ?>
            <p>
                <input type="checkbox" class="checkbox" id="euroofficeWatermark_linkTags"
                    <?php if ($_["watermark"]["linkTags"]) { ?>checked="checked"<?php } ?> />
                <label for="euroofficeWatermark_linkTags"><?php p($l->t("Show watermark on link shares with specific system tags")) ?></label>
                <input type="hidden" id="euroofficeWatermark_linkTagsList" value="<?php p(implode("|", $_["watermark"]["linkTagsList"])) ?>" />
                <div id="euroofficeWatermark_linkTagsListPicker" class="eurooffice-picker-mount eurooffice-hide"></div>
            </p>
            <?php } ?>
        </div>
    </div>

    <br />
    <p><button id="euroofficeSecuritySave" class="button primary"><?php p($l->t("Save")) ?></button></p>

    <input type ="hidden" id="euroofficeSettingsState" value="<?php p($_["settingsError"]) ?>" />
</div>
