/**
 * engine.js
 *
 * RULE-CONTRACT.md(승인됨: 2026-09-25)를 코드로 옮긴 Pure Engine.
 *
 * 반드시 지키는 것 (RULE-CONTRACT.md / STEP 5 지시 그대로):
 *  - DOM을 읽거나 쓰지 않는다.
 *  - localStorage/네트워크를 쓰지 않는다.
 *  - 현재 시간에 의존하지 않는다 — evaluate()가 만드는 snapshot에
 *    시각 정보가 필요하면 호출자가 meta.now로 명시적으로 넘긴다.
 *  - 전역 mutable state가 없다. 이전 실행 결과를 내부에 저장하지 않는다.
 *  - 동일 input이면 항상 동일 snapshot (determinism).
 *
 * 상태 3분류 (RULE-CONTRACT.md "결과 상태" 절):
 *   TARGET / NOT_TARGET / UNKNOWN
 * 적용범위 2분류 (같은 절 + "N/A vs NOT_TARGET" 절):
 *   APPLICABLE / NOT_APPLICABLE_TO_WORK_TYPE
 * 이 둘은 절대 하나의 boolean으로 축약하지 않는다 (Invariant 3, 6).
 */
'use strict';

const { LAW_BASIS, INDUSTRY_LIST, RULE_VERSION } = require('./law-basis.js');
const { THRESHOLDS, WORK_TYPE } = require('./data.js');

const ENGINE_VERSION = '0.1.0';

const STATUS = Object.freeze({
  TARGET: 'TARGET',
  NOT_TARGET: 'NOT_TARGET',
  UNKNOWN: 'UNKNOWN',
});

const APPLICABILITY = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  NOT_APPLICABLE_TO_WORK_TYPE: 'NOT_APPLICABLE_TO_WORK_TYPE',
});

// ---------------------------------------------------------------------------
// 3치 논리 (three-valued logic) 헬퍼
//
// 조건 하나하나는 true(충족) | false(불충족) | undefined(모름)로 표현한다.
// AND: 하나라도 false면 전체 false(다른 조건이 unknown이어도 확정 가능).
//      전부 true면 true. 그 외(false는 없고 unknown이 하나라도 있음)는 unknown.
// OR:  하나라도 true면 전체 true. 전부 false면 false. 그 외는 unknown.
// 이 논리가 UNKNOWN이 NOT_TARGET으로 조기 확정되지 않게 하는 핵심 장치다
// (RULE-CONTRACT.md "절대 규칙(fail-closed)").
// ---------------------------------------------------------------------------

function and3(...conditions) {
  if (conditions.some((c) => c === false)) return false;
  if (conditions.every((c) => c === true)) return true;
  return undefined;
}

function or3(...conditions) {
  if (conditions.some((c) => c === true)) return true;
  if (conditions.every((c) => c === false)) return false;
  return undefined;
}

function toStatus(threeValued) {
  if (threeValued === true) return STATUS.TARGET;
  if (threeValued === false) return STATUS.NOT_TARGET;
  return STATUS.UNKNOWN;
}

// 숫자 비교를 3치 논리로: 값이 없으면 unknown, 있으면 실제 비교.
function gte(value, threshold) {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  return value >= threshold;
}

// ---------------------------------------------------------------------------
// 모듈 1 — 사업장 기준 (RULE-CONTRACT.md ## 판정 모듈 1)
// ---------------------------------------------------------------------------

function evaluateModule1(input) {
  const industryMatch = input.businessType && input.businessType.withinListedIndustries;
  const capacityMet = gte(input.contractCapacityKw, THRESHOLDS.CONTRACT_CAPACITY_KW);

  const conditionIndustry = industryMatch === undefined ? undefined : Boolean(industryMatch);
  const three = and3(conditionIndustry, capacityMet);
  const status = toStatus(three);

  // applicability: 신설/전체이전일 때만 "이 모듈 자체의 filing 사유"가 성립한다.
  // 증설·이설이어도 status 자체는 그대로 계산해서 모듈2·3의 선행조건으로
  // 재사용한다 (RULE-CONTRACT.md "applicability(작업형태 범위) 명시" 절).
  const applicability =
    input.workType === WORK_TYPE.NEW || input.workType === WORK_TYPE.FULL_RELOCATION
      ? APPLICABILITY.APPLICABLE
      : APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE;

  return {
    ruleId: 'M1',
    status,
    applicability,
    legalBasis: [LAW_BASIS.DECREE_42_1.ruleId],
    reason: describeModule1(conditionIndustry, input.contractCapacityKw),
    inputsUsed: {
      withinListedIndustries: conditionIndustry,
      contractCapacityKw: input.contractCapacityKw,
    },
  };
}

function describeModule1(conditionIndustry, capacityKw) {
  if (conditionIndustry === undefined || capacityKw === undefined) {
    return '업종 또는 계약용량 정보가 없어 판단할 수 없음';
  }
  return conditionIndustry && capacityKw >= THRESHOLDS.CONTRACT_CAPACITY_KW
    ? `13개 대상 업종 해당 + 계약용량 ${capacityKw}kW (>= ${THRESHOLDS.CONTRACT_CAPACITY_KW}kW)`
    : `13개 대상 업종 ${conditionIndustry ? '해당' : '비해당'} + 계약용량 ${capacityKw}kW`;
}

// ---------------------------------------------------------------------------
// 모듈 2 — 증설·교체·개조 (RULE-CONTRACT.md ## 판정 모듈 2)
// ---------------------------------------------------------------------------

function evaluateModule2(input, module1Result) {
  const applicability =
    input.workType === WORK_TYPE.MODIFICATION
      ? APPLICABILITY.APPLICABLE
      : APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE;

  // 선행조건: 모듈1의 status를 그대로 재사용한다(모듈1의 applicability와는
  // 무관 — 증설 작업에서 모듈1은 NOT_APPLICABLE_TO_WORK_TYPE이어도 그
  // status(TARGET/NOT_TARGET/UNKNOWN)는 여기서 그대로 쓴다).
  const precondition = statusToThreeValued(module1Result.status);

  const netIncreaseKw = computeModule2NetIncrease(input.module2);
  const capacityMet = gte(netIncreaseKw, THRESHOLDS.MODULE2_RATED_CAPACITY_INCREASE_KW);

  // 조건2("생산량 증가 또는 제품 변경 목적의 증설/교체/개조")는 작업형태를
  // [증설·교체·개조]로 선택한 것 자체가 그 사실을 구성한다고 본다 —
  // RULE-CONTRACT.md는 이를 별도 입력 항목으로 두지 않았다.
  const three = and3(precondition, capacityMet);
  const status = toStatus(three);

  return {
    ruleId: 'M2',
    status,
    applicability,
    legalBasis: [LAW_BASIS.NOTICE_2_1_5_GA.ruleId],
    reason: describeModule2(precondition, netIncreaseKw),
    inputsUsed: {
      module1Precondition: module1Result.status,
      grossRatedCapacityIncreaseKw: input.module2 && input.module2.grossRatedCapacityIncreaseKw,
      sameManufacturerSameModelExcludedKw:
        input.module2 && input.module2.sameManufacturerSameModelExcludedKw,
      netRatedCapacityIncreaseKw: netIncreaseKw,
    },
  };
}

// "동일 제조사·동일 모델 제외" 예외(NOTICE_2_1_5_GA)를 반영해 순증가분을 계산.
// 이 계산은 반드시 여기서만 일어난다 — UI가 이 뺄셈을 대신 하지 않는다.
function computeModule2NetIncrease(m2) {
  if (!m2 || m2.grossRatedCapacityIncreaseKw === undefined) return undefined;
  const excluded = m2.sameManufacturerSameModelExcludedKw || 0;
  return m2.grossRatedCapacityIncreaseKw - excluded;
}

function describeModule2(precondition, netIncreaseKw) {
  if (precondition === undefined) return '모듈1(사업장 기준) 확정 전이라 판단 불가';
  if (precondition === false) return '모듈1(사업장 기준) 조건 불충족 사업장';
  if (netIncreaseKw === undefined) return '정격용량 증가분 정보가 없어 판단할 수 없음';
  return `정격용량 순증가분 ${netIncreaseKw}kW (동일 제조사·동일 모델 제외 반영, 기준 ${THRESHOLDS.MODULE2_RATED_CAPACITY_INCREASE_KW}kW)`;
}

// ---------------------------------------------------------------------------
// 모듈 3 — 이설 (RULE-CONTRACT.md ## 판정 모듈 3, 세션4 3차 재감사로 전제조건 추가)
// ---------------------------------------------------------------------------

function evaluateModule3(input, module1Result) {
  const applicability =
    input.workType === WORK_TYPE.PARTIAL_RELOCATION
      ? APPLICABILITY.APPLICABLE
      : APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE;

  const precondition = statusToThreeValued(module1Result.status);
  const relocatedCapacityMet = gte(
    input.module3 && input.module3.relocatedRatedCapacityKw,
    THRESHOLDS.MODULE3_RELOCATED_RATED_CAPACITY_KW
  );

  // 모듈2의 "동일 제조사·동일 모델 제외" 예외는 여기 적용하지 않는다
  // (NOTICE_2_1_5_NA에서 확정 — 가목 전용 예외).
  const three = and3(precondition, relocatedCapacityMet);
  const status = toStatus(three);

  return {
    ruleId: 'M3',
    status,
    applicability,
    legalBasis: [LAW_BASIS.NOTICE_2_1_5_NA.ruleId],
    reason: describeModule3(precondition, input.module3 && input.module3.relocatedRatedCapacityKw),
    inputsUsed: {
      module1Precondition: module1Result.status,
      relocatedRatedCapacityKw: input.module3 && input.module3.relocatedRatedCapacityKw,
    },
  };
}

function describeModule3(precondition, capacityKw) {
  if (precondition === undefined) return '모듈1(사업장 기준) 확정 전이라 판단 불가';
  if (precondition === false) return '모듈1(사업장 기준) 조건 불충족 사업장';
  if (capacityKw === undefined) return '이설 설비 정격용량 정보가 없어 판단할 수 없음';
  return `이설 설비 정격용량 합 ${capacityKw}kW (기준 ${THRESHOLDS.MODULE3_RELOCATED_RATED_CAPACITY_KW}kW)`;
}

function statusToThreeValued(status) {
  if (status === STATUS.TARGET) return true;
  if (status === STATUS.NOT_TARGET) return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// 모듈 4 — 대상설비 5종 (RULE-CONTRACT.md ## 판정 모듈 4)
//
// OPEN-ISSUE-M4-1 (임의로 해결하지 않고 기록만 함):
// RULE-CONTRACT.md는 (a) 5종 설비의 기본 판정기준표(NOTICE_3)와
// (b) "주요구조부분 변경" 트리거 목록(NOTICE_2_1_6, 고시 제2조제1항제6호
// 가~마목)을 둘 다 문서화했지만, 이 둘이 작업형태별로 어떻게 결합되는지
// (예: 증설·교체·개조일 때 (b)만 보는지, (a)와 (b)를 OR로 합치는지)를
// 명시하지 않았다. 아래 구현은 (a) 기본 판정기준표만 사용하고, 이는
// RULE-CONTRACT.md의 모듈4 "결과" 문장("업종·전기용량 요건 불필요, 설비
// 요건만으로 확정")이 명시적으로 정의한 부분이다. (b)는 아직 구현하지
// 않았다 — 추측으로 결합 로직을 만들지 않는다(STEP 5 지시 1번).
// ---------------------------------------------------------------------------

function evaluateModule4(input) {
  const eq = input.equipment;

  // STEP4 자체를 아직 안 받은 경우(화면에 도달 안 함) 전체가 UNKNOWN.
  if (eq === undefined) {
    return buildModule4Result(STATUS.UNKNOWN, {}, '대상설비 해당 여부 정보가 없어 판단할 수 없음');
  }
  // 사용자가 "없음"을 명시적으로 답한 경우 — 확정된 정보이므로 NOT_TARGET.
  if (eq.none === true) {
    return buildModule4Result(STATUS.NOT_TARGET, {}, '대상설비 없음으로 확인됨');
  }

  const meltingFurnace = evaluateMeltingFurnace(eq.meltingFurnace);
  const chemicalEquipment = evaluateChemicalEquipment(eq.chemicalEquipment);
  const dryingEquipment = evaluateDryingEquipment(eq.dryingEquipment);
  const gasWeldingAssembly = evaluateGasWeldingAssembly(eq.gasWeldingAssembly);
  const ventilation = evaluateVentilation(eq.ventilation);

  const equipmentResults = {
    meltingFurnace,
    chemicalEquipment,
    dryingEquipment,
    gasWeldingAssembly,
    ventilation,
  };

  const three = or3(
    meltingFurnace.three,
    chemicalEquipment.three,
    dryingEquipment.three,
    gasWeldingAssembly.three,
    ventilation.three
  );
  const status = toStatus(three);
  const reason = describeModule4(status, equipmentResults);

  return buildModule4Result(status, equipmentResults, reason);
}

function buildModule4Result(status, equipmentResults, reason) {
  return {
    ruleId: 'M4',
    status,
    applicability: APPLICABILITY.APPLICABLE, // 모듈4는 항상 독립 평가 — applicability 분기 없음
    legalBasis: [LAW_BASIS.DECREE_42_2.ruleId, LAW_BASIS.NOTICE_3.ruleId],
    reason,
    equipmentResults,
  };
}

function describeModule4(status, results) {
  if (status === STATUS.TARGET) {
    const hit = Object.entries(results).find(([, r]) => r && r.three === true);
    return hit ? `${hit[0]}: ${hit[1].reason}` : '대상설비 조건 충족';
  }
  if (status === STATUS.UNKNOWN) return '대상설비 세부조건 일부 미입력';
  return '입력된 대상설비 전부 조건 불충족';
}

// 각 설비 평가 함수 — evaluateMeltingFurnace() 등, 법적 규칙 단위로 분리
// (STEP 5 지시 11번). eq가 present!==true(선택 안 함)면 그 설비는 논의 대상이
// 아니므로 3치 결과는 false(그 설비로 인한 TARGET 사유는 없음)로 취급한다.
// present는 true인데 세부 수치가 없으면 unknown.

function evaluateMeltingFurnace(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  const three = gte(eq.capacityTon, THRESHOLDS.EQUIPMENT_MELTING_FURNACE_TON);
  return {
    three,
    reason:
      three === undefined
        ? '용량 정보 없음'
        : `용해로 ${eq.capacityTon}톤 (기준 ${THRESHOLDS.EQUIPMENT_MELTING_FURNACE_TON}톤)`,
  };
}

function evaluateChemicalEquipment(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  // OPEN-ISSUE-M4-2: 안전보건규칙 별표9 물질별 기준량 수치, 시행령
  // 제43조제2항 제외설비 목록 모두 RULE-CONTRACT.md에 수치가 없다
  // (law-basis.js NOTICE_3.openItems 참고) — 호출자가 판정한 boolean만
  // 받는다. 이 값이 없으면 engine은 UNKNOWN으로 남긴다(추측 금지).
  const meetsThreshold = eq.meetsHazardousSubstanceThreshold; // boolean | undefined
  const excluded = eq.excludedByDecree43_2 === true;

  if (excluded) {
    return { three: false, reason: '시행령 제43조제2항 제외설비로 확인됨' };
  }
  return {
    three: meetsThreshold === undefined ? undefined : Boolean(meetsThreshold),
    reason:
      meetsThreshold === undefined
        ? '위험물질 기준량 충족 여부 미확인(별표9 수치는 이 저장소 범위 밖 — OPEN-ISSUE-M4-2)'
        : meetsThreshold
        ? '안전보건규칙 별표9 위험물질 기준량 충족'
        : '안전보건규칙 별표9 위험물질 기준량 미충족',
  };
}

function evaluateDryingEquipment(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  const sizeCondition = or3(
    gte(eq.fuelConsumptionKgPerHour, THRESHOLDS.EQUIPMENT_DRYING_FUEL_KG_PER_HOUR),
    gte(eq.ratedPowerKw, THRESHOLDS.EQUIPMENT_DRYING_RATED_POWER_KW)
  );
  const purposeCondition =
    eq.purpose === undefined
      ? undefined
      : eq.purpose === 'ORGANIC_COMPOUND' ||
        eq.purpose === 'COATING_FLAMMABLE_VAPOR' ||
        eq.purpose === 'COMBUSTIBLE_DUST';

  const three = and3(sizeCondition, purposeCondition);
  return {
    three,
    reason:
      three === undefined
        ? '연료소비량/정격소비전력 또는 건조목적 정보 없음'
        : `건조설비 규모+목적 조건 ${three ? '충족' : '불충족'}`,
  };
}

function evaluateGasWeldingAssembly(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  const three = and3(
    gte(eq.flammableGasQuantityKg, THRESHOLDS.EQUIPMENT_GAS_WELDING_ASSEMBLY_KG),
    eq.isFixed === undefined ? undefined : Boolean(eq.isFixed)
  );
  return {
    three,
    reason:
      three === undefined
        ? '인화성가스 집합량 또는 고정식 여부 정보 없음'
        : `인화성가스 ${eq.flammableGasQuantityKg}kg, 고정식 ${eq.isFixed ? 'O' : 'X'} (기준 ${THRESHOLDS.EQUIPMENT_GAS_WELDING_ASSEMBLY_KG}kg)`,
  };
}

function evaluateVentilation(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  if (eq.substanceCategory === undefined || eq.exhaustAirVolumeM3PerMin === undefined) {
    return { three: undefined, reason: '물질 구분 또는 배풍량 정보 없음' };
  }
  const threshold =
    eq.substanceCategory === 'NOTICE_TABLE1_ITEM7'
      ? THRESHOLDS.EQUIPMENT_VENTILATION_NOTICE_TABLE1_ITEM7_M3_PER_MIN
      : THRESHOLDS.EQUIPMENT_VENTILATION_PERMIT_OR_MANAGED_OR_DUST_M3_PER_MIN;
  const three = eq.exhaustAirVolumeM3PerMin >= threshold;
  return { three, reason: `배풍량 ${eq.exhaustAirVolumeM3PerMin}㎥/분 (기준 ${threshold}㎥/분)` };
}

// ---------------------------------------------------------------------------
// finalStatus / determinationCompleteness 집계
// (RULE-CONTRACT.md "결과 상태" 절 그대로 — Invariant 8, 9)
//
// 집계는 applicability===APPLICABLE인 모듈만 대상으로 한다.
// NOT_APPLICABLE_TO_WORK_TYPE 모듈은 NOT_TARGET으로 잘못 세지 않는다
// (STEP 5 지시 13번).
// ---------------------------------------------------------------------------

function aggregate(moduleResults) {
  const applicableResults = Object.values(moduleResults).filter(
    (m) => m.applicability === APPLICABILITY.APPLICABLE
  );

  const hasTarget = applicableResults.some((m) => m.status === STATUS.TARGET);
  const hasUnknown = applicableResults.some((m) => m.status === STATUS.UNKNOWN);

  let finalStatus;
  if (hasTarget) finalStatus = STATUS.TARGET;
  else if (hasUnknown) finalStatus = STATUS.UNKNOWN;
  else finalStatus = STATUS.NOT_TARGET;

  const determinationCompleteness = hasUnknown ? 'INCOMPLETE' : 'COMPLETE';

  const reasons = applicableResults.filter((m) => m.status === STATUS.TARGET).map((m) => m.ruleId);

  return { finalStatus, determinationCompleteness, reasons };
}

// ---------------------------------------------------------------------------
// evaluate() — 유일한 공개 진입점
// ---------------------------------------------------------------------------

/**
 * @param {object} input  Engine Input (아래 README-ENGINE.md 참고)
 * @param {object} [meta] { snapshotId, now } — Engine이 시간에 의존하지
 *   않기 위해 호출자가 명시적으로 넘긴다. 생략 가능(그러면 snapshot에
 *   해당 필드가 없다 — undefined를 스스로 생성하지 않는다).
 * @returns {object} Snapshot — 불변(Object.freeze)
 */
function evaluate(input, meta) {
  const module1 = evaluateModule1(input);
  const module2 = evaluateModule2(input, module1);
  const module3 = evaluateModule3(input, module1);
  const module4 = evaluateModule4(input);

  const moduleResults = Object.freeze({ module1, module2, module3, module4 });
  const { finalStatus, determinationCompleteness, reasons } = aggregate(moduleResults);

  const snapshot = {
    snapshotId: meta && meta.snapshotId,
    createdAt: meta && meta.now,
    engineVersion: ENGINE_VERSION,
    ruleVersion: RULE_VERSION,
    input: deepFreeze(clone(input)),
    moduleResults: deepFreeze(clone(moduleResults)),
    finalStatus,
    determinationCompleteness,
    reasons: Object.freeze(reasons),
  };

  return deepFreeze(snapshot);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}

module.exports = {
  evaluate,
  STATUS,
  APPLICABILITY,
  ENGINE_VERSION,
  RULE_VERSION,
  INDUSTRY_LIST,
  // 아래는 테스트·회귀검증 전용 export (내부 모듈 단위 검증용)
  _internal: {
    and3,
    or3,
    evaluateModule1,
    evaluateModule2,
    evaluateModule3,
    evaluateModule4,
    aggregate,
  },
};
