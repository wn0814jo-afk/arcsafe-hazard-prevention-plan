# ENGINE-DESIGN.md — STEP 5 Engine 설계 (2026-09-26, 세션5 M4 재설계로 0.2.0 갱신)

RULE-CONTRACT.md(승인됨: 2026-09-25, commit 3b49e91; **모듈4는 세션5
재작성 후 재승인됨, commit 2feffff**)를 코드로 옮긴 결과물의 설계
기록. 구현 파일: `law-basis.js`, `data.js`, `engine.js`(0.2.0),
`tests.js`(82/82). **UI/Regulatory Map/Report는 아직 구현하지 않았다**
— 이번 단계 범위 밖.

**세션5 갱신 요약**: 최초 구현(0.1.0)의 OPEN-ISSUE-M4-1(모듈4 기본
기준표와 변경트리거의 결합방식 불명확)을 법 제42조제1항제2호 원문으로
해소 — 모듈4를 **작업형태별 배타적 3경로**(설치/전체이전, 주요구조부분
변경, 이설=미확정)로 재설계했다. 또한 OPEN-ISSUE-M4-2(시행령
제43조제2항이 PSM 혼입이라는 판단)는 **오판이었음이 밝혀져 철회**됐다
— 고시 제3조제2호가 이 조문을 명시적으로 인용하므로 유효한 근거다.
아래 2·3·10절이 이 내용으로 갱신됐다.

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
`engine.js`).

`evaluate()`는 항상 4개 모듈을 전부 호출한다(short-circuit 없음,
Invariant 4/5). 모듈 2·3은 모듈 1의 **status**(applicability 아님)를
선행조건으로 그대로 재사용한다 — 모듈 1의 표시상 적용범위와 그 내부
판정값은 별개다(아래 3절).

**모듈4(세션5 재설계) — 작업형태별 배타적 3경로**:

```
evaluateModule4(input)
├─ workType ∈ {NEW, FULL_RELOCATION}
│    └─ evaluateM4Installation(input.equipment)   — NOTICE_3 기준표
│
├─ workType === MODIFICATION
│    └─ evaluateM4Modification(input.equipmentChange) — NOTICE_2_1_6 가~마목
│
└─ workType === PARTIAL_RELOCATION
     └─ 항상 status=UNKNOWN, unresolvedLegalIssue=
        'OPEN-ISSUE-M4-RELOCATION-PARTIAL' (applicability는 APPLICABLE —
        "적용 안 됨"이 아니라 "법적 판정기준이 아직 확정 안 됨"이라는
        뜻이므로 NOT_APPLICABLE_TO_WORK_TYPE과 구분한다)
```

두 경로(installation/modification)를 항상 둘 다 계산하되, **현재
workType에 해당하는 경로의 status만 M4의 최종 status로 채택**한다 —
`or3(installation, modification)`로 합치지 않는다(검토자 지적: workType
이 MODIFICATION인데 input.equipment가 설치기준을 충족해도 설치경로가
TARGET에 기여하면 안 됨 — tests.js I1/J1/J2로 검증). 적용되지 않는
경로는 `applicability: NOT_APPLICABLE_TO_WORK_TYPE`으로 표시하되 그
경로의 status 자체는 계속 채워서(설치경로는 `NOT_TARGET`로 스킵,
변경경로도 동일) Snapshot에서 "이 경로가 왜 안 쓰였는지" 추적 가능하게
한다.

건조설비 변경경로만 두 갈래(A: 열원종류 변경, B: 건조대상물 변경 —
고시 제3조제3호 **목적분류만** 재참조, 50kg/h·50kW 크기기준은 재적용
안 함)로 나뉘고, 나머지 4개 설비는 "기존 대상설비(existingTarget)
AND 변경사유" 단일 조건이다.

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
  engineVersion,        // '0.2.0' (engine.js ENGINE_VERSION)
  ruleVersion,          // 'RULE-CONTRACT@M4-reapproved-2026-09-26(commit-2feffff)'
  input,                // 호출 시점 input의 깊은 복제(불변)
  moduleResults: {
    module1: { ruleId, status, applicability, legalBasis, reason, inputsUsed },
    module2: { ... },
    module3: { ... },
    module4: {
      ruleId: 'M4', status, applicability, legalBasis, reason,
      unresolvedLegalIssue,  // PARTIAL_RELOCATION일 때만 'OPEN-ISSUE-M4-RELOCATION-PARTIAL'
      paths: {
        installation: { ruleId: 'M4-INSTALL', status, applicability, legalBasis, equipmentResults },
        modification: { ruleId: 'M4-CHANGE', status, applicability, legalBasis, equipmentResults },
      },
    },
  },
  finalStatus,
  determinationCompleteness,
  reasons,              // TARGET인 모듈의 ruleId 배열, 예: ['M1','M4']
}
```

모듈4는 `paths.installation`/`paths.modification` 두 경로 결과를 모두
보존한다 — 실제 채택된 경로는 `input.workType`에 따라 결정되지만
(2절), 채택되지 않은 경로도 `applicability: NOT_APPLICABLE_TO_WORK_TYPE`
와 함께 Snapshot에 남아 "왜 이 경로가 안 쓰였는지" 추적 가능하다.

각 모듈 결과는 `legalBasis`(law-basis.js의 ruleId 배열)를 갖고 있어
Report/Regulatory Map이 나중에 `LAW_BASIS[ruleId]`로 조문 원문을 그대로
가져올 수 있다 — Report가 원래 입력을 추측해서 재판정하지 않는다
(STEP 5 지시 15번).

## 7. Versioning

- `RULE_VERSION`(law-basis.js) = 법적 기준의 적용 버전. 지금은
  `RULE-CONTRACT@M4-reapproved-2026-09-26(commit-2feffff)` — RULE-CONTRACT.md가
  다시 개정·재승인되면 이 문자열을 그때의 승인일/커밋으로 바꾼다.
- `ENGINE_VERSION`(engine.js) = 판정 Engine 구현 버전(`0.2.0`, semver,
  세션5 M4 재설계로 0.1.0→0.2.0). 법적 기준이 그대로여도 코드 리팩터링만
  있으면 이 값만 올린다.
- 둘은 독립적으로 관리한다 — safety-cert-checker의 `engineVersion`/
  `ruleSetVersion`/`legalBasisVersion` 분리 패턴과 같은 원칙.

## 8. 테스트 매트릭스 (tests.js, 82/82 통과)

- A. 모듈1: 대상업종+300kW(TARGET) / 299kW(NOT_TARGET) / 비대상업종
  (NOT_TARGET) / 업종·용량 각각 미입력(UNKNOWN) / 비대상업종 확정+용량
  미입력(NOT_TARGET, AND-false 우선순위 검증)
- B. 모듈2: 100kW 경계(TARGET/99kW NOT_TARGET) / 모듈1 선행조건 불충족
  (NOT_TARGET) / 동일모델 제외 적용 전후(150kW→TARGET, 150-60=90kW→
  NOT_TARGET) / 입력누락(UNKNOWN) / applicability 작업형태별 확인
- C. 모듈3: 100kW 경계 / **핵심**: 비대상업종+이설150kW(NOT_TARGET —
  세션4 3차 재감사로 추가된 전제조건이 실제로 작동하는지 검증) /
  계약용량미달(NOT_TARGET) / 입력누락(UNKNOWN) / 모듈2 예외 미전파 확인
- D. 모듈4(설치경로, 세션1 작성분 — 세션5 재설계 후에도 그대로 유효):
  5종 설비 전부 RULE-CONTRACT.md 표의 경계값(3톤, 50kg/h, 50kW, 1000kg,
  60/150㎥/분)에서 정확히 갈리는지 각각 검증. 대상설비 미입력(UNKNOWN)
  vs "없음" 명시(NOT_TARGET) 구분. 화학설비는 별표9 수치 미확인 시
  UNKNOWN(추측 금지) 검증. 모듈1과 무관하게 독립 평가 검증(D17)
- E. 종합 4개 시나리오 — 검토자가 승인 직전 데스크체크한 4가지를 회귀
  테스트로 고정. **E2·E3는 세션5 M4 재설계로 기대값 정정**(증설·이설
  모두 M4가 이제 UNKNOWN → determinationCompleteness도 INCOMPLETE로
  변경 — 계약 변경에 따른 정상 수정, 완화 아님)
- F. 모듈4 설치/전체이전(세션5 신규, `evaluateM4Installation`): 3톤
  용해로 경계값, 별표9 충족+제43조2항 제외설비 조합, 전체이전이 설치와
  동일 기준 적용, 건조설비·가스집합용접장치·환기설비 경계값
- G. 모듈4 주요구조부분변경(세션5 신규, `evaluateM4Modification`):
  5종 설비 전부(용해로/화학설비/건조설비 A·B경로/가스집합용접장치/
  유해물질설비) — 기존 대상설비 전제 + 각 목 트리거, 크기기준 재적용
  없음을 각각 검증
- H. 모듈4 변경경로 UNKNOWN(세션5 신규): 기존 대상설비 여부 미확인,
  변경조건 미확인, 신규 목적 미확인, equipmentChange 자체 없음(증설
  vs 신설에서 의미가 다름을 구분)
- I. 경로 배타성·독립성·provenance(세션5 신규): workType이 다른 경로의
  입력을 무시하는지, 이설이 어느 경로로도 추측 매핑되지 않는지, M1과
  M4의 독립성, Snapshot의 path-level provenance
- J. workType×equipmentChange 허용조합 + 이설 applicability 확인(검토자
  재검증 요청 반영): 신설/전체이전에 equipmentChange가 동봉돼도 무시,
  증설에 equipment(설치용)만 있고 equipmentChange 없으면 UNKNOWN, 이설의
  applicability는 APPLICABLE(NOT_APPLICABLE_TO_WORK_TYPE 아님)
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

## 10. 미해결 쟁점

### ✅ 해소됨 — OPEN-ISSUE-M4-1: 모듈4 기본기준표 vs 변경트리거의 결합 방식

**세션5에서 해소**. 법 제42조제1항제2호 원문("설치·이전하거나 그 주요
구조부분을 변경하려는 경우" — 제1호와 동일한 문장구조)과 고시
제2조제4호("이전"의 정의, 법 제42조제1항 제1호·제2호 공통)를 확보해
결합 방식을 확정했다:

```
M4
├─ 설치/전체이전(workType ∈ {NEW, FULL_RELOCATION}) → NOTICE_3 기준표
├─ 주요구조부분변경(workType === MODIFICATION)        → NOTICE_2_1_6 가~마목
└─ 이설(workType === PARTIAL_RELOCATION)              → UNKNOWN(아래 참고)
```

`engine.js`(0.2.0)의 `evaluateModule4`/`evaluateM4Installation`/
`evaluateM4Modification`이 이 구조를 그대로 구현한다(2절 참고).
`NOTICE_2_1_6`은 이제 `legalBasis`로 실제 사용된다.

### 미해결 — OPEN-ISSUE-M4-RELOCATION-PARTIAL: 모듈4 일부이전(이설)

고시 제2조제4호의 "이전"은 "건설물·기계·기구 및 설비 등 **일체**를
옮기는 것"(전체이전)만 정의한다. 일부이전에 대응하는 정의가 법
제42조제1항제2호(모듈4) 계열 조문 어디에도 없다 — 모듈3(고시
제2조제1항제5호 나목)의 "일부를 옮겨서 설치" 정의는 법 제42조제1항
**제1호 전용**이라 모듈4에 임의로 확장하지 않는다.

`engine.js`는 이를 **status=UNKNOWN, applicability=APPLICABLE,
unresolvedLegalIssue='OPEN-ISSUE-M4-RELOCATION-PARTIAL'**로 표현한다
— `NOT_APPLICABLE_TO_WORK_TYPE`을 쓰지 않는 것이 중요하다(검토자
지적: "적용 안 됨"과 "법적 판정기준이 아직 확정 안 됨"은 다른
개념). tests.js J3으로 이 구분을 검증했다.

**필요한 다음 조치**: 이 부분을 확정하려면 추가 법령 조사 또는
고용노동부 유권해석이 필요하다 — RULE-CONTRACT.md 재검토 대상.

### ~~철회됨~~ — 舊 OPEN-ISSUE-M4-2: "시행령 제43조제2항 PSM 혼입" 판단

**세션5에서 이 판단 자체가 오판으로 밝혀져 철회됐다.** 시행령
제43조가 "공정안전보고서의 제출 대상"이라는 제목을 가진 것은 사실이나,
고시 제3조제2호(화학설비 정의)가 그 제2항(제외설비 목록)을 명시적으로
인용한다(U-LEX/law.go.kr 고시 원문으로 재확인) — 법령이 다른 조문을
인용/준용하는 것은 흔한 일이며 혼입 오류가 아니다. `excludedByDecree43_2`
필드는 유지하고, 그 법적 의미("시행령 제43조제2항에서 정한 설비에
해당하여 고시 제3조제2호의 화학설비 대상에서 제외되는가?")를
RULE-CONTRACT.md/law-basis.js(`DECREE_43_2`)에 고정했다.

### 미해결 — 화학설비 별표9 수치표

RULE-CONTRACT.md는 화학설비 기준을 "안전보건규칙 별표9 위험물질
기준량 이상"이라고만 인용하고, 물질별 실제 기준량 수치표(kg/L 등)는
옮기지 않았다.

`evaluateChemicalEquipment_Installation()`은 이 수치를 추측하지 않고,
호출자가 직접 판정한 `meetsHazardousSubstanceThreshold`(boolean)를
입력으로 받는다. 이 값이 없으면 `UNKNOWN`을 반환한다(tests.js D15,
F3/F4로 검증) — safety-cert-checker의 "LEGAL SOURCE BLOCKED" 상태와
같은 취급이다. 제외설비 여부(`excludedByDecree43_2`)는 위에서 설명한
대로 이미 확정된 근거를 쓴다 — 남은 미해결은 **별표9 수치표 자체
뿐**이다.

**필요한 다음 조치**: 별표9 원문(물질별 기준량 표)을 원문 대조해
REGULATION-NOTES.md/RULE-CONTRACT.md에 추가한 뒤에만 engine.js가 이
수치를 직접 계산하도록 승격할 수 있다.

## 11. Report/UI 관련 미착수 사항 (범위 밖, 기록만)

- Report/Regulatory Map/UI 구현 — STEP 6 이후
- Invariant 10("UI가 독자적으로 판정하지 않음")은 UI가 없어 지금은
  검증 대상이 없다 — UI 구현 시 반드시 게이트로 추가할 것
