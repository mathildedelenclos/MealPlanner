#!/usr/bin/env bash
set -euo pipefail

REGISTRY="192.168.0.191:5000"
IMAGE="mealplanner"
PLATFORM="linux/amd64"
TAG="${1:-latest}"

echo "🔨 Building ${IMAGE}:${TAG} for ${PLATFORM}..."
docker buildx build \
    --platform "${PLATFORM}" \
    --builder amd64builder \
    -t "${REGISTRY}/${IMAGE}:${TAG}" \
    --push \
    .

echo "✅ Pushed ${REGISTRY}/${IMAGE}:${TAG} (${PLATFORM})"
