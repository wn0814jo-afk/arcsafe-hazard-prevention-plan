#!/usr/bin/env sh
# Cloudflare 빌드 명령: 검증된 단일 배포 파일을 assets 디렉터리로 복사한다(재빌드하지 않음).
# dist/hazard-prevention-plan.html은 `npm test`(tests-ui.js B5)가 소스와의 일치를 보장한다.
set -eu
SRC="dist/hazard-prevention-plan.html"
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }
rm -rf public
mkdir public
cp "$SRC" public/index.html
echo "prepared public/index.html"
sha256sum public/index.html
