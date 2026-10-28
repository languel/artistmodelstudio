#!/bin/sh
# Fetches MediaPipe Tasks Vision runtime + models into vendor/mediapipe (git-ignored, ~35 MB).
set -e
cd "$(dirname "$0")/vendor/mediapipe"; mkdir -p wasm models
T=$(mktemp -d); (cd "$T" && npm pack @mediapipe/tasks-vision >/dev/null 2>&1 && tar xzf *.tgz)
cp "$T/package/vision_bundle.mjs" .; cp "$T/package/wasm/vision_wasm_internal."* wasm/
B=https://storage.googleapis.com/mediapipe-models; cd models
curl -sfLO $B/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
curl -sfLO $B/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
curl -sfLO $B/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
