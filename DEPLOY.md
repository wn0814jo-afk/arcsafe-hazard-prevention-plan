# DEPLOY.md — Cloudflare Workers (Static Assets) 배포

배포 대상은 **검증된 단일 파일 `dist/hazard-prevention-plan.html`** 하나다. Engine/UI/문구는 이 배포 작업에서 바꾸지 않는다.
서버 로직·인증·과금 없음(정적 자산만 제공).

## 구성
- `wrangler.jsonc` — Worker 이름 `arcsafe-hazard-prevention-plan`, assets 디렉터리 `./public`
- `prepare-deploy.sh` — `dist/hazard-prevention-plan.html` → `public/index.html` 복사(재빌드 없음) + sha256 출력
- `public/`, `.wrangler/` — 배포 산출물(git 제외)

## Cloudflare 대시보드 연결(GitHub 자동 배포)
1. Workers & Pages → Create → **Import a repository**(GitHub) → `wn0814jo-afk/arcsafe-hazard-prevention-plan`, 브랜치 `main`
2. 프로젝트 이름: `arcsafe-hazard-prevention-plan` (wrangler.jsonc의 `name`과 같아야 함)
3. **Build command**: `./prepare-deploy.sh`
4. **Deploy command**: `npx wrangler deploy`
5. 저장 후 배포 → `https://arcsafe-hazard-prevention-plan.<계정 서브도메인>.workers.dev/`

이후 `main`에 push하면 자동 배포된다.

## 배포본이 기준 파일과 같은지 확인
```sh
# 기준 파일(커밋 375ce46의 dist) 해시
git show 375ce46:dist/hazard-prevention-plan.html | sha256sum
# 배포본 해시 (같아야 함)
curl -s https://<배포 URL>/ | sha256sum
```
(배포 후 `public/index.html`은 `dist/hazard-prevention-plan.html`과 바이트 단위로 동일하다.)

## 배포 후 최소 확인
1. 실제 URL 접속 2. 모바일 390px 3. 신설 → 용해로 → 대상 4. 확인 필요(UNKNOWN) 경로 5. 이설 경로
6. 화면에 내부 용어 노출 없음 7. 배포본 해시 == 기준 파일 해시
브라우저 자동 검증은 `E2E_URL`이 아니라 로컬 파일 기준이다(`npm run test:e2e`).
