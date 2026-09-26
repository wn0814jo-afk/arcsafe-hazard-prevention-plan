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



## 지금 상태 (마지막 업데이트: 세션5, 2026-09-26 — STEP 5 Engine 설계·구현 완료)

- [x] 저장소 생성 완료 (wn0814jo-afk/arcsafe-hazard-prevention-plan, public)
- [x] STEP 1~4, RULE-CONTRACT.md 승인(2026-09-25, commit 3b49e91) — 위
      이력은 그대로 유지(세션2~4 내용 아래 참고)
- [x] **STEP 5(Engine 설계·구현) 완료(세션5, 2026-09-26)** — 검토자의
      명시적 지시("STEP 5 — Engine 설계 착수")를 받고 진행:
      - `law-basis.js`: RULE-CONTRACT.md 조문 원문을 그대로 옮긴 근거
        레지스트리, 전부 `Object.freeze`. 13개 업종 목록 포함.
      - `data.js`: THRESHOLDS(300/100/100/3톤/50kg·50kW/1000kg/60·150㎥분)
        등 수치 상수만 분리.
      - `engine.js`: 4개 모듈 pure function, 3치 논리(and3/or3)로
        UNKNOWN을 1급 상태로 취급, `status`+`applicability` 이원 필드,
        `finalStatus`/`determinationCompleteness` 독립 집계(APPLICABLE
        모듈만 대상), Snapshot 반환은 깊은 `Object.freeze`.
      - `tests.js`: 51개 테스트 전체 통과(모듈별 경계값 A~D, 종합 시나리오
        E1~E4 회귀고정, Invariant 1~9 전부 자동검증). `npm test`로 실행.
      - `ENGINE-DESIGN.md`: 설계 전체 기록 + **미해결 쟁점 2건**(임의로
        해결 안 하고 기록만 함): OPEN-ISSUE-M4-1(모듈4 기본기준표 vs
        고시 제2조제1항제6호 변경트리거의 결합 방식이 RULE-CONTRACT.md에
        명시 안 됨 — 지금은 기본기준표만 구현), OPEN-ISSUE-M4-2(화학설비
        안전보건규칙 별표9 수치표·시행령 제43조제2항 제외설비 목록이
        RULE-CONTRACT.md에 없어 boolean 입력으로 대체, 미입력시 UNKNOWN).
      - **UI/Regulatory Map/Report는 아직 구현 안 함**(이번 단계 범위
        밖 — 검토자 지시 2번). RULE-CONTRACT.md는 이번 세션에서 수정
        안 함(코드만 작성, 법적 조건 재해석 없음).
- [ ] 다음: STEP 6 이후(Report/UI/Regulatory Map) — 검토자의 명시적
      지시 대기. 착수 전 OPEN-ISSUE-M4-1(모듈4 증설 시 판정방식)은
      RULE-CONTRACT.md 재검토가 먼저 필요할 수 있음(코드로 추측 금지).
- [ ] 배포 설정 없음, git push 아직 안 함(로컬 커밋만) — 이 세션에서
      마지막으로 확인할 것

## 세션2~4 이력 (STEP 1~4, 참고용 — 위 STEP5 완료로 대체되지 않음)

- Phase 0.5 원문 검증(세션2·3): 100kW(고시 제2조제1항제5호 가/나목),
  5종 설비 변경트리거(제6호 가~마목) 조번호 확정. 신구조문대비표로
  고시 제2023-50호 반영(가목 "동일 제조사·동일 모델 제외" 단서 신설
  확정). 미해소 법적 항목 0건.
- 제품 관점 재감사(세션4, 4차): 모듈독립성/3상태(TARGET·NOT_TARGET·
  UNKNOWN)/조건부STEP/판정경로 UX → finalStatus+determinationCompleteness
  이원 구조 → 모듈3(이설) 누락 전제조건 발견·수정(🔴급) → STEP2·3 노출
  근거 표현 정밀화. 4개 시나리오 데스크체크 통과, 최종 🔴 0/🟡 0으로
  **RULE-CONTRACT.md 승인됨: 2026-09-25**.

## 다음 세션에서 할 일 (우선순위 순)

1. STEP 5(Engine 설계·구현)는 **완료**됐다(세션5, 2026-09-26, 로컬
   커밋 — 커밋 해시는 아래 Git 절 확인). ENGINE-DESIGN.md부터 읽고
   시작할 것 — 특히 "10. 미해결 쟁점"(OPEN-ISSUE-M4-1, M4-2)을 먼저
   확인.
2. 이 대화(또는 사용자 메시지)에서 STEP 6(Report/UI/Regulatory Map)
   착수 지시가 있었는지 먼저 확인 — 명시적 지시 없이 스스로 판단해서
   코드부터 쓰지 말 것.
3. STEP 6 착수 시 필수 원칙(ENGINE-DESIGN.md 그대로): Report/UI는
   `evaluate()`가 반환한 Snapshot을 그대로 시각화만 하고, 자체 판정
   로직(예: `if (kw >= 100)`)을 절대 갖지 않는다. law-basis.js/data.js/
   engine.js/tests.js는 원칙적으로 무변경 — 정말 필요하면 먼저 중단하고
   보고(safety-cert-checker와 동일 원칙).
4. OPEN-ISSUE-M4-1(모듈4 증설 시 판정방식)은 UI를 만들면서 임의로
   해결하지 말 것 — RULE-CONTRACT.md 재검토·재승인이 먼저 필요할 수
   있음. UI에서는 일단 "기본기준표만 반영, 변경트리거는 별도 확인
   필요"로 두거나, 사용자에게 이 쟁점부터 질의할 것.

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
