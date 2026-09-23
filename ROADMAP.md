# 로드맵

두 가지 스케일의 로드맵이 있다 — 헷갈리지 않게 분리해서 적는다.

## 제품 전체 로드맵 (장기, "산업안전 대상판별기") — 참고용

DECISIONS.md(2026-09-22, 제품 구조 결정)에서 합의된 큰 그림. **지금은
Phase 1만 진행하고, 2~4는 착수하지 않는다.**

- **Phase 1 — 유해위험방지계획서 대상판별**: 바로 이 저장소.
- **Phase 2 — PSM 대상판별**: 별도 저장소, 별도 SSOT(법 제44조/시행령
  제43조·별표13). 착수 안 함.
- **Phase 3 — 산업안전 인허가·허가 대상판별**: 범위(어떤 법령까지
  포함할지)부터 먼저 정해야 함. 착수 안 함.
- **Phase 4 — 통합 규제 맵**: 위 1~3 모듈의 판정 결과를 모아 "우리
  사업장에서 무엇을 확인해야 하나요?"로 시작하는 상위 화면. 착수 안 함.
- **Phase 5 — 건설공사 유해위험방지계획서 대상판별**: 시행령 제42조③
  (31m 이상 건축물, 연면적 3만㎡ 이상, 교량·터널·댐·굴착 등) — Phase 1
  검토 중 발견했으나 완전히 다른 판정 축이라 별도 Phase로 분리(2026-09-23
  결정, DECISIONS.md 참고). 착수 안 함.

## 이 저장소 내부 빌드 단계 (Phase 1 안에서의 세부 단계)

### 빌드 0 — 규정 확정 및 승인 (진행 중, STEP 0~4)
- [x] STEP 1~3 완료 (REGULATION-NOTES.md, RULE-CONTRACT.md)
- [ ] STEP 4 조사보고 → 사용자 승인 대기 중
- [ ] RULE-CONTRACT.md 승인 (상단에 "승인됨: <날짜>" 기록되면 완료)

### 빌드 1 — Engine 핵심 (승인 후 시작, STEP 5~6)
- [ ] law-basis.js (SSOT, 승인된 RULE-CONTRACT.md 조문만 원문 그대로)
- [ ] engine.js — 4개 독립 판정 모듈, pure function, self-test 포함
- [ ] data.js — 13개 업종 코드, 5종 설비 세부기준 데이터
- [ ] state.js
- [ ] Engine 단위 테스트

### 빌드 2 — Report / UI
- [ ] report.js (Snapshot → Report, safety-cert-checker와 동일 패턴)
- [ ] ui.js — 단계형 위저드(STEP 1~6, RULE-CONTRACT.md 참고)로 구현,
      결과 화면은 Regulatory Map(사업장/대상설비/변경 기준 경로 표시)
- [ ] jsdom 통합 테스트

### 빌드 3 — PDF / 배포
- [ ] PDF 출력 (safety-cert-checker의 pdf-export.js 패턴 재사용)
- [ ] 실Chromium QA (viewport, PDF 다운로드)
- [ ] wrangler.jsonc + Cloudflare Workers Static Assets 배포
- [ ] SEO (title/description/canonical/OG/robots.txt/sitemap.xml)
- [ ] ArchSafe(archsafe.co.kr) tools/index.html SAFE 카테고리 등록

## 미결 스코프 (RULE-CONTRACT.md 승인 시 함께 결정)

- ~~시행령 제42조③ 건설공사 규모기준을 이번 Phase 1에 포함할지 여부~~
  → 2026-09-23 제외로 확정 (Phase 5로 분리, 위 참고)
- 고시 제2023-50호 개정이 제2조제1항제5호 가목의 정격용량 계산 방법에
  영향을 줬는지 (REGULATION-NOTES.md 참고) — 승인 전 재확인 필요
