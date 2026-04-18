#!/usr/bin/env bash
set -euo pipefail

REGISTRY="192.168.0.191:5000"
IMAGE="mealplanner"
PLATFORM="linux/amd64"
TAG="${1:-latest}"

TMPTAR="$(mktemp -t mealplanner-XXXXXX).tar"
trap 'rm -f "${TMPTAR}"' EXIT

echo "🔨 Building ${IMAGE}:${TAG} for ${PLATFORM}..."
docker buildx build \
    --platform "${PLATFORM}" \
    --builder amd64builder \
    -t "${REGISTRY}/${IMAGE}:${TAG}" \
    --load \
    .

echo "📦 Saving image..."
docker save "${REGISTRY}/${IMAGE}:${TAG}" -o "${TMPTAR}"

echo "🚀 Pushing to ${REGISTRY}..."
crane push "${TMPTAR}" "${REGISTRY}/${IMAGE}:${TAG}" --insecure

echo "✅ Pushed ${REGISTRY}/${IMAGE}:${TAG} (${PLATFORM})"
