/**
 * ui-model.js — STEP 6-2 UI 입력 모델 (UI-DESIGN.md §2, §4 구현)
 *
 * 이 파일은 "질문을 어떻게 보여주고 사용자 답을 Engine 입력 스키마로 어떻게 옮기는가"만 다룬다.
 *  - 법적 판정, 임계값 비교, 파생값(순증가분 등) 계산을 하지 않는다.
 *  - engine.js / data.js를 import하지 않는다(열거값은 아래 상수로 두고 tests-ui.js가 data.js와 대조한다).
 *  - "모름"은 키 생략, "포함 안 됨/해당 설비 없음"만 false(또는 none:true), 빈 객체는 만들지 않는다.
 *  - UI는 Engine의 현재 계약을 보정하지 않는다(OPEN-ISSUE-ENGINE-M4-CHEM-EXCLUSION-UNKNOWN 포함).
 */
'use strict';

// ---- Engine 입력 어휘(계약 테스트가 data.js와 대조) ----------------------------------
const WORK = Object.freeze({
  NEW: 'NEW',
  FULL_RELOCATION: 'FULL_RELOCATION',
  MODIFICATION: 'MODIFICATION',
  PARTIAL_RELOCATION: 'PARTIAL_RELOCATION',
});
const DRYING = Object.freeze({
  ORGANIC: 'ORGANIC_COMPOUND',
  COATING: 'COATING_FLAMMABLE_VAPOR',
  DUST: 'COMBUSTIBLE_DUST',
  OTHER: 'OTHER_NOT_IN_ARTICLE3', // D-B: 3종 어디에도 해당하지 않음(UI 규약 값)
});
const VENT = Object.freeze({
  T1: 'NOTICE_TABLE1_ITEM7',
  T16: 'PERMIT_OR_MANAGED_OR_DUST_TABLE16',
});

// 화면(DOM)에는 Engine 열거값을 쓰지 않는다 — 상태/DOM은 UI 토큰을 쓰고, Engine 값으로의 변환은 이 파일 안에서만 한다.
const UI_WORK = Object.freeze({ new: WORK.NEW, full: WORK.FULL_RELOCATION, modify: WORK.MODIFICATION, partial: WORK.PARTIAL_RELOCATION });
const UI_DRY = Object.freeze({ organic: DRYING.ORGANIC, coating: DRYING.COATING, dust: DRYING.DUST, other: DRYING.OTHER });
const UI_VENT = Object.freeze({ cat1: VENT.T1, cat2: VENT.T16 });

// 화면(DOM)에서는 엔진 내부 키를 쓰지 않는다 — UI id ↔ 엔진 키 매핑은 이 파일 안에서만 존재한다.
const EQUIP_IDS = Object.freeze(['melt', 'chem', 'dry', 'gas', 'vent']);
const ENGINE_KEY = Object.freeze({
  melt: 'meltingFurnace',
  chem: 'chemicalEquipment',
  dry: 'dryingEquipment',
  gas: 'gasWeldingAssembly',
  vent: 'ventilation',
});

// ---- 흐름표(선언형) — RULE-CONTRACT STEP 1~6(정정 2026-10-01) ------------------------
const STEP_NUMBER = Object.freeze({
  workType: 1,
  industry: 2,
  contract: 3,
  equip: 4,
  equipDetail: 5,
  changeDetail: 5,
  relocationDetail: 5,
  m4Notice: null, // 번호 없는 안내 화면
  result: 6,
});

function newNum() {
  return { value: '', unknown: false };
}

function initialState() {
  return {
    step: 'start',
    errors: [],
    workType: undefined,
    industry: { choice: undefined, name: '' }, // choice: listed | not_listed | unknown
    contract: newNum(),
    equip: {
      selected: { melt: false, chem: false, dry: false, gas: false, vent: false },
      none: false,
      unknown: false,
      details: {
        melt: { capacity: newNum() },
        chem: { meets: undefined, excluded: undefined },
        dry: { fuel: newNum(), power: newNum(), purpose: undefined },
        gas: { quantity: newNum(), fixed: undefined },
        vent: { category: undefined, airVolume: newNum() },
      },
    },
    m2: { gross: newNum(), excluded: newNum() },
    m3: { relocated: newNum() },
    chg: {
      include: { melt: undefined, chem: undefined, dry: undefined, gas: undefined, vent: undefined },
      details: {
        melt: { existing: undefined, heat: undefined },
        chem: { existing: undefined, production: undefined, managed: undefined },
        dry: { existing: undefined, heat: undefined, target: undefined, newPurpose: undefined },
        gas: { existing: undefined, pipe: undefined },
        vent: { existing: undefined, change: undefined },
      },
    },
  };
}

function equipMode(state) {
  const e = state.equip;
  if (e.none) return 'NONE';
  if (e.unknown) return 'UNKNOWN';
  if (EQUIP_IDS.some((id) => e.selected[id])) return 'SELECT';
  return undefined;
}

/** 작업 형태별 단계 목록(선언형 조회). 법적 조건식 없음. */
function stepsFor(state) {
  const w = UI_WORK[state.workType];
  if (w === WORK.NEW || w === WORK.FULL_RELOCATION) {
    const s = ['workType', 'industry', 'contract', 'equip'];
    if (equipMode(state) === 'SELECT') s.push('equipDetail');
    s.push('result');
    return s;
  }
  if (w === WORK.MODIFICATION) return ['workType', 'industry', 'contract', 'equip', 'changeDetail', 'result'];
  if (w === WORK.PARTIAL_RELOCATION) return ['workType', 'industry', 'contract', 'relocationDetail', 'm4Notice', 'result'];
  return ['workType'];
}

// ---- 값 파싱: 형식 검증만(숫자/유한/음수 아님). 법적 임계값 비교 없음 -----------------
/** @returns {{kind:'omitted'|'unanswered'|'ok'|'negative'|'invalid', value?:number}} */
function parseNum(f) {
  if (f.unknown) return { kind: 'omitted' };
  const raw = String(f.value == null ? '' : f.value).replace(/,/g, '').trim();
  if (raw === '') return { kind: 'unanswered' };
  if (/^\d+(\.\d+)?$/.test(raw)) return { kind: 'ok', value: Number(raw) };
  if (/^-\s*\d/.test(raw)) return { kind: 'negative' };
  return { kind: 'invalid' };
}

const triToBool = (t) => (t === 'yes' ? true : t === 'no' ? false : undefined); // unknown/미응답 → 키 생략

function numOrUndef(f) {
  const p = parseNum(f);
  return p.kind === 'ok' ? p.value : undefined; // 빈 값/모름 → 키 생략, 사용자가 입력한 0은 0 보존
}

/** undefined 값과 빈 객체를 재귀적으로 제거. 빈 객체를 엔진에 보내지 않는다(equipment:{} 함정 방지). */
function prune(o) {
  if (Array.isArray(o) || o === null || typeof o !== 'object') return o;
  const out = {};
  for (const k of Object.keys(o)) {
    const v = prune(o[k]);
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

function dryVal(v) {
  // UI 토큰 → Engine 값. 모름/미응답은 undefined(키 생략). 'other'는 D-B에 따라 OTHER_NOT_IN_ARTICLE3.
  return Object.prototype.hasOwnProperty.call(UI_DRY, v) ? UI_DRY[v] : undefined;
}
function ventVal(v) {
  return Object.prototype.hasOwnProperty.call(UI_VENT, v) ? UI_VENT[v] : undefined;
}

function installationEquipment(state) {
  const mode = equipMode(state);
  if (mode === 'NONE') return { none: true }; // 명시적으로 "해당 설비 없음"을 고른 경우에만
  if (mode !== 'SELECT') return undefined; // 미응답/모름 → equipment 키 생략(→ UNKNOWN)
  const d = state.equip.details;
  const out = {};
  if (state.equip.selected.melt) out.meltingFurnace = { present: true, capacityTon: numOrUndef(d.melt.capacity) };
  if (state.equip.selected.chem) {
    out.chemicalEquipment = {
      present: true,
      meetsHazardousSubstanceThreshold: triToBool(d.chem.meets),
      excludedByDecree43_2: triToBool(d.chem.excluded),
    };
  }
  if (state.equip.selected.dry) {
    out.dryingEquipment = {
      present: true,
      fuelConsumptionKgPerHour: numOrUndef(d.dry.fuel),
      ratedPowerKw: numOrUndef(d.dry.power),
      purpose: dryVal(d.dry.purpose),
    };
  }
  if (state.equip.selected.gas) {
    out.gasWeldingAssembly = { present: true, flammableGasQuantityKg: numOrUndef(d.gas.quantity), isFixed: triToBool(d.gas.fixed) };
  }
  if (state.equip.selected.vent) {
    out.ventilation = { present: true, substanceCategory: ventVal(d.vent.category), exhaustAirVolumeM3PerMin: numOrUndef(d.vent.airVolume) };
  }
  return out;
}

/** D-A: 증설 STEP 4 — "포함 안 됨"은 변경 조건 false, "모름"은 키 생략, "포함됨"은 세부 질문 답. */
function changeEquipment(state) {
  const inc = state.chg.include;
  const d = state.chg.details;
  const out = {};
  const NO = false;
  if (inc.melt === 'no') out.meltingFurnace = { heatSourceTypeChanged: NO };
  else if (inc.melt === 'yes') out.meltingFurnace = { existingTarget: triToBool(d.melt.existing), heatSourceTypeChanged: triToBool(d.melt.heat) };

  if (inc.chem === 'no') {
    out.chemicalEquipment = { productionOrMaterialChangeReplacement: NO, managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease: NO };
  } else if (inc.chem === 'yes') {
    out.chemicalEquipment = {
      existingTarget: triToBool(d.chem.existing),
      productionOrMaterialChangeReplacement: triToBool(d.chem.production),
      managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease: triToBool(d.chem.managed),
    };
  }

  if (inc.dry === 'no') out.dryingEquipment = { heatSourceTypeChanged: NO, dryingTargetChanged: NO };
  else if (inc.dry === 'yes') {
    out.dryingEquipment = {
      existingTarget: triToBool(d.dry.existing),
      heatSourceTypeChanged: triToBool(d.dry.heat),
      dryingTargetChanged: triToBool(d.dry.target),
      newPurpose: d.dry.target === 'yes' ? dryVal(d.dry.newPurpose) : undefined,
    };
  }

  if (inc.gas === 'no') out.gasWeldingAssembly = { mainPipeStructureChanged: NO };
  else if (inc.gas === 'yes') out.gasWeldingAssembly = { existingTarget: triToBool(d.gas.existing), mainPipeStructureChanged: triToBool(d.gas.pipe) };

  if (inc.vent === 'no') out.ventilation = { equipmentChangeCausingVelocityDecreaseOrAirflowIncrease: NO };
  else if (inc.vent === 'yes') {
    out.ventilation = { existingTarget: triToBool(d.vent.existing), equipmentChangeCausingVelocityDecreaseOrAirflowIncrease: triToBool(d.vent.change) };
  }
  return out;
}

/**
 * 순수 매핑: UI 상태 → Engine 입력. 판정·검증 없음.
 * - 모름/미응답/빈 값 → 키 생략. 명시적 0은 0. 빈 객체 금지(prune).
 * - 현재 작업 형태에서 쓰이지 않는 입력(이설의 설비 입력 등)은 상태에 남아 있어도 보내지 않는다.
 */
function buildEngineInput(state) {
  const w = UI_WORK[state.workType];
  const input = { workType: w };
  const ind = state.industry;
  input.businessType = { withinListedIndustries: ind.choice === 'listed' ? true : ind.choice === 'not_listed' ? false : undefined };
  input.contractCapacityKw = numOrUndef(state.contract);
  if (w === WORK.NEW || w === WORK.FULL_RELOCATION) {
    input.equipment = installationEquipment(state);
  } else if (w === WORK.MODIFICATION) {
    input.module2 = {
      grossRatedCapacityIncreaseKw: numOrUndef(state.m2.gross),
      sameManufacturerSameModelExcludedKw: numOrUndef(state.m2.excluded),
    };
    input.equipmentChange = changeEquipment(state);
  } else if (w === WORK.PARTIAL_RELOCATION) {
    input.module3 = { relocatedRatedCapacityKw: numOrUndef(state.m3.relocated) };
  }
  return prune(input);
}

// ---- 필수 질문 검증(D-F): 선택 없이 "다음" 불가, 숫자는 형식·음수만 차단 ---------------
const MSG = Object.freeze({
  select: '선택해 주세요.',
  number: '숫자로 입력해 주세요.',
  negative: '음수는 입력할 수 없습니다. 0 이상의 숫자로 입력해 주세요.',
  numberOrUnknown: '숫자를 입력하거나 "아직 확인 못 함"을 선택해 주세요.',
});

function checkNum(errs, id, f) {
  const p = parseNum(f);
  if (p.kind === 'unanswered') errs.push({ id, message: MSG.numberOrUnknown });
  else if (p.kind === 'invalid') errs.push({ id, message: MSG.number });
  else if (p.kind === 'negative') errs.push({ id, message: MSG.negative });
}
function checkTri(errs, id, v) {
  if (v === undefined) errs.push({ id, message: MSG.select });
}

/** @returns {{id:string,message:string}[]} 비어 있으면 진행 가능. 법적 임계값 비교 없음. */
function validateStep(state, step) {
  const errs = [];
  if (step === 'workType') {
    if (!state.workType) errs.push({ id: 'g-workType', message: MSG.select });
  } else if (step === 'industry') {
    const i = state.industry;
    if (!i.choice) errs.push({ id: 'g-industry', message: MSG.select });
    else if (i.choice === 'listed' && !i.name) errs.push({ id: 'f-industry-name', message: MSG.select });
  } else if (step === 'contract') {
    checkNum(errs, 'f-contract', state.contract);
  } else if (step === 'equip') {
    if (state.workType === 'modify') {
      for (const id of EQUIP_IDS) checkTri(errs, 'g-include-' + id, state.chg.include[id]);
    } else if (!equipMode(state)) {
      errs.push({ id: 'g-equip', message: MSG.select });
    }
  } else if (step === 'equipDetail') {
    const s = state.equip.selected;
    const d = state.equip.details;
    if (s.melt) checkNum(errs, 'f-melt-capacity', d.melt.capacity);
    if (s.chem) {
      checkTri(errs, 'g-chem-meets', d.chem.meets);
      checkTri(errs, 'g-chem-excluded', d.chem.excluded);
    }
    if (s.dry) {
      checkNum(errs, 'f-dry-fuel', d.dry.fuel);
      checkNum(errs, 'f-dry-power', d.dry.power);
      checkTri(errs, 'g-dry-purpose', d.dry.purpose);
    }
    if (s.gas) {
      checkNum(errs, 'f-gas-quantity', d.gas.quantity);
      checkTri(errs, 'g-gas-fixed', d.gas.fixed);
    }
    if (s.vent) {
      checkTri(errs, 'g-vent-category', d.vent.category);
      checkNum(errs, 'f-vent-airVolume', d.vent.airVolume);
    }
  } else if (step === 'changeDetail') {
    checkNum(errs, 'f-m2-gross', state.m2.gross);
    checkNum(errs, 'f-m2-excluded', state.m2.excluded);
    const inc = state.chg.include;
    const d = state.chg.details;
    if (inc.melt === 'yes') {
      checkTri(errs, 'g-melt-existing', d.melt.existing);
      checkTri(errs, 'g-melt-heat', d.melt.heat);
    }
    if (inc.chem === 'yes') {
      checkTri(errs, 'g-chem-existing', d.chem.existing);
      checkTri(errs, 'g-chem-production', d.chem.production);
      checkTri(errs, 'g-chem-managed', d.chem.managed);
    }
    if (inc.dry === 'yes') {
      checkTri(errs, 'g-dry-existing', d.dry.existing);
      checkTri(errs, 'g-dry-heat', d.dry.heat);
      checkTri(errs, 'g-dry-target', d.dry.target);
      if (d.dry.target === 'yes') checkTri(errs, 'g-dry-newPurpose', d.dry.newPurpose);
    }
    if (inc.gas === 'yes') {
      checkTri(errs, 'g-gas-existing', d.gas.existing);
      checkTri(errs, 'g-gas-pipe', d.gas.pipe);
    }
    if (inc.vent === 'yes') {
      checkTri(errs, 'g-vent-existing', d.vent.existing);
      checkTri(errs, 'g-vent-change', d.vent.change);
    }
  } else if (step === 'relocationDetail') {
    checkNum(errs, 'f-m3-relocated', state.m3.relocated);
  }
  return errs;
}

/** 확인 필요 항목의 "입력 수정" 이동 대상 단계 — 정적 매핑(판정 아님). */
function stepForTarget(state, target) {
  const steps = stepsFor(state);
  const pick = (...c) => c.find((s) => steps.includes(s));
  if (target === 'business') return 'industry';
  if (target === 'increase') return pick('changeDetail');
  if (target === 'relocation') return pick('relocationDetail');
  if (target === 'equipment') return pick('equipDetail', 'equip');
  return steps[0];
}

module.exports = {
  WORK,
  DRYING,
  VENT,
  UI_WORK,
  UI_DRY,
  UI_VENT,
  EQUIP_IDS,
  ENGINE_KEY,
  STEP_NUMBER,
  MSG,
  initialState,
  equipMode,
  stepsFor,
  parseNum,
  prune,
  buildEngineInput,
  validateStep,
  stepForTarget,
};
