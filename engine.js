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

const ENGINE_VERSION = '0.2.0';

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
// 모듈 4 — 대상설비 5종 (RULE-CONTRACT.md ## 판정 모듈 4, 세션5 재작성)
//
// 세션5에서 법 제42조제1항제2호 원문("설치·이전하거나 그 주요 구조부분을
// 변경하려는 경우")을 확보해 OPEN-ISSUE-M4-1을 해소했다. 모듈4는 작업형태에
// 따라 배타적으로 다른 경로를 평가한다(모듈1~3과 동일한 패턴):
//   - 신설/전체이전 → M4-설치/이전 (NOTICE_3 기준표)
//   - 증설·교체·개조 → M4-주요구조부분변경 (NOTICE_2_1_6 가~마목)
//   - 이설(부분이전) → 법적 근거 미확정(OPEN-ISSUE-M4-RELOCATION-PARTIAL) → UNKNOWN
// 두 경로를 동시에 계산해 OR로 합치지 않는다 — 현재 작업형태에 해당하는
// 경로만 평가한다(검토자 지적: workType이 MODIFICATION인데 input.equipment가
// 기준표를 충족한다고 해서 설치경로가 TARGET에 기여하면 안 됨).
// ---------------------------------------------------------------------------

function evaluateModule4(input) {
  const installation = evaluateM4Installation(input.equipment, input.workType);
  const modification = evaluateM4Modification(input.equipmentChange, input.workType);

  let status;
  if (input.workType === WORK_TYPE.NEW || input.workType === WORK_TYPE.FULL_RELOCATION) {
    status = installation.status;
  } else if (input.workType === WORK_TYPE.MODIFICATION) {
    status = modification.status;
  } else if (input.workType === WORK_TYPE.PARTIAL_RELOCATION) {
    // OPEN-ISSUE-M4-RELOCATION-PARTIAL: 법적 근거 미확정 — 추측해서
    // TARGET/NOT_TARGET을 만들지 않는다. 항상 UNKNOWN.
    status = STATUS.UNKNOWN;
  } else {
    status = STATUS.UNKNOWN;
  }

  const reason = describeModule4(input.workType, status, installation, modification);

  return {
    ruleId: 'M4',
    status,
    applicability: APPLICABILITY.APPLICABLE, // 모듈4는 항상 독립 평가 — applicability 분기 없음
    legalBasis: [LAW_BASIS.DECREE_42_2.ruleId],
    reason,
    paths: { installation, modification },
    unresolvedLegalIssue:
      input.workType === WORK_TYPE.PARTIAL_RELOCATION ? 'OPEN-ISSUE-M4-RELOCATION-PARTIAL' : undefined,
  };
}

function describeModule4(workType, status, installation, modification) {
  if (workType === WORK_TYPE.PARTIAL_RELOCATION) {
    return '이설(부분이전) 시 모듈4 판정기준이 RULE-CONTRACT.md에 미확정 — OPEN-ISSUE-M4-RELOCATION-PARTIAL';
  }
  const path = workType === WORK_TYPE.MODIFICATION ? modification : installation;
  if (status === STATUS.TARGET) {
    const hit = Object.entries(path.equipmentResults || {}).find(([, r]) => r && r.three === true);
    return hit ? `${hit[0]}: ${hit[1].reason}` : '대상설비 조건 충족';
  }
  if (status === STATUS.UNKNOWN) return '대상설비 세부조건 일부 미입력';
  return '입력된 대상설비 전부 조건 불충족';
}

// ---------------------------------------------------------------------------
// M4-설치/이전 — 고시 제3조 기준표 (신설/전체이전에만 적용)
// ---------------------------------------------------------------------------

function evaluateM4Installation(eq, workType) {
  const applicability =
    workType === WORK_TYPE.NEW || workType === WORK_TYPE.FULL_RELOCATION
      ? APPLICABILITY.APPLICABLE
      : APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE;

  if (applicability !== APPLICABILITY.APPLICABLE) {
    return { ruleId: 'M4-INSTALL', status: STATUS.NOT_TARGET, applicability, equipmentResults: {} };
  }

  // STEP4 자체를 아직 안 받은 경우(화면에 도달 안 함) 전체가 UNKNOWN.
  if (eq === undefined) {
    return {
      ruleId: 'M4-INSTALL',
      status: STATUS.UNKNOWN,
      applicability,
      equipmentResults: {},
      reason: '대상설비 해당 여부 정보가 없어 판단할 수 없음',
    };
  }
  // 사용자가 "없음"을 명시적으로 답한 경우 — 확정된 정보이므로 NOT_TARGET.
  if (eq.none === true) {
    return {
      ruleId: 'M4-INSTALL',
      status: STATUS.NOT_TARGET,
      applicability,
      equipmentResults: {},
      reason: '대상설비 없음으로 확인됨',
    };
  }

  const equipmentResults = {
    meltingFurnace: evaluateMeltingFurnace_Installation(eq.meltingFurnace),
    chemicalEquipment: evaluateChemicalEquipment_Installation(eq.chemicalEquipment),
    dryingEquipment: evaluateDryingEquipment_Installation(eq.dryingEquipment),
    gasWeldingAssembly: evaluateGasWeldingAssembly_Installation(eq.gasWeldingAssembly),
    ventilation: evaluateVentilation_Installation(eq.ventilation),
  };

  const three = or3(
    equipmentResults.meltingFurnace.three,
    equipmentResults.chemicalEquipment.three,
    equipmentResults.dryingEquipment.three,
    equipmentResults.gasWeldingAssembly.three,
    equipmentResults.ventilation.three
  );

  return {
    ruleId: 'M4-INSTALL',
    status: toStatus(three),
    applicability,
    legalBasis: [LAW_BASIS.NOTICE_3.ruleId, LAW_BASIS.NOTICE_2_4.ruleId],
    equipmentResults,
  };
}

// 각 설비 평가 함수 — evaluateXxx_Installation(), 법적 규칙 단위로 분리
// (STEP 5 지시 11번). eq가 present!==true(선택 안 함)면 그 설비는 논의 대상이
// 아니므로 3치 결과는 false(그 설비로 인한 TARGET 사유는 없음)로 취급한다.
// present는 true인데 세부 수치가 없으면 unknown.

function evaluateMeltingFurnace_Installation(eq) {
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

function evaluateChemicalEquipment_Installation(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  // OPEN-ISSUE(별표9): 안전보건규칙 별표9 물질별 기준량 수치는 이 저장소
  // 범위 밖 — 호출자가 판정한 boolean만 받는다(law-basis.js NOTICE_3.openItems
  // 참고). 시행령 제43조제2항 제외설비 여부(excludedByDecree43_2)는 세션5에서
  // 근거가 확정됐다(DECREE_43_2 참고) — "시행령 제43조제2항에서 정한 설비에
  // 해당하여 고시 제3조제2호의 화학설비 대상에서 제외되는가?"를 의미한다.
  const meetsThreshold = eq.meetsHazardousSubstanceThreshold; // boolean | undefined
  const excluded = eq.excludedByDecree43_2 === true;

  if (excluded) {
    return { three: false, reason: '시행령 제43조제2항 제외설비로 확인됨(고시 제3조제2호 단서)' };
  }
  return {
    three: meetsThreshold === undefined ? undefined : Boolean(meetsThreshold),
    reason:
      meetsThreshold === undefined
        ? '위험물질 기준량 충족 여부 미확인(별표9 수치는 이 저장소 범위 밖)'
        : meetsThreshold
        ? '안전보건규칙 별표9 위험물질 기준량 충족'
        : '안전보건규칙 별표9 위험물질 기준량 미충족',
  };
}

function evaluateDryingEquipment_Installation(eq) {
  if (!eq || eq.present !== true) {
    return { three: false, reason: '해당 없음' };
  }
  const sizeCondition = or3(
    gte(eq.fuelConsumptionKgPerHour, THRESHOLDS.EQUIPMENT_DRYING_FUEL_KG_PER_HOUR),
    gte(eq.ratedPowerKw, THRESHOLDS.EQUIPMENT_DRYING_RATED_POWER_KW)
  );
  const purposeCondition = isValidDryingPurpose(eq.purpose);

  const three = and3(sizeCondition, purposeCondition);
  return {
    three,
    reason:
      three === undefined
        ? '연료소비량/정격소비전력 또는 건조목적 정보 없음'
        : `건조설비 규모+목적 조건 ${three ? '충족' : '불충족'}`,
  };
}

function evaluateGasWeldingAssembly_Installation(eq) {
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

function evaluateVentilation_Installation(eq) {
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

// 건조설비의 "목적" 값이 고시 제3조제3호 각목(유기화합물건조/도료피막코팅표면
// 건조/가연성분말분진) 중 하나에 해당하는지 — M4-설치와 M4-변경(경로B) 둘 다
// 이 함수를 공유한다(제3조제3호 "목적분류"는 재사용, 크기기준은 재사용 안 함).
function isValidDryingPurpose(purpose) {
  if (purpose === undefined) return undefined;
  return (
    purpose === 'ORGANIC_COMPOUND' ||
    purpose === 'COATING_FLAMMABLE_VAPOR' ||
    purpose === 'COMBUSTIBLE_DUST'
  );
}

// ---------------------------------------------------------------------------
// M4-주요구조부분변경 — 고시 제2조제1항제6호 가~마목 (증설·교체·개조에만 적용)
//
// 전제(도입부 "~설비 중"): 각 목 전부 "해당 설비가 이미 고시 제3조 기준을
// 충족하는 대상설비"라는 것을 전제한다 — existingTarget 입력으로 받는다.
// 이 값은 Engine이 다시 계산하는 게 아니라 호출자가 넘기는 입력 사실이다
// (검토자 지적: "기존 대상설비 여부"와 "현재 변경행위"를 한 Engine 안에서
// 순환적으로 섞지 않기 위함) — Snapshot에도 입력 그대로 기록된다.
// ---------------------------------------------------------------------------

function evaluateM4Modification(change, workType) {
  const applicability =
    workType === WORK_TYPE.MODIFICATION
      ? APPLICABILITY.APPLICABLE
      : APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE;

  if (applicability !== APPLICABILITY.APPLICABLE) {
    return { ruleId: 'M4-CHANGE', status: STATUS.NOT_TARGET, applicability, equipmentResults: {} };
  }

  // 검토자 지적: 증설·교체·개조 작업인데 equipmentChange 자체가 없으면
  // "변경 대상이 없다"(false)가 아니라 "입력 자체가 없다"(UNKNOWN)다.
  if (change === undefined) {
    return {
      ruleId: 'M4-CHANGE',
      status: STATUS.UNKNOWN,
      applicability,
      equipmentResults: {},
      reason: '대상설비 변경사항 정보가 없어 판단할 수 없음',
    };
  }

  const equipmentResults = {
    meltingFurnace: evaluateMeltingFurnace_Change(change.meltingFurnace),
    chemicalEquipment: evaluateChemicalEquipment_Change(change.chemicalEquipment),
    dryingEquipment: evaluateDryingEquipment_Change(change.dryingEquipment),
    gasWeldingAssembly: evaluateGasWeldingAssembly_Change(change.gasWeldingAssembly),
    ventilation: evaluateVentilation_Change(change.ventilation),
  };

  const three = or3(
    equipmentResults.meltingFurnace.three,
    equipmentResults.chemicalEquipment.three,
    equipmentResults.dryingEquipment.three,
    equipmentResults.gasWeldingAssembly.three,
    equipmentResults.ventilation.three
  );

  return {
    ruleId: 'M4-CHANGE',
    status: toStatus(three),
    applicability,
    legalBasis: [LAW_BASIS.NOTICE_2_1_6.ruleId],
    equipmentResults,
  };
}

// eq가 아예 없으면(해당 설비에 대한 응답 자체가 없으면) 그 설비는 판정할
// 정보가 없다는 뜻 — false가 아니라 undefined(그 설비 자체는 or3 결합에서
// unknown으로 잡히되, existingTarget이 명시적으로 false면 and3가 그 즉시
// NOT_TARGET으로 확정한다).

function evaluateMeltingFurnace_Change(eq) {
  if (!eq) return { three: undefined, reason: '변경사항 정보 없음' };
  const three = and3(toThreeValued(eq.existingTarget), toThreeValued(eq.heatSourceTypeChanged));
  return { three, reason: describeChangeReason(three, '용해로 열원 종류 변경') };
}

function evaluateChemicalEquipment_Change(eq) {
  if (!eq) return { three: undefined, reason: '변경사항 정보 없음' };
  const trigger = or3(
    toThreeValued(eq.productionOrMaterialChangeReplacement),
    toThreeValued(eq.managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease)
  );
  const three = and3(toThreeValued(eq.existingTarget), trigger);
  return { three, reason: describeChangeReason(three, '화학설비 교체·변경·추가 또는 유해물질설비 변경') };
}

function evaluateDryingEquipment_Change(eq) {
  if (!eq) return { three: undefined, reason: '변경사항 정보 없음' };
  const existingTarget = toThreeValued(eq.existingTarget);

  // 경로A: 열원 종류 변경
  const pathA = and3(existingTarget, toThreeValued(eq.heatSourceTypeChanged));
  // 경로B: 건조대상물 변경 + 신규 목적이 제3조제3호 각목 재해당(크기기준 재적용 안 함)
  const pathB = and3(
    existingTarget,
    toThreeValued(eq.dryingTargetChanged),
    isValidDryingPurpose(eq.newPurpose)
  );

  const three = or3(pathA, pathB);
  return { three, reason: describeChangeReason(three, '건조설비 열원종류 변경 또는 건조대상물 변경') };
}

function evaluateGasWeldingAssembly_Change(eq) {
  if (!eq) return { three: undefined, reason: '변경사항 정보 없음' };
  const three = and3(toThreeValued(eq.existingTarget), toThreeValued(eq.mainPipeStructureChanged));
  return { three, reason: describeChangeReason(three, '가스집합용접장치 주관 구조 변경') };
}

function evaluateVentilation_Change(eq) {
  if (!eq) return { three: undefined, reason: '변경사항 정보 없음' };
  const three = and3(
    toThreeValued(eq.existingTarget),
    toThreeValued(eq.equipmentChangeCausingVelocityDecreaseOrAirflowIncrease)
  );
  return { three, reason: describeChangeReason(three, '유해물질/분진 설비 추가·변경으로 풍속감소·배풍량증가') };
}

function toThreeValued(value) {
  return value === undefined ? undefined : Boolean(value);
}

function describeChangeReason(three, label) {
  if (three === undefined) return `${label} — 기존 대상설비 여부 또는 변경사항 정보 없음`;
  return three ? `${label}: 조건 충족` : `${label}: 조건 불충족`;
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
