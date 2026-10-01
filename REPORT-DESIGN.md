# REPORT-DESIGN.md — STEP 6-1 Report 설계 (승인 반영본)

상태: 설계 승인(검토자) + 수정 4건·확정 사항 반영 완료. **구현 미착수.**
기준: Engine 0.2.0 / `RULE_VERSION` = `RULE-CONTRACT@M4-reapproved-2026-09-26(commit-2feffff)`
SSOT: Snapshot (`engine.js`의 `evaluate()` 반환값). 법적 판정 SSOT는 `RULE-CONTRACT.md`.
이 문서는 법적 판단을 복제하지 않는다.

---

## 1. 구조와 원칙

```
Snapshot ──▶ buildReportModel(snapshot, lawBasis) ──▶ Renderer
             (순수 함수, 읽기 전용)                   (모델을 그리기만 함)
```

- Report는 Snapshot을 **해석하지 않고 사용자 화면용으로 매핑**한다.
- `engine.js`, `law-basis.js`, `data.js`는 수정하지 않는다.
- Report는 `engine.js`의 `evaluate`와 `data.js`를 import하지 않는다.
  `LAW_BASIS`는 `buildReportModel`의 **인자**로 받는다(직접 import 금지).
- Engine 재호출, 임계값 재계산, 조건 재판정 금지 (Invariant 10).

## 2. Snapshot → Report 필드 매핑

| Report 항목 | Snapshot 필드 |
|---|---|
| 최종 판정 | `finalStatus` |
| 판정 완전성 | `determinationCompleteness` |
| 대상 사유 **모듈** | `reasons` (TARGET이면서 APPLICABLE인 모듈 ID 배열) |
| 작업 유형(헤더) | `input.workType` |
| Module 1~3 | `moduleResults.module1~3`: `status`, `applicability`, `legalBasis`, `reason`, `inputsUsed` |
| M2 세부 | `inputsUsed`: `grossRatedCapacityIncreaseKw`, `sameManufacturerSameModelExcludedKw`, `netRatedCapacityIncreaseKw` (Engine 산출값 그대로) |
| M3 세부 | `inputsUsed.relocatedRatedCapacityKw` |
| Module 4 | `module4`: `status`, `applicability`, `legalBasis`, `reason`, `paths`, `unresolvedLegalIssue` |
| M4 설치/전체이전 | `paths.installation` (`M4-INSTALL`) |
| M4 주요구조부분변경 | `paths.modification` (`M4-CHANGE`) |
| M4 설비별 결과 | `paths.*.equipmentResults.{meltingFurnace, chemicalEquipment, dryingEquipment, gasWeldingAssembly, ventilation}` = `{three?, reason}` |
| M4 이설 미확정 | `module4.unresolvedLegalIssue` |
| 근거 | `legalBasis[]` → `LAW_BASIS[id]` |
| 출처 | `snapshotId?`, `createdAt?`, `engineVersion`, `ruleVersion` |

Snapshot은 `JSON.parse(JSON.stringify())`로 복제되므로 `undefined` 키는 존재하지 않는다.
`three`, `unresolvedLegalIssue`, `snapshotId`, `createdAt`은 **키 부재**가 정상 상태다.
Snapshot에 없는 필드는 화면에서 생략한다(Report가 채우지 않음).

## 3. 계약 (구현 시 반드시 지키는 것)

### C1. `three` 해석 — 3상태까지만

| `three` | 표시 |
|---|---|
| `true` | 조건 충족 |
| `false` | 조건 미충족 |
| 키 없음 | 확인 필요 |

`false`를 "해당 없음", "대상 아님", "법 적용 제외" 등으로 **재해석하지 않는다.**
`reason`은 보조 설명이며 이 3상태를 바꾸지 못한다.

### C2. `reason` 사용 범위 / 확인 필요 안내 생성 범위

- 엔진 `reason`은 `ReportModel`에 **원자료로 보존만** 하고 **사용자 결과 화면에는 기본 표시하지 않는다**
  (개정 2026-10-01, UI 설계 D-C). 사용자 화면은 구조 필드에 대응하는 구조화된 사용자 문구를 쓴다.
  **파싱하지 않고, 이를 근거로 분기하지 않으며, 제목·판정으로 쓰지 않는다.**
- `module4.reason`은 TARGET일 때 내부 키가 앞에 붙고 이설일 때 내부 이슈 ID가 들어 있으므로
  제목·요약에 쓰지 않는다.
- 사용자 안내 문구의 출처는 아래 세 가지로 **한정**한다.
  1. 구조 필드(`status`, `applicability`, `three`, 키 부재)에 대응하는 **고정 문구**
  2. `unresolvedLegalIssue`가 있을 때의 **고정 문구**(§6의 이설 문구)
  3. Snapshot에서 직접 확인 가능한 **입력 보완 안내** (예: `inputsUsed`의 값이 없는 항목,
     `equipmentResults`에 `three`가 없는 설비 → "이 항목의 세부 조건 입력이 필요합니다")
- **"어떤 법적 기준을 추가로 확인해야 하는가"를 Report가 만들어내지 않는다.**
  (예: 특정 조문·별표를 확인하라는 문장을 Report가 스스로 생성하지 않음)

### C3. `reasons`와 `equipmentResults`의 역할 분리

- `reasons` → **어느 Module이 TARGET에 기여했는가**까지만.
- M4의 **어느 설비** 때문에 TARGET인지 → `paths.*.equipmentResults`의 `three:true`에서만 도출.
- `reasons`로 설비를 특정하지 않고, `module4.reason`에서도 설비를 추출하지 않는다.

### C4. 법적 근거는 Snapshot provenance만

- `legalBasis`에 있는 ID만 표시한다. **Snapshot provenance에 없는 근거를 끼워 넣지 않는다.**
- `DECREE_43_2`는 현재 어떤 `legalBasis`에도 없으므로 Report에서 표시하지 않는다(§9 후속 이슈).
- `NOTICE_3.openItems`는 Snapshot/`LAW_BASIS`에 등록된 **provenance 데이터로 보존**한다.
  - `buildReportModel`은 M4 설치 경로의 법적 근거 항목과 연결 가능한 구조로 `openItems`를
    모델에 **원자료 그대로 싣는다**(가공·요약·번역 없음).
  - 그러나 등록 문구에 개발자용 표현("이 저장소", "LEGAL SOURCE BLOCKED",
    `RULE-CONTRACT.md` 언급 등)이 있으므로, **`openItems` 문구를 사용자 화면에 그대로 노출하지
    않는다.** 등록 문구 그대로 표시하는 것은 Report 계약이 아니다.
  - Report는 자체적으로 대체 문구를 만들거나 법적 의미를 재해석하지 않는다. 별표9 물질별
    기준량이나 적용 여부도 계산·설명·재구성하지 않는다.
  - 사용자 화면에서의 `openItems` 표시 여부·방식은 사용자용 근거 문구가 정비된 뒤
    (`law-basis.js` 별도 품질 개선 사안, §11-3) 결정한다. 그때까지 사용자 화면에는 미노출.
  - 이번 STEP 6-1에서는 `law-basis.js`를 수정하지 않는다.

### C5. 고시 제6조(제출면제)는 Report에서 언급하지 않는다

"제출 면제 여부는 이 결과에 포함되지 않음" 같은 범위 문구도 넣지 않는다. 이번 Report 범위 밖.

### C6. Pro/Free 무관

결과·표시 내용은 요금제에 따라 달라지지 않는다.

## 4. 헤드라인 (고정 4종)

| `finalStatus` + `determinationCompleteness` | 헤드라인 | 부제 |
|---|---|---|
| TARGET + COMPLETE | 유해·위험방지계획서 제출 대상에 해당합니다. | 없음 |
| TARGET + INCOMPLETE | 유해·위험방지계획서 제출 대상에 해당합니다. | 일부 확인이 필요한 항목이 있습니다. |
| UNKNOWN + INCOMPLETE | 대상 여부 확인이 필요합니다. | 없음 |
| NOT_TARGET + COMPLETE | 입력하신 내용 기준으로는 제출 대상에 해당하지 않습니다. | 없음 |

- 4종은 `(finalStatus, completeness)`로 나올 수 있는 조합의 전부다. 그 외 조합은 Report가
  임의로 문구를 만들지 않고 **오류 상태**로 표시한다.
- TARGET + INCOMPLETE를 "대상 판정이 불확실하다"고 표현하지 않는다(completeness는 별도 축).
- NOT_TARGET에는 안전하다는 인상을 주는 색·아이콘을 쓰지 않는다.

## 5. 화면 구조

- **A. 결과 요약**: §4 헤드라인 + 작업 유형(`input.workType`) 표시.
- **B. 대상 판단 근거**: `reasons`의 모든 모듈을 나열(여러 개면 전부). M4가 포함되면 C3에 따라 설비 표시.
- **C. 상세 판정**: Module 1~4 카드.
  - `applicability === APPLICABLE` → 대상 / 대상 아님 / 확인 필요.
  - `NOT_APPLICABLE_TO_WORK_TYPE` → `status`를 표시하지 않고 "이번 작업 유형에는 적용되지 않음"만.
  - 증설·이설의 M1은 "독립 제출 사유 아님 · 다른 항목의 전제조건"으로 별도 표기하며, 그 `status`는 전제조건 값으로만 표시.
  - 카드 구성: 결과 / 구조 필드 기반 사용자 문구 / 근거 보기. 엔진 `reason`은 표시하지 않는다(D-C).
- **D. M4 상세**: §6.
- **E. 확인 필요**: §7.
- **F. 출처**: 사용자 화면에는 `createdAt`만(Snapshot에 있을 때만, 없으면 생략). `snapshotId`,
  `engineVersion`, `ruleVersion` 원문은 사용자 화면에 표시하지 않는다(개정 2026-10-01, UI 설계 D1).

## 6. M4 표시

- 본문은 `paths.*.applicability === APPLICABLE`인 경로만 읽는다. `workType`으로 경로를 재추론하지 않는다.
- 설치/전체이전, 주요구조부분변경 각각 5개 설비 행. 표시명은 Report의 정적 사전으로 만든다.
  내부 키(`meltingFurnace` 등)·`NOTICE_*` ID를 주 화면에 쓰지 않는다.
- 주요구조부분변경 경로에는 "기존 대상설비 전제" 주석을 붙인다.
- 경로 수준에서는 `status`에 대응하는 구조화된 문구(대상 / 대상 아님 / 확인 필요)만 표시한다.
  경로의 엔진 `reason` 문장은 표시하지 않는다(D-C).
- 채택되지 않은 경로는 "이번 작업 유형에는 적용되지 않는 경로" 한 줄, 상태 표시 없음.
- **이설**(`unresolvedLegalIssue` 존재): 설비 행 없이 아래 고정 문구 패널만 표시한다.

> 일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.
> 따라서 이 항목은 '대상 아님'으로 처리하지 않고 '확인 필요'로 남깁니다.
> 이 항목이 확인되지 않아 전체 판단이 완전하지 않습니다.
> 이설에 해당하는 경우 관련 기준을 별도로 확인해 주세요.

(관할 기관·전문가 확인 지시는 Snapshot에 근거가 없어 넣지 않는다. 내부 이슈 ID `OPEN-ISSUE-…`는 주 화면에 노출하지 않는다.)

## 7. 확인 필요 (UNKNOWN) 표시

- 사용자에게는 "UNKNOWN"·"판단 불가" 대신 **"확인 필요"**로 통일한다.
- 종류 구분:
  - 입력 보완형: 입력 누락으로 생긴 UNKNOWN → C2-3의 범위 내 입력 보완 안내.
  - 기준 미확정형: `unresolvedLegalIssue` 존재 → §6 고정 문구. 입력으로 해소되지 않음.
- 각 항목: 무엇이 확인되지 않았는지(구조 필드 기반) + `completeness === INCOMPLETE`일 때만 영향 문구.
  "다음에 확인할 것"은 C2 범위를 벗어나 생성하지 않는다.
- 이설은 현재 계약상 M4가 항상 UNKNOWN이므로 `finalStatus`가 NOT_TARGET, `completeness`가 COMPLETE인
  결과가 나올 수 없다. Report는 이를 완화하지 않는다.

## 8. 근거 표시 (2단계, 개정 2026-10-01 — 검토자 승인 D1)

사용자 화면 **허용 목록(allow-list)**: `statute`, `text`, `effectiveDate`, `noticeNo`,
`reliability`(`PRIMARY` → "1차 자료 대조 확인"), 그리고 Snapshot에 있으면 `createdAt`.

사용자 화면 **금지**: `note`, `openItems`, `ruleContractRef`, `ruleId`, `ruleVersion` 원문.

1. 기본: 카드 하단에 `statute` 한 줄.
2. 펼침: 등록된 근거 문구(`text`, "조문 원문"이라고 부르지 않음), 시행일, 고시번호, 신뢰 등급.

- 개발자용 provenance(`ruleId`, `ruleContractRef`, `note`, `openItems`, `ruleVersion` 등)는
  `buildReportModel`의 모델에는 보존할 수 있으나 일반 사용자 UI에는 포함하지 않는다.
  개발자용 진단 패널은 별도 개발자 기능으로 향후 검토한다(이번 범위 밖).
- 조회 실패 시 "근거 데이터 없음"만 표시(내부 ID 노출 금지).
- Snapshot의 `ruleVersion` ≠ 현재 `RULE_VERSION`이면 **불일치 여부만** 검사해 사용자용 고정
  안내 배너를 띄우고 렌더링은 계속한다. 내부 버전 문자열 자체는 표시하지 않는다.

## 9. 금지 목록 (Report 전체)

- Snapshot에 없는 사실 생성 (`createdAt` 자동 생성 포함)
- Engine 재계산, 임계값 재계산(`THRESHOLDS`, 순증가분 뺄셈 등)
- 법령 조건 재판정, `three:false` 재해석, `reason` 파싱
- UNKNOWN → NOT_TARGET 변환
- N/A 모듈·N/A 경로의 `status`를 결과로 표시
- 이설의 M4를 M3나 설치경로로 대체 해석
- 고시 제6조 언급, Pro/Free에 따른 결과 변경
- Snapshot에 없는 근거(`DECREE_43_2` 등) 추가, 새로운 법적 확인사항 생성
- `module4.reason`을 제목으로 사용, `reasons`로 설비 특정

## 10. 구현 시 필수 테스트 게이트 (Invariant 10)

- 헤드라인 4종이 `(finalStatus, completeness)`에 1:1 매핑되고, 그 외 조합은 오류 상태.
- `buildReportModel`이 Snapshot을 변경하지 않음(freeze 상태에서 동작).
- N/A 모듈·경로의 `status`가 결과 필드로 나오지 않음.
- 모든 UNKNOWN이 "확인 필요"로 표시됨; `three` 키 부재 → 확인 필요.
- `three:false`가 "해당 없음/대상 아님" 등으로 변환되지 않음.
- 이설에서 §6 고정 문구가 반드시 나오고 NOT_TARGET이 나오지 않음.
- 주 화면 모델에 내부 ID(`OPEN-ISSUE`, `NOTICE_`, `DECREE_`, 설비 내부 키)가 노출되지 않음.
- M4 대상 설비가 `equipmentResults`에서만 도출됨(`reasons`·`reason`에서 도출하지 않음).
- `legalBasis`에 없는 근거가 나오지 않음(`DECREE_43_2` 미표시).
- `openItems`가 모델에 원자료 그대로 보존되고(가공 없음), 사용자 화면 출력에는 그 문구와
  개발자용 표현("이 저장소", "LEGAL SOURCE BLOCKED")이 나타나지 않음.
- 제6조·Pro/Free 관련 문구·분기가 없음.
- (D-C 개정) 렌더된 사용자 화면에 엔진 `reason` 문자열이 나타나지 않고, 화면 문구가 구조 필드 조회로만
  결정됨.
- (D1 개정) 사용자 화면에 `note`, `openItems`, `ruleContractRef`, `ruleId`, `ruleVersion` 원문,
  `snapshotId`, `engineVersion`이 나타나지 않음. `ruleVersion` 불일치 시 배너만 표시되고 내부 버전
  문자열은 표시되지 않음. 출처는 `createdAt`만(있을 때).
- Report 소스가 `engine.js`의 `evaluate`·`data.js`를 import하지 않음(정적 검사).

## 11. 후속 품질 이슈 (Report 범위 밖 — 기록만)

1. **Engine provenance**: M4 화학설비의 영 제43조제2항 제외 근거(`DECREE_43_2`)가 Snapshot
   `legalBasis`에 연결돼 있지 않다. 연결 여부는 별도 검토(Engine 변경 → 재승인 필요).
2. **`three` 키 부재 의존**: JSON 복제로 `undefined`가 사라지는 동작에 Report가 의존한다.
   이 동작을 고정하는 테스트를 둔다. 명시적 상태 필드 도입은 별도 승인 사안.
3. **사용자용 근거 문구 정비**: `NOTICE_3.openItems` 등록 문구에 개발자용 표현("이 저장소",
   "LEGAL SOURCE BLOCKED", `RULE-CONTRACT.md` 언급 등)이 있다. Report는 이를 사용자 화면에
   노출하지 않고 provenance 데이터로만 보존한다(C4). 사용자용 문구 정비는 `law-basis.js`
   계약 변경(재승인)이 필요한 별도 품질 개선 사안이며 STEP 6-1 범위 밖이다.
4. **이설**: 현재 계약상 항상 INCOMPLETE. 해소는 `RULE-CONTRACT.md` 재검토 사안.
5. **`note` 필드 표시 방식** — 해소(2026-10-01): `openItems`와 동일하게 사용자 화면 미노출로 확정(§8).
   (아래는 당시 기록): `LAW_BASIS`의 `note` 일부에도 내부 ID·개발자용 표현이
   있다(예: `NOTICE_2_4`의 note에 `OPEN-ISSUE-M4-RELOCATION-PARTIAL`, `NOTICE_2_1_6`의 note에
   `RULE-CONTRACT.md` 언급). §8의 펼침에서 `note`를 그대로 보여주면 §10의 내부 ID 미노출
   게이트와 충돌하므로, `note`의 사용자 화면 표시 방식은 6-2 설계 전에 결정한다
   (그때까지 `openItems`와 동일하게 미노출로 취급하는 안이 일관적).
6. **OPEN-ISSUE-ENGINE-M4-CHEM-EXCLUSION-UNKNOWN** (D-E, 2026-10-01): 화학설비 설치 경로에서 시행령
   제43조제2항 제외 여부가 미확인(키 없음)이어도 Engine이 "제외 아님"으로 취급하는 동작. 별도 Engine 계약
   검토 사안이며 Report는 이를 보정하지 않는다 — **Report에서 TARGET을 UNKNOWN으로 다시 바꾸지 않는다.**
   상세는 UI-DESIGN.md §14.

## 12. 이 문서의 승인 반영 내역

- 수정 ① `three:false` → "해당 없음" 해석 삭제 (C1)
- 수정 ② "다음에 확인할 것" 임의 생성 제한 (C2)
- 수정 ③ `DECREE_43_2` 미표시 + 후속 이슈 기록 (C4, §11-1)
- 수정 ④ `openItems` 등록 데이터 그대로 표시 (C4)
- 확정: 제6조 무언급 (C5) / 이설 고정 문구 (§6) / 헤드라인 4종 (§4) / `reasons`-`equipmentResults` 역할 분리 (C3)
- 확정: `ruleVersion` 불일치 배너(렌더링 계속), 헤더에 작업 유형만 표시(전체 입력 요약은 6-2).
- 개정 ⑦(2026-10-01, UI 설계 D-C 승인): 엔진 `reason`은 사용자 화면에 기본 표시하지 않음(§3-C2, §5-C, §6).
  D-E OPEN-ISSUE를 §11-6에 기록.
- 개정 ⑥(2026-10-01, UI 설계 D1 승인): §5-F 출처는 `createdAt`만, §8 근거 표시는 2단계(기술 정보 단계 삭제),
  `note`·`openItems`·`ruleContractRef`·`ruleId`·`ruleVersion` 원문 사용자 화면 금지, 개발자 진단 패널은
  일반 사용자 UI에서 제외(별도 개발자 기능으로 향후 검토).
- 수정 ⑤(커밋 전 최종): `openItems`는 provenance로 보존하되 등록 문구를 사용자 화면에 그대로
  노출하지 않음(C4). 사용자용 근거 문구 정비는 `law-basis.js` 별도 사안(§11-3).
