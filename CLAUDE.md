# CLAUDE.md — 이 저장소를 열면 가장 먼저 읽을 것

이 문서는 세션이 끊겨도 다음 Claude 인스턴스가 맥락을 잃지 않도록 하기 위한
인수인계 문서다. **작업을 시작하기 전에 이 문서 전체를 읽고, 작업을 마치기
전에(또는 컨텍스트가 끊기기 전에) 이 문서를 업데이트한다.** "지금 상태"
섹션이 오래된 채로 방치되는 것이 이 프로젝트에서 가장 경계해야 할 실패다.

## 프로젝트가 뭔가

**제조업 등 유해위험방지계획서 제출대상 판별기**
(산업안전보건법 제42조 / 시행령 제42조 / 제조업 등 유해위험방지계획서
제출·심사·확인에 관한 고시)

사업장이 건설물·기계·기구·설비를 신설/이전/이설/증설/교체/개조할 때 "유해
위험방지계획서"를 제출해야 하는 대상인지 판별하는 도구. 핵심은 전기
계약용량/정격용량 계산이 여러 갈래로 나뉘어 있어 실무자들이 자주 헷갈리는
지점을 결정론적으로 풀어주는 것.

**PSM(공정안전보고서) 중대변경과는 다른 제도다.** PSM은 산업안전보건법
제44조/시행령 별표13(7대 업종 또는 유해위험물질 규정수량) 대상 사업장의
공정 변경 재보고 기준이고, 전기용량 개념이 아예 없다. 이 저장소는
유해위험방지계획서만 다룬다. PSM 중대변경은 완전히 별도 SSOT가 필요한
별도 프로젝트로, 이 저장소 범위에 절대 섞지 않는다 (ROADMAP.md 참조).

## 왜 만드는가 (배경)

[[safety-cert-checker]](arcsafe-safety-cert-checker, 산업안전보건법 시행령
제74·77·78조 기준 안전인증/자율안전확인/안전검사 대상 판별기)와 같은
"산업안전보건법 사전신고·확인 제도 판별기 시리즈"의 두 번째 앱. 아키텍처
패턴을 그 저장소에서 그대로 가져온다 — 검증된 패턴이니 재발명하지 말 것.

## 아키텍처 원칙 (safety-cert-checker에서 그대로 계승)

```
Input → Engine(pure/deterministic) → Snapshot(immutable) → Report → UI
```

- Engine은 순수 함수여야 한다 (같은 입력 → 항상 같은 출력, 부수효과 없음).
- UI는 판정 로직을 수행하지 않는다. UI는 입력을 모으고 Report를 그릴 뿐이다.
- Snapshot은 단일 진실 공급원이다. Report는 Snapshot에서만 파생된다.
- 법령/고시 조문은 별도 SSOT 파일(law-basis.js)에 조문 단위로 등록하고,
  Engine의 판정 결과마다 그 SSOT의 근거를 연결한다 (ruleId 참조).
- 근거 신뢰도는 3단계로 관리한다 (Plastic Pipe Advisor 패턴):
  1차(법령/고시 원문 직접 확인) / 2차(실무 대행사·컨설팅사 자료, 상호
  교차검증됨) / 미확인(단일 출처, 원문 대조 전).
- PDF 출력이 필요해지면 safety-cert-checker의 report.js
  setLastReport()/getLastReport() 패턴(Engine 재실행 없이 화면에 표시된
  값만 재사용)을 그대로 가져온다.

## 작업 절차 (STEP 게이트 — 반드시 순서대로, 건너뛰지 않는다)

```
STEP 0  Git 상태 확인 (git status, HEAD, origin과의 diff)
        ↓
STEP 1  법령 원문 조사 (law.go.kr, moel.go.kr 공식 FAQ 등 1차자료 우선)
        ↓
STEP 2  판정 항목 추출 (REGULATION-NOTES.md에 신뢰도 표시와 함께 기록)
        ↓
STEP 3  Rule Contract 작성 (RULE-CONTRACT.md — 판정 모듈·조건·근거·
        입력모델을 코드화 직전 형태로 정리)
        ↓
STEP 4  검토자가 읽을 조사보고 (채팅으로 요약 보고, 코드 없음)
        ↓
       [사용자 승인 — RULE-CONTRACT.md 상단에 "승인됨: <날짜>" 기록]
        ↓
STEP 5  Engine 설계 (승인된 RULE-CONTRACT.md만 근거로 함)
        ↓
STEP 6  구현 (law-basis.js → engine.js → ... )
```

**RULE-CONTRACT.md가 승인되기 전까지 STEP 5·6(Engine 설계/구현, 즉 어떤
코드 작성도)로 넘어가지 않는다.** 조사 중에 스스로 판단해서 코드부터
쓰고 나중에 문서를 맞추는 순서는 금지 — 이 프로젝트 세션 1에서 실제로
그 실패가 지적되어 프로세스를 다시 잡은 것이다 (DECISIONS.md 참고).

## 세션 인수인계 5개 문서

이 다섯 개만 있으면 세션이 끊겨도 이어받을 수 있어야 한다:

- `CLAUDE.md` — 이 파일. 절차·현재 상태·다음 할 일
- `REGULATION-NOTES.md` — 법령 리서치, 출처별 신뢰도(🟢🟡🔴)
- `RULE-CONTRACT.md` — 판정 로직의 코드화 직전 명세, 승인 게이트
- `DECISIONS.md` — 왜 이렇게 결정했는지 로그 (같은 논쟁 반복 방지)
- `ROADMAP.md` — Phase 구성, 후속 프로젝트 후보



## 지금 상태 (마지막 업데이트: 세션4, 2026-09-25 — RULE-CONTRACT.md 승인됨, STEP 5 착수 가능)

- [x] 저장소 생성 완료 (wn0814jo-afk/arcsafe-hazard-prevention-plan, public)
- [x] STEP 1(법령 원문 조사) 완료 — law.go.kr에서 시행령 제42조①②
      원문 직접 대조(🟢), moel.go.kr 공식 FAQ 2건으로 고시 제3조(5종
      설비, 🟢)와 PSM 고시 제2조제1항제1호(300kW, 이 저장소와 무관함을
      확정, 🟢) 대조 완료.
- [x] **Phase 0.5 원문 검증 완료(세션2·3)** — 100kW(고시 제2조제1항
      제5호 가/나목), 5종 설비 변경트리거(제2조제1항제6호 가~마목)
      조번호 전부 확정. 국가법령정보센터 신구조문대비표로 고시
      제2023-50호(2023.10.6. 개정) 반영 완료 — 가목에 "단위공장 내
      심사완료 동일 제조사·동일 모델 제외" 단서 신설, 나목·제6호는
      무변경. **미해소 법적 항목 0건.**
- [x] STEP 2(판정 항목 추출) 완료 — REGULATION-NOTES.md
- [x] STEP 3(Rule Contract 작성) 완료 — RULE-CONTRACT.md
- [x] **STEP 4(검토자 재감사) 완료 — RULE-CONTRACT.md 승인됨:
      2026-09-25**. 세션4에서 4차에 걸친 재감사를 거침:
      1차(모듈독립성/3상태/조건부STEP/판정경로 UX 명시),
      2차(TARGET+INCOMPLETE 표현을 위한 finalStatus+
      determinationCompleteness 이원 구조 도입),
      3차(모듈3(이설)에 누락됐던 "모듈1 조건 충족 사업장" 전제조건 발견·
      수정 — 🔴급, 신구조문대비표 재정독으로 발견),
      4차(STEP2·3 노출 근거를 "작업형태 무관 항상 노출"에서 "적용되는
      모듈의 선행조건 확인 목적"으로 표현 정밀화). 4개 시나리오
      데스크체크(신설+대상/증설+대상/이설+대상/업종미충족+설비대상)
      전부 통과. 최종 🔴 0 / 🟡 0.
- [x] 개념도(CONCEPT.md) — "300kW 계산기" 프레이밍을 버리고 6항목 입력
      모델 + 4개 독립 판정 모듈 + 장기 "산업안전 대상판별기" 구조로 재작성
- [x] 의사결정 로그(DECISIONS.md) 작성 — 제품 구조, 이름/프레이밍,
      승인 게이트, 100kW/300kW 근본원인, 건설공사 규모기준 발견/제외
      확정, 위저드 UX, Regulatory Map, 2023-50호 확정, 모듈3 전제조건
      발견까지 전부 기록
- [x] 로드맵(ROADMAP.md) 작성 — Phase 5(건설공사 대상판별)로 분리
- [ ] **다음이 바로 STEP 5(Engine 설계) 착수** — RULE-CONTRACT.md는
      승인됐으므로 코드 작성 시작 가능. 다만 STEP 5 설계 시 RULE-
      CONTRACT.md에 명시된 대로 `status`(TARGET/NOT_TARGET/UNKNOWN) +
      `applicability`(APPLICABLE/NOT_APPLICABLE_TO_WORK_TYPE) 이원
      필드를 Engine 데이터 모델에 반드시 반영할 것
- [ ] law-basis.js/engine.js/data.js/state.js/report.js/ui.js — 전부
      아직 없음. 이제는 작성 가능하나, **아직 작성 시작 안 함**
      (검토자가 "코드 작성으로 넘어가라"고 명시적으로 지시하기 전까지는
      계속 대기)
- [ ] 테스트 없음, 배포 설정 없음

## 다음 세션에서 할 일 (우선순위 순)

1. RULE-CONTRACT.md는 **승인됨(2026-09-25)**. 이 대화(또는 사용자
   메시지)에서 STEP 5(Engine 설계) 착수 지시가 있었는지 먼저 확인 —
   명시적 지시 없이 스스로 판단해서 코드부터 쓰지 말 것(세션1의 실패를
   반복하지 않는다).
2. STEP 5 설계 시 필수 반영 사항 (RULE-CONTRACT.md 참고):
   - law-basis.js: 모듈 1~4의 조문 원문을 그대로 옮김(요약·재구성 금지).
     모듈2는 "동일 제조사·동일 모델 제외" 예외 로직 포함 필수. 모듈3에는
     모듈1과 같은 업종+계약용량 전제조건이 있음(세션4 3차 재감사로
     추가됨 — 놓치기 쉬우니 주의).
   - engine.js: 4개 모듈을 각각 pure function으로, 항상 4개 다 평가
     (short-circuit 금지). 각 모듈 결과는 `status`(TARGET/NOT_TARGET/
     UNKNOWN) + `applicability`(APPLICABLE/NOT_APPLICABLE_TO_WORK_TYPE)
     이원 필드. `finalStatus`/`determinationCompleteness` 집계 로직도
     RULE-CONTRACT.md의 규칙 그대로. self-test 포함.
   - UI/Regulatory Map: Snapshot을 그대로 시각화만 하고 자체 판정
     로직을 갖지 않음(Input→Engine→Snapshot→Map→Report 순서 고정).
3. 그 다음부터는 safety-cert-checker 순서(Engine self-test → Snapshot →
   Report → UI → QA)를 그대로 따라간다

## 절대 하지 말 것

- **RULE-CONTRACT.md 승인 없이 law-basis.js/engine.js 등 어떤 코드도
  작성하지 말 것** (위 STEP 게이트 참조 — 세션 1에서 이 규칙이 없어서
  사용자가 직접 프로세스를 다시 잡았다)
- 원문 대조 전 규정을 law-basis.js에 SSOT로 확정 등록하지 말 것 (2차 자료
  단계에서는 REGULATION-NOTES.md에만 적어둔다)
- PSM(공정안전보고서) 중대변경 판정을 이 저장소에 섞지 말 것 — 완전히 다른
  법조문·고시이며, 섞으면 SSOT가 오염된다. (실제로 100kW/300kW를 섞은
  실무자료가 존재함을 확인함 — DECISIONS.md 참고. 이 프로젝트가 바로 그
  실수를 하지 않도록 하는 게 존재 이유 중 하나다)
- 제품 이름/UI 문구에 "300kW 계산기"처럼 특정 숫자를 못박지 말 것 —
  계약용량/정격용량을 혼동하게 만든다 (DECISIONS.md 참고)
- 세션을 마치기 전에 이 파일의 "지금 상태" 갱신 없이 끝내지 말 것
