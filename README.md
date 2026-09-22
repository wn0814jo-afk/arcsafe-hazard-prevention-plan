# arcsafe-hazard-prevention-plan

제조업 등 유해위험방지계획서 제출대상 판별기 (산업안전보건법 제42조 /
시행령 제42조 / 관련 고시)

사업장이 건설물·기계·기구·설비를 신설·이전·이설·증설·교체·개조할 때
"유해위험방지계획서" 제출 대상인지 판별하는 도구. 전기 계약용량/정격용량
계산이 여러 갈래로 나뉘어 있어 실무자들이 헷갈리는 지점을 결정론적으로
풀어주는 것이 핵심.

**세션을 새로 시작한다면 CLAUDE.md부터 읽을 것.**

## 문서
- `CLAUDE.md` — 세션 간 인수인계 문서 (가장 먼저 읽을 것)
- `REGULATION-NOTES.md` — 규정 리서치 노트 (출처·신뢰도 표시)
- `CONCEPT.md` — 판정 흐름 개념도 (Mermaid)
- `ROADMAP.md` — 개발 로드맵

## 아키텍처
```
Input → Engine(pure/deterministic) → Snapshot(immutable) → Report → UI
```
[[safety-cert-checker]](arcsafe-safety-cert-checker) 저장소와 동일한
패턴을 따른다.

**중요**: 이 저장소는 유해위험방지계획서만 다룬다. PSM(공정안전보고서)
중대변경은 완전히 다른 법조문·고시 체계이며, 별도 프로젝트로 다뤄야 한다
(ROADMAP.md 참조).

## 현재 상태
Phase 0(규정 확정) 진행 중 — 아직 코드 없음. CLAUDE.md의 "지금 상태"
섹션 참조.
