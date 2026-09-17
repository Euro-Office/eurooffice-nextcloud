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

    style("eurooffice", "editor");
    // The bundle's own stylesheet, which the build generates as @imports of the
    // hashed CSS chunks. Without it the Vue components this page renders -- the
    // Smart Picker modal -- have no styles at all and fill the whole frame.
    style("eurooffice", "eurooffice-editor");
    \OCP\Util::addScript("eurooffice", "eurooffice-desktop", 'core');
if (!empty($_["directToken"])) {
    \OCP\Util::addScript("eurooffice", "eurooffice-directeditor", 'core');
}
    \OCP\Util::addScript("eurooffice", "eurooffice-editor", 'core');
?>

<div id="app"
    <?php if (!empty($_["inviewer"])) { ?>
        class="eurooffice-inviewer"
    <?php } ?>>

    <div id="iframeEditor"
        data-id="<?php p($_["fileId"]) ?>"
        data-path="<?php p($_["filePath"]) ?>"
        data-sharetoken="<?php p($_["shareToken"]) ?>"
        data-directtoken="<?php p($_["directToken"]) ?>"
        data-template="<?php p($_["isTemplate"]) ?>"
        data-anchor="<?php p($_["anchor"]) ?>"
        data-inframe="<?php p($_["inframe"]) ?>"
        data-inviewer="<?php p($_["inviewer"]) ?>"></div>
</div>

<?php if (!empty($_["directToken"])) { ?>
<script>
    document.querySelector("meta[name='viewport']")
        .setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no");
</script>
<?php } ?>
