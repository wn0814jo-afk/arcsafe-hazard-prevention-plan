/**
 * law-basis.js
 *
 * 이 파일은 RULE-CONTRACT.md(승인됨: 2026-09-25, commit 3b49e91)에
 * 적힌 조문을 그대로 옮긴 것이다. 요약하거나 재구성하지 않는다.
 *
 * 이 파일을 고치는 것은 "코드 버그 수정"이 아니라 "법적 판정 계약
 * 변경"이다. 이 파일의 내용을 바꾸려면 먼저 RULE-CONTRACT.md를
 * 다시 검토·승인받아야 한다 — engine.js에서 이 파일의 값을 편의상
 * 바꾸지 않는다.
 *
 * 각 항목은 Object.freeze로 잠가 런타임 변조를 막는다
 * (safety-cert-checker의 reg() 패턴과 동일 — 그 프로젝트에서
 * basis 레지스트리가 freeze 안 돼 변조 가능했던 버그가 실제로
 * 있었음, 재발 방지).
 */
'use strict';

function basis(entry) {
  return Object.freeze({ ...entry });
}

const RULE_VERSION = 'RULE-CONTRACT@approved-2026-09-25(commit-3b49e91)';

const LAW_BASIS = Object.freeze({
  // 모듈 1의 근거이자, 모듈 2·3의 공통 전제조건("영 제42조제1항에
  // 해당하는 업종의 사업장")의 근거이기도 하다.
  DECREE_42_1: basis({
    ruleId: 'DECREE_42_1',
    statute: '산업안전보건법 시행령 제42조제1항',
    effectiveDate: '2026-08-01',
    text:
      '대통령령으로 정하는 사업의 종류 및 규모에 해당하는 사업장의 사업주는 ' +
      '유해위험방지계획서를 제출하여야 한다 — 13개 대상 업종 + 전기 계약용량 300kW 이상',
    reliability: 'PRIMARY', // 🟢 law.go.kr 원문 확인
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 1',
  }),

  DECREE_42_2: basis({
    ruleId: 'DECREE_42_2',
    statute: '산업안전보건법 시행령 제42조제2항',
    effectiveDate: '2026-08-01',
    text: '유해하거나 위험한 작업 및 장소에서 사용하는 기계·기구 및 설비 — 5종 대상설비',
    reliability: 'PRIMARY', // 🟢 law.go.kr 원문 확인
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 4',
  }),

  NOTICE_2_1_5_GA: basis({
    ruleId: 'NOTICE_2_1_5_GA',
    statute:
      '제조업 등 유해·위험방지계획서 제출·심사·확인에 관한 고시 제2조제1항제5호 가목',
    noticeNo: '고용노동부고시 제2023-50호',
    effectiveDate: '2023-10-12',
    text:
      '"제품생산 공정과 관련되는 건설물·기계·기구 및 설비 등"의 증설, 교체 또는 개조 등에 ' +
      '의해 전기정격용량의 합이 100킬로와트 이상 증가되는 경우. 다만, 전기정격용량의 합을 ' +
      '산정할 때, 단위공장 내 심사 완료된 설비와 같은 제조사의 같은 모델은 제외한다.',
    reliability: 'PRIMARY', // 🟢 국가법령정보센터 신구조문대비표로 확정 대조
    note: '단서("다만...")는 고시 제2023-50호(2023.10.6 개정)로 신설됨 — 2022-13호까지는 없었음',
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 2',
  }),

  NOTICE_2_1_5_NA: basis({
    ruleId: 'NOTICE_2_1_5_NA',
    statute:
      '제조업 등 유해·위험방지계획서 제출·심사·확인에 관한 고시 제2조제1항제5호 나목',
    noticeNo: '고용노동부고시 제2023-50호',
    effectiveDate: '2023-10-12',
    text:
      '전기정격용량의 합이 100킬로와트 이상되는 규모의 "제품생산 공정과 관련되는 ' +
      '건설물·기계·기구 및 설비 등"의 일부를 옮겨서 설치하는 경우.',
    reliability: 'PRIMARY', // 🟢 신구조문대비표: "나. (현행과 같음)"
    note:
      '가목의 "동일 제조사·동일 모델 제외" 계산방법 예외는 나목에는 적용되지 않는다 ' +
      '(신구조문대비표에서 확정). 가목·나목 공통으로 "영 제42조제1항에 해당하는 업종의 ' +
      '사업장"이라는 전제조건이 걸린다(신구조문대비표 "5." 항목 도입부) — 이 전제조건은 ' +
      'DECREE_42_1과 동일한 사업장 정의다.',
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 3',
  }),

  NOTICE_3: basis({
    ruleId: 'NOTICE_3',
    statute: '제조업 등 유해·위험방지계획서 제출·심사·확인에 관한 고시 제3조',
    effectiveDate: '2023-10-12',
    text:
      '5종 대상설비의 판정 기준 — ' +
      '1) 용해로: 금속/비금속광물을 녹는점 이상으로 가열 용해, 용량 3톤 이상. ' +
      '2) 화학설비: 안전보건규칙 제273조 "특수화학설비", 하루 제조/취급량(단위공정 저장량 ' +
      '포함)이 안전보건규칙 별표9 위험물질 기준량 이상(단, 시행령 제43조제2항이 정한 설비는 ' +
      '제외). ' +
      '3) 건조설비: 건조기본체+가열장치+환기장치, (연료 최대소비량 시간당 50kg 이상 또는 ' +
      '정격소비전력 50kW 이상) 그리고 (유기화합물 건조 또는 도료·피막제 도포코팅 표면건조로 ' +
      '인화성증기 발생 또는 건조로 가연성분말 분진 발생) 중 하나. ' +
      '4) 가스집합 용접장치: 용접·용단용 인화성가스 집합량 1,000kg 이상, 저장용기/탱크를 ' +
      '도관으로 연결한 고정식. ' +
      '5) 유해물질 밀폐·환기·배기설비: 안전보건규칙 제422~608조 관련 국소배기장치(이동식 ' +
      '제외)/밀폐설비/전체환기설비 — 안전검사절차고시 별표1 제7호 유해물질은 배풍량 ' +
      '60㎥/분 이상, 그 외 허가/관리대상물질 또는 별표16 분진작업은 배풍량 150㎥/분 이상.',
    reliability: 'PRIMARY', // 🟢 moel.go.kr 공식 FAQ 원문 확인
    openItems: [
      // RULE-CONTRACT.md는 이 두 항목의 구체적 수치표를 인용하지 않았다.
      // 별표9/시행령 제43조제2항의 실제 물질별 기준량·제외설비 목록을
      // engine.js가 스스로 계산하지 않는다 — 호출자가 별도로 판정해
      // boolean으로 넘겨야 한다(law-basis.js/engine.js가 임의로 수치를
      // 추가하지 않는다는 원칙, STEP 5 지시 2번 참고).
      'EQUIPMENT_CHEMICAL_HAZARDOUS_SUBSTANCE_THRESHOLD_TABLE(안전보건규칙 별표9)의 ' +
        '물질별 기준량 수치는 RULE-CONTRACT.md에 인용되지 않았다 — LEGAL SOURCE BLOCKED, ' +
        'engine은 meetsHazardousSubstanceThreshold(boolean)를 입력으로 받는다.',
      'EQUIPMENT_CHEMICAL_DECREE_43_2_EXCLUSION(시행령 제43조제2항 제외설비 목록)도 ' +
        '동일하게 RULE-CONTRACT.md에 목록이 없다 — engine은 excludedByDecree43_2(boolean)를 ' +
        '입력으로 받는다.',
    ],
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 4',
  }),

  // 고시 제2조제1항제6호 가~마목 — "주요구조부분 변경" 트리거.
  // RULE-CONTRACT.md에 조문 원문은 확정돼 있으나, 이 트리거가
  // 모듈4의 TARGET 판정에 "기본 기준표(NOTICE_3)와 별도로 어떻게
  // 결합되는지"는 RULE-CONTRACT.md가 명시하지 않았다. 아래 engine.js
  // 주석 OPEN-ISSUE-M4-1 참고 — 이 항목은 현재 engine.js가 사용하지
  // 않는다(추측으로 결합 로직을 만들지 않기 위함).
  NOTICE_2_1_6: basis({
    ruleId: 'NOTICE_2_1_6',
    statute:
      '제조업 등 유해·위험방지계획서 제출·심사·확인에 관한 고시 제2조제1항제6호 가~마목',
    noticeNo: '고용노동부고시 제2023-50호(가~마 조문 자체는 개정 없음)',
    effectiveDate: '2023-10-12',
    text:
      '가) 용해로: 열원의 종류를 변경하는 경우. ' +
      '나) 화학설비: 생산량 증가·원료 또는 제품 변경을 위한 대상 화학설비의 교체·변경·추가, ' +
      '또는 관리대상 유해물질 관련 설비의 추가·변경으로 후드 제어풍속 감소 또는 배풍기 ' +
      '배풍량 증가. ' +
      '다) 건조설비: 열원의 종류 변경, 또는 건조대상물 변경으로 제3조제3호 각목 중 하나에 ' +
      '재해당. ' +
      '라) 가스집합용접장치: 주관의 구조를 변경하는 경우. ' +
      '마) 허가대상 유해물질 및 분진작업 관련설비: 추가/변경으로 후드제어풍속 감소 또는 ' +
      '배풍기 배풍량 증가.',
    reliability: 'PRIMARY', // 🟢 신구조문대비표: 전부 "현행과 같음"
    note:
      'engine.js는 현재 이 조문을 사용하지 않는다 — RULE-CONTRACT.md가 이 트리거와 ' +
      'NOTICE_3 기준표의 결합 방식(작업형태별로 어느 쪽을 적용하는지)을 명시하지 않았기 ' +
      '때문에 임의로 결합 로직을 만들지 않고 OPEN-ISSUE-M4-1로 기록만 한다.',
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 4',
  }),

  PSM_2_1_1_NOT_APPLICABLE: basis({
    ruleId: 'PSM_2_1_1_NOT_APPLICABLE',
    statute: '공정안전보고서의 제출·심사·확인 및 이행상태평가 등에 관한 규정 제2조제1항제1호',
    text:
      '"생산설비 및 부대설비의 전기정격용량 총합이 300kW 이상" — PSM(공정안전보고서) ' +
      '재제출 기준이며, 이 프로젝트(유해위험방지계획서)와는 완전히 별도 SSOT다. ' +
      '이 저장소의 어떤 모듈 판정에도 이 조문의 300kW 수치를 사용하지 않는다.',
    reliability: 'PRIMARY', // 🟢 moel.go.kr 공식 FAQ 원문 확인
    ruleContractRef: 'RULE-CONTRACT.md ## 판정 모듈 2 "혼동 방지"',
  }),
});

const INDUSTRY_LIST = Object.freeze([
  '금속가공제품 제조업(기계 및 가구 제외)',
  '비금속 광물제품 제조업',
  '기타 기계 및 장비 제조업',
  '자동차 및 트레일러 제조업',
  '식료품 제조업',
  '고무제품 및 플라스틱제품 제조업',
  '목재 및 나무제품 제조업',
  '기타 제품 제조업',
  '1차 금속 제조업',
  '가구 제조업',
  '화학물질 및 화학제품 제조업',
  '반도체 제조업',
  '전자부품 제조업',
]);

module.exports = { LAW_BASIS, INDUSTRY_LIST, RULE_VERSION };
