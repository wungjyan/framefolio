# Release process

Framefolio uses Release Please to prepare versions and GitHub Releases, then GitHub Actions builds and publishes the matching multi-platform Docker image.

## One-time repository setup

In GitHub, open **Settings → Actions → General → Workflow permissions** and enable **Allow GitHub Actions to create and approve pull requests**. Release Please needs this setting to open and update its release pull request.

Create a Docker Hub access token with read and write access to `wungjyan/framefolio`, then add it at **Settings → Secrets and variables → Actions → Secrets**:

```text
DOCKERHUB_TOKEN
```

The workflows default to the existing repository and the public npm registry. These optional Actions variables can override them:

```text
DOCKERHUB_USERNAME=wungjyan
DOCKERHUB_REPOSITORY=wungjyan/framefolio
NPM_REGISTRY=https://registry.npmjs.org
```

Do not store the Docker Hub password in GitHub. Use a dedicated access token that can be revoked without changing the account password.

## Normal release

1. Merge or push Conventional Commits into `main`.
2. Wait for the **Release** workflow to verify the application and create or update the Release Please pull request.
3. Review the proposed version and `CHANGELOG.md` in that pull request.
4. Merge the release pull request when the version is ready to publish.
5. The next **Release** run creates the Git tag and GitHub Release, then publishes `wungjyan/framefolio:<version>` and `wungjyan/framefolio:latest`.

Release Please normally interprets commit types as follows:

```text
fix:                 patch release, for example 1.0.0 → 1.0.1
feat:                minor release, for example 1.0.0 → 1.1.0
feat!: or BREAKING   major release, for example 1.0.0 → 2.0.0
```

Changes on `dev` and feature branches are ignored until they reach `main`. Additional qualifying commits update the existing release pull request; they do not create one pull request per commit.

## Recover a failed image publication

If the GitHub Release exists but its Docker job failed, open **Actions → Publish Docker image → Run workflow** and enter the existing stable Git tag. The workflow checks out that tag and refuses to publish if the source does not match it.

Leave **Also update the latest image tag** disabled unless the recovered version should become the current stable release.

## Local fallback

`scripts/docker-publish.sh` remains available for emergencies and local testing. It builds the current working tree, so it is not the normal release path and must not be used to overwrite an existing version with different source code.

```bash
docker login
./scripts/docker-publish.sh 1.1.0
```

## Branch protection note

Release Please uses the repository's built-in `GITHUB_TOKEN`. Pull requests created with that token do not trigger another workflow run, so the automated release pull request may not display the normal PR CI check. Its merge still triggers the **Release** workflow, and that workflow runs the complete verification job before creating the tag, GitHub Release, or Docker image.

If `main` is later configured to require CI before every merge, use a fine-grained token or GitHub App token for Release Please so its pull request can trigger the required check.
