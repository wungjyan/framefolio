#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 || -z "${1}" ]]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 1.0.0" >&2
  exit 1
fi

VERSION="$1"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-wungjyan/framefolio}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
PUBLISH_LATEST="${PUBLISH_LATEST:-true}"
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIRECTORY="$(cd "$SCRIPT_DIRECTORY/.." && pwd)"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}

docker buildx version >/dev/null

TAGS=(--tag "$IMAGE_REPOSITORY:$VERSION")

if [[ "$PUBLISH_LATEST" == "true" ]]; then
  TAGS+=(--tag "$IMAGE_REPOSITORY:latest")
fi

echo "Publishing $IMAGE_REPOSITORY:$VERSION for $PLATFORMS"

docker buildx build \
  --platform "$PLATFORMS" \
  --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
  "${TAGS[@]}" \
  --push \
  "$PROJECT_DIRECTORY"

