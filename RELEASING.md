# Releasing

Development and tagging happen in [Euro-Office/eurooffice-nextcloud](https://github.com/Euro-Office/eurooffice-nextcloud). The app store release is built from [nextcloud-releases/eurooffice](https://github.com/nextcloud-releases/eurooffice), which holds the signing and app store secrets.

1. Run the [Prepare release](../../actions/workflows/prepare-release.yml) workflow and pick `patch`, `minor` or `major`. It:
   - bumps the version in `appinfo/info.xml`, `package.json` and `npm-shrinkwrap.json`
   - adds a `CHANGELOG.md` section from the titles of pull requests merged since the last tag, grouped into Added (`feat`), Fixed (`fix`) and Other
   - opens a `release/X.Y.Z` pull request

   Review and edit the changelog in that pull request. Checks do not run on pull requests opened by the workflow, so close and reopen it to trigger them, then merge.
2. After merging, tag the merge commit and push the tag:

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```

   `release.yml` checks that the tag, `CHANGELOG.md` and `info.xml` agree and creates the GitHub release with the `CHANGELOG.md` section as body.
3. Push only the tag to nextcloud-releases. Its `main` branch is a separate history and is not updated.

   ```sh
   git remote add nextcloud-releases git@github.com:nextcloud-releases/eurooffice.git
   git push nextcloud-releases vX.Y.Z
   ```

4. In nextcloud-releases/eurooffice, create and publish a GitHub release for `vX.Y.Z` in the UI. This triggers `appstore-build-publish.yml`, which builds and signs the app, attaches the tarball to the release and uploads it to the Nextcloud app store.

The release in step 4 must be created by a person: releases created by a workflow with `GITHUB_TOKEN` do not trigger other workflows.

## Pull request titles

The changelog is built from pull request titles, so they must follow [Conventional Commits](https://www.conventionalcommits.org), e.g. `fix(editor): pass the user's language`. The `Block unconventional commits` check enforces this for titles and commit messages.

## Repository settings

`Prepare release` needs *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests* enabled.

## Recovering a failed release

`appstore-build-publish.yml` runs the workflow file from the tagged commit, so fixes to it only apply to tags pointing at a commit that contains the fix.

To retry, fix the cause, move the tag in nextcloud-releases if needed, then edit the release there, set it to draft and publish it again.
