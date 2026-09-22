# 로드맵

## Phase 0 — 규정 확정 (진행 중)
- [x] 2차자료 리서치 (REGULATION-NOTES.md)
- [ ] law.go.kr 원문 대조 → 1차자료로 승격
- [ ] 100kW/300kW 불일치 해소

## Phase 1 — Engine 핵심 (전기용량 계산기)
- [ ] law-basis.js (SSOT, 원문 대조 끝난 조문만)
- [ ] engine.js — CONCEPT.md 판정 트리 구현 (pure function, self-test 포함)
- [ ] data.js — 13개 업종 코드, 5종 설비 세부기준 데이터
- [ ] state.js
- [ ] Engine 단위 테스트

## Phase 2 — Report / UI
- [ ] report.js (Snapshot → Report, safety-cert-checker와 동일 패턴)
- [ ] ui.js (판정 시작 → 작업유형 → 조건 입력 → 판정하기 → 결과)
- [ ] jsdom 통합 테스트

## Phase 3 — PDF / 배포
- [ ] PDF 출력 (safety-cert-checker의 pdf-export.js 패턴 재사용)
- [ ] 실Chromium QA (viewport, PDF 다운로드)
- [ ] wrangler.jsonc + Cloudflare Workers Static Assets 배포
- [ ] SEO (title/description/canonical/OG/robots.txt/sitemap.xml)
- [ ] ArchSafe(archsafe.co.kr) tools/index.html SAFE 카테고리 등록

## 후속 프로젝트 후보 (이 저장소 범위 아님, 별도 SSOT 필요)
- **PSM(공정안전보고서) 중대변경 판정기** — 산업안전보건법 제44조/시행령
  별표13 기준, 전기용량 개념 없음, 완전히 다른 조문 체계라 별도 저장소로
  시작해야 함
