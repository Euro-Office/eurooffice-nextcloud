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
    \OCP\Util::addScript("eurooffice", "eurooffice-settings", 'core');
?>
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
