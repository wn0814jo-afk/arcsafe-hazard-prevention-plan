/**
 * data.js
 *
 * law-basis.js의 조문 원문에 이미 적힌 숫자만 상수로 뽑아둔 것.
 * 여기 숫자를 바꾸는 것도 law-basis.js와 마찬가지로 법적 판정
 * 계약 변경이다 — RULE-CONTRACT.md 재검토 없이 바꾸지 않는다.
 */
'use strict';

const THRESHOLDS = Object.freeze({
  // 모듈 1·2·3 공통 전제조건(DECREE_42_1)
  CONTRACT_CAPACITY_KW: 300,

  // 모듈 2 (NOTICE_2_1_5_GA)
  MODULE2_RATED_CAPACITY_INCREASE_KW: 100,

  // 모듈 3 (NOTICE_2_1_5_NA)
  MODULE3_RELOCATED_RATED_CAPACITY_KW: 100,

  // 모듈 4 - 1. 용해로 (NOTICE_3)
  EQUIPMENT_MELTING_FURNACE_TON: 3,

  // 모듈 4 - 3. 건조설비 (NOTICE_3)
  EQUIPMENT_DRYING_FUEL_KG_PER_HOUR: 50,
  EQUIPMENT_DRYING_RATED_POWER_KW: 50,

  // 모듈 4 - 4. 가스집합 용접장치 (NOTICE_3)
  EQUIPMENT_GAS_WELDING_ASSEMBLY_KG: 1000,

  // 모듈 4 - 5. 유해물질 밀폐·환기·배기설비 (NOTICE_3)
  EQUIPMENT_VENTILATION_NOTICE_TABLE1_ITEM7_M3_PER_MIN: 60,
  EQUIPMENT_VENTILATION_PERMIT_OR_MANAGED_OR_DUST_M3_PER_MIN: 150,
});

// 모듈 4 - 3. 건조설비의 "다음 중 하나" 목적 분류
// (RULE-CONTRACT.md ## 판정 모듈 4 표 3행)
const DRYING_PURPOSE = Object.freeze({
  ORGANIC_COMPOUND: 'ORGANIC_COMPOUND', // 가) 유기화합물 건조
  COATING_FLAMMABLE_VAPOR: 'COATING_FLAMMABLE_VAPOR', // 나) 도료·피막제 도포코팅 표면건조로 인화성증기 발생
  COMBUSTIBLE_DUST: 'COMBUSTIBLE_DUST', // 다) 가연성분말 분진 발생
});

// 모듈 4 - 5. 유해물질 밀폐·환기·배기설비의 물질 구분
// (배풍량 기준이 물질 구분에 따라 60 또는 150으로 갈림)
const VENTILATION_SUBSTANCE_CATEGORY = Object.freeze({
  NOTICE_TABLE1_ITEM7: 'NOTICE_TABLE1_ITEM7', // 안전검사절차고시 별표1 제7호 유해물질 → 60㎥/분
  PERMIT_OR_MANAGED_OR_DUST_TABLE16: 'PERMIT_OR_MANAGED_OR_DUST_TABLE16', // 허가/관리대상물질 또는 별표16 분진작업 → 150㎥/분
});

const WORK_TYPE = Object.freeze({
  NEW: 'NEW', // 신설
  FULL_RELOCATION: 'FULL_RELOCATION', // 전체이전
  MODIFICATION: 'MODIFICATION', // 증설·교체·개조
  PARTIAL_RELOCATION: 'PARTIAL_RELOCATION', // 일부 설비 이전(이설)
});

module.exports = { THRESHOLDS, DRYING_PURPOSE, VENTILATION_SUBSTANCE_CATEGORY, WORK_TYPE };
