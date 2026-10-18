#!/usr/bin/env bash
# scripts/build-docker.sh
# Builds (and optionally pushes / exports) the SecretKeyPreview image with docker buildx.
set -Eeuo pipefail

IMAGE_NAME="${IMAGE_NAME:-secretkeypreview}"
REGISTRY="${REGISTRY:-}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
NODE_IMAGE="${NODE_IMAGE:-node:22.14.0-bookworm-slim}"
DOCKERFILE="${DOCKERFILE:-docker/Dockerfile}"
CONTEXT="${CONTEXT:-.}"
PLATFORMS="${PLATFORMS:-}"
PUSH="${PUSH:-false}"
NO_CACHE="${NO_CACHE:-false}"
PROGRESS="${PROGRESS:-auto}"
TAR_OUT="${TAR_OUT:-}"

log()  { printf '\033[0;36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[build]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[build]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
command -v node   >/dev/null 2>&1 || die "node not found in PATH"
docker buildx version >/dev/null 2>&1 || die "docker buildx not available"

full_image() {
  if [ -n "$REGISTRY" ]; then printf '%s/%s' "$REGISTRY" "$IMAGE_NAME"; else printf '%s' "$IMAGE_NAME"; fi
}

if [ -z "$PLATFORMS" ]; then
  arch="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || true)"
  case "$arch" in
    x86_64|amd64)          PLATFORMS="linux/amd64" ;;
    aarch64|arm64|arm64/v8) PLATFORMS="linux/arm64" ;;
    "") die "cannot detect docker arch; set PLATFORMS explicitly (e.g. linux/amd64,linux/arm64)" ;;
    *)   die "unsupported docker arch: $arch" ;;
  esac
fi

if [ "$PUSH" = "true" ] && [ -z "$REGISTRY" ]; then
  warn "PUSH=true without REGISTRY; building a local image instead"
  PUSH="false"
fi

if printf '%s' "$PLATFORMS" | grep -q ',' && [ "$PUSH" != "true" ] && [ -z "$TAR_OUT" ]; then
  die "multi-platform builds must be pushed (PUSH=true REGISTRY=...) or exported (TAR_OUT=...)"
fi

[ -n "$TAR_OUT" ] && mkdir -p "$(dirname "$TAR_OUT")"

BUILD_ARGS=(
  --platform "$PLATFORMS"
  --file "$DOCKERFILE"
  --build-arg "NODE_IMAGE=$NODE_IMAGE"
  --build-arg "VERSION=$VERSION"
  --build-arg "VCS_REF=$GIT_SHA"
  --build-arg "BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  --label "org.opencontainers.image.title=SecretKeyPreview"
  --label "org.opencontainers.image.version=$VERSION"
  --label "org.opencontainers.image.revision=$GIT_SHA"
  --label "com.secretkeypreview.image.platforms=$PLATFORMS"
  -t "$(full_image):$VERSION"
  -t "$(full_image):sha-$GIT_SHA"
  -t "$(full_image):latest"
  --progress "$PROGRESS"
)

[ "$NO_CACHE" = "true" ] && BUILD_ARGS+=(--no-cache)

if [ -n "$TAR_OUT" ]; then
  BUILD_ARGS+=(--output "type=docker,dest=$TAR_OUT")
elif [ "$PUSH" = "true" ]; then
  BUILD_ARGS+=(--push)
else
  BUILD_ARGS+=(--load)
fi

log "image=$(full_image) version=$VERSION platforms=$PLATFORMS push=$PUSH"
docker buildx build "$CONTEXT" "${BUILD_ARGS[@]}"

if [ -n "$TAR_OUT" ]; then
  log "image archive: $TAR_OUT"
else
  log "built $(full_image):$VERSION"
fi
log "run locally: docker run --rm -p 127.0.0.1:4173:4173 -v \"\$(pwd)/certs:/certs:ro\" -v skp-data:/data --env-file .env $(full_image):$VERSION"
