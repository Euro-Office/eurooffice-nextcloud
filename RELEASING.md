# Releasing

1. Open a `release/X.Y.Z` pull request against `main` that bumps `<version>` in `appinfo/info.xml` and adds a `## X.Y.Z` section on top of `CHANGELOG.md`.
2. After merging, tag the merge commit and push the tag:

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```

3. `release.yml` checks that the tag, `CHANGELOG.md` and `info.xml` agree, then creates the GitHub release with the `CHANGELOG.md` section as body.
4. Publishing the release triggers `appstore-build-publish.yml`, which builds and signs the app, attaches `eurooffice-vX.Y.Z.tar.gz` to the release and uploads it to the Nextcloud app store.

## Required secrets

| Secret | Used by | Purpose |
|---|---|---|
| `RELEASE_TOKEN` | `release.yml` | Fine-grained token with `Contents: write` on this repository. Releases created with the default `GITHUB_TOKEN` do not trigger other workflows. |
| `APP_PRIVATE_KEY` | `appstore-build-publish.yml` | Signing key for the `eurooffice` app certificate |
| `APPSTORE_TOKEN` | `appstore-build-publish.yml` | Nextcloud app store API token |

## Recovering a failed release

`appstore-build-publish.yml` runs the workflow file from the tagged commit, so fixes to it only apply to tags created after the fix.

- Release not created: fix the cause, delete the tag (`git push origin :vX.Y.Z`) and push it again.
- Release created but not published to the app store: fix the cause, move the tag if needed, then in the GitHub UI edit the release, set it to draft and publish it again.
