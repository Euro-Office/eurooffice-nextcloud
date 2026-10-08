# Releasing

Development and tagging happen in [Euro-Office/eurooffice-nextcloud](https://github.com/Euro-Office/eurooffice-nextcloud). The app store release is built from [nextcloud-releases/eurooffice](https://github.com/nextcloud-releases/eurooffice), which holds the signing and app store secrets.

1. Run the [Prepare release](../../actions/workflows/prepare-release.yml) workflow. It bumps the version in `appinfo/info.xml` and `package.json`, adds a `CHANGELOG.md` section built from the titles of pull requests merged since the last tag, and opens a `release/X.Y.Z` pull request. Review and edit the changelog before merging.
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

## Recovering a failed release

`appstore-build-publish.yml` runs the workflow file from the tagged commit, so fixes to it only apply to tags pointing at a commit that contains the fix.

To retry, fix the cause, move the tag in nextcloud-releases if needed, then edit the release there, set it to draft and publish it again.
