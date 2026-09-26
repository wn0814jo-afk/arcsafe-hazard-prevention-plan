# ENGINE-DESIGN.md — STEP 5 Engine 설계 (2026-09-26)

RULE-CONTRACT.md(승인됨: 2026-09-25, commit 3b49e91)를 코드로 옮긴
결과물의 설계 기록. 구현 파일: `law-basis.js`, `data.js`, `engine.js`,
`tests.js`. **UI/Regulatory Map/Report는 아직 구현하지 않았다** —
이번 단계 범위 밖(STEP 5 지시 2번 "이번 단계에서 하지 말 것").

## 1. Engine 구조

```
Input → Engine(pure) → Snapshot
```

- `engine.js`의 `evaluate(input, meta)`가 유일한 공개 진입점.
- DOM/localStorage/네트워크/현재시각(암묵적)/전역 mutable state를 쓰지
  않는다. 시각 정보가 필요하면 호출자가 `meta.now`로 명시적으로 넘긴다
  — Engine 내부에서 `Date.now()`를 호출하지 않는다(STEP 5 지시 4번).
- 동일 input → 항상 동일 snapshot (tests.js Invariant 1, 1b로 검증:
  같은 input을 100회 반복 실행해도 결과 동일).
- 반환된 Snapshot은 `Object.freeze`로 깊은 동결(top-level, moduleResults,
  각 module, input clone까지) — safety-cert-checker에서 발견됐던
  "BASIS 레지스트리 freeze 누락으로 변조 가능했던" 버그를 재발시키지
  않기 위해 law-basis.js의 각 엔트리도 `Object.freeze`로 잠갔다.

## 2. Module 구조

4개 모듈을 각각 순수 함수로 분리(`evaluateModule1`~`evaluateModule4`,
`engine.js`). Module 4는 5종 설비를 다시 개별 함수로 분리
(`evaluateMeltingFurnace`, `evaluateChemicalEquipment`,
`evaluateDryingEquipment`, `evaluateGasWeldingAssembly`,
`evaluateVentilation`) — 하나의 거대한 if/else가 아니라 법적 규칙 단위로
분리(STEP 5 지시 11번).

`evaluate()`는 항상 4개 모듈을 전부 호출한다(short-circuit 없음,
Invariant 4/5). 모듈 2·3은 모듈 1의 **status**(applicability 아님)를
선행조건으로 그대로 재사용한다 — 모듈 1의 표시상 적용범위와 그 내부
판정값은 별개다(아래 3절).

## 3. status / applicability 모델

RULE-CONTRACT.md가 요구한 대로 **완전히 분리된 두 필드**를 쓴다. 하나의
boolean으로 축약하지 않는다:

```
status:        TARGET | NOT_TARGET | UNKNOWN
applicability:  APPLICABLE | NOT_APPLICABLE_TO_WORK_TYPE
```

- 모듈 1: `applicability`는 작업형태가 [신설]/[전체이전]일 때만
  `APPLICABLE`. 증설·이설이면 `NOT_APPLICABLE_TO_WORK_TYPE`이지만
  `status`는 **똑같이 계산**해서 모듈 2·3에 재사용한다(핵심 — 여기서
  `NOT_APPLICABLE_TO_WORK_TYPE`을 `status: NOT_TARGET`으로 잘못
  일반화하면 모듈2·3 선행조건 판정이 깨진다).
- 모듈 2: `applicability`는 작업형태=[증설·교체·개조]일 때만 `APPLICABLE`.
- 모듈 3: `applicability`는 작업형태=[이설]일 때만 `APPLICABLE`.
- 모듈 4: 항상 `APPLICABLE`(업종·전기용량·작업형태 전부 무관하게 독립
  평가 — RULE-CONTRACT.md 모듈4 "중요(세션4 명시)" 절).

## 4. 3치 논리(three-valued logic) — UNKNOWN을 1급 상태로

`and3(...conditions)` / `or3(...conditions)`가 핵심 헬퍼다. 값은
`true`(충족) / `false`(불충족) / `undefined`(모름) 세 가지만 쓴다.

- AND: 하나라도 `false`면 전체 `false`(다른 조건이 `undefined`여도
  확정 가능) → `NOT_TARGET`. 전부 `true`면 `TARGET`. 그 외는 `UNKNOWN`.
- OR(모듈4의 5종 설비 결합에 사용): 하나라도 `true`면 `TARGET`. 전부
  `false`면 `NOT_TARGET`. 그 외는 `UNKNOWN`.

`missingValue → false`, `undefined → NOT_TARGET`, `NaN → 0`, `null → 0`
같은 축약은 어디에도 없다 — `gte()` 헬퍼가 값이 없으면 명시적으로
`undefined`를 반환하고, 그 `undefined`가 `and3`/`or3`를 거쳐 최종
`UNKNOWN`으로 이어진다(STEP 5 지시 12번, tests.js A4/A5/B6/C5/D13으로
검증).

## 5. finalStatus / determinationCompleteness

```
finalStatus =
  TARGET 모듈(applicability===APPLICABLE인 것만) 하나라도 있음 → TARGET
  TARGET 없고 UNKNOWN 있음                                    → UNKNOWN
  전부 NOT_TARGET                                              → NOT_TARGET

determinationCompleteness =
  UNKNOWN 모듈(APPLICABLE만) 하나라도 있음 → INCOMPLETE
  없음                                      → COMPLETE
```

**중요**: 두 값 다 `applicability === APPLICABLE`인 모듈만 집계 대상에
넣는다. `NOT_APPLICABLE_TO_WORK_TYPE`인 모듈(예: 신설 작업의 모듈 2·3)은
`NOT_TARGET`으로도, `UNKNOWN`으로도 집계에 섞이지 않는다 — STEP 5 지시
13번이 요구한 정확한 처리다. `aggregate()` 함수가 `Object.values(
moduleResults).filter(m => m.applicability === APPLICABLE)`로 먼저
걸러낸 뒤에만 finalStatus/completeness를 계산한다.

## 6. Snapshot / provenance

`evaluate()`가 반환하는 Snapshot:

```
{
  snapshotId,           // 호출자가 meta로 넘김 (Engine이 자체 생성 안 함)
  createdAt,            // 호출자가 meta.now로 넘김
  engineVersion,        // '0.1.0' (engine.js ENGINE_VERSION)
  ruleVersion,          // 'RULE-CONTRACT@approved-2026-09-25(commit-3b49e91)'
  input,                // 호출 시점 input의 깊은 복제(불변)
  moduleResults: {
    module1: { ruleId, status, applicability, legalBasis, reason, inputsUsed },
    module2: { ... },
    module3: { ... },
    module4: { ruleId, status, applicability, legalBasis, reason, equipmentResults },
  },
  finalStatus,
  determinationCompleteness,
  reasons,              // TARGET인 모듈의 ruleId 배열, 예: ['M1','M4']
}
```

각 모듈 결과는 `legalBasis`(law-basis.js의 ruleId 배열)를 갖고 있어
Report/Regulatory Map이 나중에 `LAW_BASIS[ruleId]`로 조문 원문을 그대로
가져올 수 있다 — Report가 원래 입력을 추측해서 재판정하지 않는다
(STEP 5 지시 15번).

## 7. Versioning

- `RULE_VERSION`(law-basis.js) = 법적 기준의 적용 버전. 지금은
  `RULE-CONTRACT@approved-2026-09-25(commit-3b49e91)` — RULE-CONTRACT.md가
  다시 개정·재승인되면 이 문자열을 그때의 승인일/커밋으로 바꾼다.
- `ENGINE_VERSION`(engine.js) = 판정 Engine 구현 버전(`0.1.0`, semver).
  법적 기준이 그대로여도 코드 리팩터링만 있으면 이 값만 올린다.
- 둘은 독립적으로 관리한다 — safety-cert-checker의 `engineVersion`/
  `ruleSetVersion`/`legalBasisVersion` 분리 패턴과 같은 원칙.

## 8. 테스트 매트릭스 (tests.js, 51/51 통과)

- A. 모듈1: 대상업종+300kW(TARGET) / 299kW(NOT_TARGET) / 비대상업종
  (NOT_TARGET) / 업종·용량 각각 미입력(UNKNOWN) / 비대상업종 확정+용량
  미입력(NOT_TARGET, AND-false 우선순위 검증)
- B. 모듈2: 100kW 경계(TARGET/99kW NOT_TARGET) / 모듈1 선행조건 불충족
  (NOT_TARGET) / 동일모델 제외 적용 전후(150kW→TARGET, 150-60=90kW→
  NOT_TARGET) / 입력누락(UNKNOWN) / applicability 작업형태별 확인
- C. 모듈3: 100kW 경계 / **핵심**: 비대상업종+이설150kW(NOT_TARGET —
  세션4 3차 재감사로 추가된 전제조건이 실제로 작동하는지 검증) /
  계약용량미달(NOT_TARGET) / 입력누락(UNKNOWN) / 모듈2 예외 미전파 확인
- D. 모듈4: 5종 설비 전부 RULE-CONTRACT.md 표의 경계값(3톤, 50kg/h,
  50kW, 1000kg, 60/150㎥/분)에서 정확히 갈리는지 각각 검증. 대상설비
  미입력(UNKNOWN) vs "없음" 명시(NOT_TARGET) 구분. 화학설비는 별표9
  수치 미확인 시 UNKNOWN(추측 금지) 검증. 모듈1과 무관하게 독립 평가
  검증(D17)
- E. 종합 4개 시나리오 — 검토자가 승인 직전 데스크체크한 4가지를 그대로
  회귀 테스트로 고정(신설+건조설비/증설+정격증가/이설+정격이설/
  비대상업종+가스집합용접장치)
- Invariant 1~9 — 아래 9절 그대로 자동검증

## 9. Invariant (구현 여부: tests.js에서 전부 자동검증됨)

| # | 내용 | 검증 테스트 |
|---|---|---|
| 1 | 동일 Input → 동일 Snapshot | Invariant 1, 1b(100회 반복) |
| 2 | Engine 실행이 UI 상태(및 입력)를 변경하지 않음 | Invariant 2, 2b(freeze) |
| 3 | UNKNOWN은 NOT_TARGET으로 변환되지 않음 | Invariant 3, A4/A5/B6/C5/D13 |
| 4 | 모듈1 TARGET이어도 모듈2~4 평가가 중단되지 않음 | Invariant 4/5 |
| 5 | 모듈4는 모듈1 결과 때문에 자동 탈락하지 않음 | D17, E4 |
| 6 | 모듈3에 모듈1의 업종+계약용량 선행조건이 적용됨 | Invariant 6, C3 |
| 7 | 모듈2의 동일모델 제외 규칙이 모듈3에 전파되지 않음 | Invariant 7, C6 |
| 8 | finalStatus는 모듈 결과에서만 산출 | Invariant 8/9 |
| 9 | determinationCompleteness는 UNKNOWN 존재 여부에서만 산출 | Invariant 8/9, 8b |
| 10 | UI/Map/Report가 독자적으로 법적 판정을 하지 않음 | 아직 UI가 없어 검증 대상 없음 — UI 구현 시 필수 게이트로 남겨둠 |

## 10. 미해결 쟁점 (임의로 해결하지 않고 기록만 함 — STEP 5 지시 1번)

### OPEN-ISSUE-M4-1: 모듈4 기본기준표 vs 변경트리거의 결합 방식 불명확

RULE-CONTRACT.md는 모듈4에 대해 (a) 5종 설비 기본 판정기준표
(`NOTICE_3` — 3톤/50kg·50kW/1000kg/60·150㎥분)와 (b) "주요구조부분
변경" 트리거 목록(`NOTICE_2_1_6`, 고시 제2조제1항제6호 가~마목)을 둘 다
문서화했지만, 작업형태(특히 증설·교체·개조)에서 이 둘이 어떻게
결합되는지 — (b)가 (a)를 대체하는지, OR로 더해지는지, 아예 별도
모듈(4b)로 취급해야 하는지 — 를 명시하지 않았다.

현재 engine.js는 **(a) 기본 판정기준표만** 구현했다. 이는 RULE-CONTRACT
.md 모듈4 "결과" 절이 명시적으로 정의한 부분("업종·전기용량 요건 불필요,
설비 요건만으로 확정")이라 임의 해석이 아니다. (b)는 `law-basis.js`에
조문만 등록해두고 engine.js에서 아직 사용하지 않는다.

**필요한 다음 조치**: RULE-CONTRACT.md 재검토 시 "증설·교체·개조
작업에서 모듈4를 어떻게 평가하는지"(예: 이미 설치된 대상설비가 가~마
목 사유로 변경되면, 크기가 기준표 미만이어도 TARGET인지)를 명시해야
한다.

### OPEN-ISSUE-M4-2: 화학설비(대상설비 2호) 수치표 미확보

RULE-CONTRACT.md는 화학설비 기준을 "안전보건규칙 별표9 위험물질
기준량 이상"이라고만 인용하고, 물질별 실제 기준량 수치표(kg/L 등)는
옮기지 않았다. 시행령 제43조제2항의 제외설비 목록도 마찬가지다.

engine.js의 `evaluateChemicalEquipment()`는 이 두 수치를 추측하지
않고, 호출자가 직접 판정한 `meetsHazardousSubstanceThreshold`(boolean)
와 `excludedByDecree43_2`(boolean)를 입력으로 받는다. 이 값이 없으면
`UNKNOWN`을 반환한다(tests.js D15로 검증) — safety-cert-checker의
"LEGAL SOURCE BLOCKED" 상태와 같은 취급이다.

**필요한 다음 조치**: 별표9 원문(물질별 기준량 표)과 시행령 제43조제2항
제외설비 목록을 원문 대조해 REGULATION-NOTES.md/RULE-CONTRACT.md에
추가한 뒤에만 engine.js가 이 두 수치를 직접 계산하도록 승격할 수 있다.

## 11. Report/UI 관련 미착수 사항 (범위 밖, 기록만)

- Report/Regulatory Map/UI 구현 — STEP 6 이후
- Invariant 10("UI가 독자적으로 판정하지 않음")은 UI가 없어 지금은
  검증 대상이 없다 — UI 구현 시 반드시 게이트로 추가할 것
