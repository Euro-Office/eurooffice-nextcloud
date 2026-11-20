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
