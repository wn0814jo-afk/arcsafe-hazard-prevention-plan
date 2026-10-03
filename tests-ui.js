/**
 * tests-ui.js — STEP 6 (Report/UI) 테스트. 기존 tests.js(Engine 82개)는 수정하지 않는다.
 * 이 파일은 계약 대조를 위해 engine.js/data.js를 import한다(테스트 코드이므로 허용; UI/Report 소스는 금지).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const engine = require('./engine.js');
const data = require('./data.js');
const { LAW_BASIS } = require('./law-basis.js');
const M = require('./ui-model.js');
const R = require('./report.js');
const RENDER = require('./ui-render.js');
const { COPY } = require('./ui-copy.js');
const APP = require('./app.js');
const BUILD = require('./build.js');

let pass = 0;
let fail = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push(name + '\n    ' + String(e && e.message).split('\n').join('\n    '));
  }
}

const deps = APP.createDeps({ now: () => '2026-10-02T09:00:00.000Z' });

// ---- 상태 생성 헬퍼 ---------------------------------------------------------------------
function base(w) {
  const s = M.initialState();
  s.workType = w;
  s.industry = { choice: 'listed', name: '반도체 제조업' };
  s.contract = { value: '400', unknown: false };
  return s;
}
const num = (v) => ({ value: String(v), unknown: false });
const UNK = () => ({ value: '', unknown: true });
const run = (s) => APP.runEvaluation(s, deps);

function newA() { // TARGET + COMPLETE
  const s = base('new');
  s.equip.selected.melt = true;
  s.equip.details.melt.capacity = num(5);
  return s;
}
function newB() { // TARGET + INCOMPLETE (사업장 기준 TARGET, 설비 미확인)
  const s = base('new');
  s.equip.unknown = true;
  return s;
}
function newC() { // UNKNOWN + INCOMPLETE
  const s = base('new');
  s.industry = { choice: 'unknown', name: '' };
  s.equip.none = true;
  return s;
}
function newD() { // NOT_TARGET + COMPLETE
  const s = base('new');
  s.industry = { choice: 'not_listed', name: '' };
  s.equip.none = true;
  return s;
}
function partial() {
  const s = base('partial');
  s.m3.relocated = num(150);
  return s;
}
function modify(includeAll) {
  const s = base('modify');
  s.m2.gross = num(150);
  s.m2.excluded = num(0);
  for (const id of M.EQUIP_IDS) s.chg.include[id] = includeAll;
  return s;
}

function hasEmptyObject(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  if (Object.keys(o).length === 0) return true;
  return Object.values(o).some(hasEmptyObject);
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}
function allKeys(o, acc) {
  acc = acc || new Set();
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      acc.add(k);
      allKeys(o[k], acc);
    }
  }
  return acc;
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// ============================================================================================
// A. 어휘 계약 (UI/Report 상수 ↔ Engine/data.js)
// ============================================================================================
test('A1 report.js의 status/applicability/완전성 어휘가 Engine과 일치', () => {
  assert.strictEqual(R.REPORT_VOCAB.TARGET, engine.STATUS.TARGET);
  assert.strictEqual(R.REPORT_VOCAB.NOT_TARGET, engine.STATUS.NOT_TARGET);
  assert.strictEqual(R.REPORT_VOCAB.UNKNOWN, engine.STATUS.UNKNOWN);
  assert.strictEqual(R.REPORT_VOCAB.APPLICABLE, engine.APPLICABILITY.APPLICABLE);
  const seen = new Set();
  for (const f of [newA, newB, newC, newD, partial]) seen.add(run(f()).snapshot.determinationCompleteness);
  assert.deepStrictEqual([...seen].sort(), [R.REPORT_VOCAB.COMPLETE, R.REPORT_VOCAB.INCOMPLETE].sort());
});
test('A2 UI 작업 형태/목적/물질 구분 상수가 data.js와 일치', () => {
  assert.deepStrictEqual({ ...M.WORK }, { ...data.WORK_TYPE });
  assert.strictEqual(M.DRYING.ORGANIC, data.DRYING_PURPOSE.ORGANIC_COMPOUND);
  assert.strictEqual(M.DRYING.COATING, data.DRYING_PURPOSE.COATING_FLAMMABLE_VAPOR);
  assert.strictEqual(M.DRYING.DUST, data.DRYING_PURPOSE.COMBUSTIBLE_DUST);
  assert.strictEqual(M.DRYING.OTHER, 'OTHER_NOT_IN_ARTICLE3');
  assert.strictEqual(M.VENT.T1, data.VENTILATION_SUBSTANCE_CATEGORY.NOTICE_TABLE1_ITEM7);
  assert.strictEqual(M.VENT.T16, data.VENTILATION_SUBSTANCE_CATEGORY.PERMIT_OR_MANAGED_OR_DUST_TABLE16);
  assert.deepStrictEqual(Object.keys(R.REPORT_COPY.workType).sort(), Object.keys(data.WORK_TYPE).sort());
});
test('A3 화면 선택지 토큰이 UI 토큰 사전에 모두 존재하고 Engine 값이 노출되지 않음', () => {
  for (const o of COPY.workTypeOptions) assert.ok(M.UI_WORK[o.value], o.value);
  for (const o of COPY.dryPurposeOptions) assert.ok(o.value === 'unknown' || M.UI_DRY[o.value], o.value);
  for (const o of COPY.ventCategoryOptions) assert.ok(o.value === 'unknown' || M.UI_VENT[o.value], o.value);
  const engineValues = new Set([...Object.values(data.WORK_TYPE), ...Object.values(data.DRYING_PURPOSE), ...Object.values(data.VENTILATION_SUBSTANCE_CATEGORY), 'OTHER_NOT_IN_ARTICLE3']);
  for (const o of [...COPY.workTypeOptions, ...COPY.dryPurposeOptions, ...COPY.ventCategoryOptions]) assert.ok(!engineValues.has(o.value), o.value);
});
test('A4 설비 키 사전이 Engine 결과 키 및 Report 설비 표와 일치', () => {
  const s = base('new');
  for (const id of M.EQUIP_IDS) s.equip.selected[id] = true;
  const eq = run(s).snapshot.moduleResults.module4.paths.installation.equipmentResults;
  const engineKeys = Object.values(M.ENGINE_KEY).sort();
  assert.deepStrictEqual(Object.keys(eq).sort().concat(Object.keys(R.REPORT_EQUIPMENT.reduce((a, e) => ((a[e.key] = 1), a), {})).filter((k) => !(k in eq))).sort(), engineKeys);
  assert.deepStrictEqual(R.REPORT_EQUIPMENT.map((e) => e.key).sort(), engineKeys);
});
test('A5 흐름표가 RULE-CONTRACT(정정) 분기표와 일치', () => {
  assert.deepStrictEqual(M.stepsFor(newD()), ['workType', 'industry', 'contract', 'equip', 'result']); // 해당 설비 없음 → STEP5 생략
  assert.deepStrictEqual(M.stepsFor(newA()), ['workType', 'industry', 'contract', 'equip', 'equipDetail', 'result']);
  assert.deepStrictEqual(M.stepsFor(base('full')).slice(0, 4), ['workType', 'industry', 'contract', 'equip']);
  assert.deepStrictEqual(M.stepsFor(modify('no')), ['workType', 'industry', 'contract', 'equip', 'changeDetail', 'result']);
  assert.deepStrictEqual(M.stepsFor(partial()), ['workType', 'industry', 'contract', 'relocationDetail', 'm4Notice', 'result']); // 1→2→3→5→6
  assert.ok(!M.stepsFor(partial()).includes('equip') && !M.stepsFor(partial()).includes('equipDetail'));
  assert.deepStrictEqual(M.stepsFor(M.initialState()), ['workType']);
});

// ============================================================================================
// B. 정적 검사 — UI/Report가 판정 로직·Engine·data.js를 갖지 않는다
// ============================================================================================
const UI_FILES = ['report.js', 'ui-model.js', 'ui-copy.js', 'ui-render.js'];
test('B1 UI/Report 소스는 engine.js·data.js를 import하지 않고 evaluate/THRESHOLDS를 쓰지 않음', () => {
  for (const f of UI_FILES) {
    const code = stripComments(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    assert.ok(!/require\(\s*['"]\.\/(engine|data)(\.js)?['"]\s*\)/.test(code), f + ': engine/data import');
    assert.ok(!/\bevaluate\s*\(/.test(code), f + ': evaluate 호출');
    assert.ok(!/THRESHOLDS/.test(code), f + ': THRESHOLDS');
  }
  const app = stripComments(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'));
  assert.strictEqual((app.match(/deps\.evaluate\(/g) || []).length, 1, 'evaluate 호출은 컨트롤러에서 정확히 한 번');
});
test('B2 UI/Report 소스에 법정 임계값 비교(300/100/50/1000/150/60/3)가 없음', () => {
  for (const f of [...UI_FILES, 'app.js']) {
    const code = stripComments(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    assert.ok(!/[<>]=?\s*(300|100|50|1000|150|60)\b/.test(code), f + ': 임계값 비교');
    assert.ok(!/[<>]=?\s*3(\.0)?\b(?!\d)/.test(code), f + ': 3 비교');
    assert.ok(!/(300|1000|150)\s*[<>]/.test(code), f + ': 임계값 비교(역순)');
  }
});
test('B3 제6조(제출면제)·Pro/Free 분기가 없음', () => {
  for (const f of [...UI_FILES, 'app.js']) {
    const code = stripComments(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    assert.ok(!/제6조|면제|\bPro\b|\bFree\b|subscription|isPro|isFree/.test(code), f);
  }
});
test('B4 D-E 보정/우회 로직이 UI/Report에 없음(제43조제2항 필드를 UI가 기본값으로 채우지 않음)', () => {
  const s = newA();
  s.equip.selected.chem = true; // 제외 여부 질문 미응답/모름
  s.equip.details.chem.meets = 'yes';
  s.equip.details.chem.excluded = 'unknown';
  const input = M.buildEngineInput(s);
  assert.ok(!('excludedByDecree43_2' in input.equipment.chemicalEquipment), '모름은 키 생략(false로 바꾸지 않음)');
  const code = stripComments(fs.readFileSync(path.join(__dirname, 'report.js'), 'utf8'));
  assert.ok(!/excludedByDecree43_2/.test(code));
});
test('B5 dist/hazard-prevention-plan.html이 최신 소스와 일치', () => {
  assert.strictEqual(fs.readFileSync(BUILD.OUT, 'utf8'), BUILD.buildHtml(), 'node build.js 를 다시 실행하세요');
});

// ============================================================================================
// C. 입력 계약 (모름 / 해당 없음 / 빈 객체 금지 / 0 보존)
// ============================================================================================
test('C1 신설: "해당 설비 없음"은 {none:true}, 미응답/모름은 equipment 키 생략(빈 객체 금지)', () => {
  const none = base('new');
  none.equip.none = true;
  assert.deepStrictEqual(M.buildEngineInput(none).equipment, { none: true });
  const blank = base('new');
  assert.ok(!('equipment' in M.buildEngineInput(blank)));
  const unk = base('new');
  unk.equip.unknown = true;
  assert.ok(!('equipment' in M.buildEngineInput(unk)));
});
test('C2 어떤 상태 조합에서도 엔진 입력에 빈 객체가 생성되지 않음', () => {
  const states = [];
  for (const w of ['new', 'full', 'modify', 'partial']) {
    const s = base(w);
    states.push(s);
    const t = base(w);
    t.industry = { choice: 'unknown', name: '' };
    t.contract = UNK();
    states.push(t);
    const u = base(w);
    for (const id of M.EQUIP_IDS) {
      u.equip.selected[id] = true;
      u.chg.include[id] = 'yes';
    }
    u.m2.gross = UNK();
    u.m2.excluded = UNK();
    u.m3.relocated = UNK();
    states.push(u);
    const v = base(w);
    for (const id of M.EQUIP_IDS) v.chg.include[id] = 'unknown';
    states.push(v);
  }
  for (const s of states) assert.ok(!hasEmptyObject(M.buildEngineInput(s)), JSON.stringify(M.buildEngineInput(s)));
});
test('C3 "모름" 숫자는 키 생략, 빈 칸도 생략, 사용자가 입력한 0은 0으로 보존', () => {
  const s = base('new');
  s.contract = UNK();
  assert.ok(!('contractCapacityKw' in M.buildEngineInput(s)));
  s.contract = { value: '', unknown: false };
  assert.ok(!('contractCapacityKw' in M.buildEngineInput(s)));
  s.contract = num(0);
  assert.strictEqual(M.buildEngineInput(s).contractCapacityKw, 0);
  s.contract = { value: '1,250.5', unknown: false };
  assert.strictEqual(M.buildEngineInput(s).contractCapacityKw, 1250.5);
  const m = base('modify');
  m.m2.gross = num(150);
  m.m2.excluded = num(0);
  assert.strictEqual(M.buildEngineInput(m).module2.sameManufacturerSameModelExcludedKw, 0);
  m.m2.excluded = UNK();
  assert.ok(!('sameManufacturerSameModelExcludedKw' in M.buildEngineInput(m).module2));
});
test('C4 D-G: 업종 선택 변환(목록 선택=true, 목록 외=false, 모름=키 생략)', () => {
  const s = base('new');
  assert.strictEqual(M.buildEngineInput(s).businessType.withinListedIndustries, true);
  s.industry = { choice: 'not_listed', name: '' };
  assert.strictEqual(M.buildEngineInput(s).businessType.withinListedIndustries, false);
  s.industry = { choice: 'unknown', name: '' };
  assert.ok(!('businessType' in M.buildEngineInput(s)));
});
test('C5 D-A: 증설 STEP 4 — "포함 안 됨"은 변경 조건 false, "모름"은 키 생략, existingTarget 불변', () => {
  const s = modify('no');
  const ec = M.buildEngineInput(s).equipmentChange;
  assert.deepStrictEqual(ec, {
    meltingFurnace: { heatSourceTypeChanged: false },
    chemicalEquipment: { productionOrMaterialChangeReplacement: false, managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease: false },
    dryingEquipment: { heatSourceTypeChanged: false, dryingTargetChanged: false },
    gasWeldingAssembly: { mainPipeStructureChanged: false },
    ventilation: { equipmentChangeCausingVelocityDecreaseOrAirflowIncrease: false },
  });
  for (const v of Object.values(ec)) assert.ok(!('existingTarget' in v));
  const mix = modify('unknown');
  mix.chg.include.melt = 'no';
  assert.deepStrictEqual(M.buildEngineInput(mix).equipmentChange, { meltingFurnace: { heatSourceTypeChanged: false } });
  const allUnknown = modify('unknown');
  assert.ok(!('equipmentChange' in M.buildEngineInput(allUnknown)));
});
test('C6 D-A: 증설 "포함됨" 세부 답변 3상태(예=true/아니오=false/모름=생략, 전부 모름이면 키 생략)', () => {
  const s = modify('unknown');
  s.chg.include.melt = 'yes';
  s.chg.details.melt = { existing: 'yes', heat: 'no' };
  assert.deepStrictEqual(M.buildEngineInput(s).equipmentChange, { meltingFurnace: { existingTarget: true, heatSourceTypeChanged: false } });
  s.chg.details.melt = { existing: 'unknown', heat: 'unknown' };
  assert.ok(!('equipmentChange' in M.buildEngineInput(s)));
});
test('C7 D-B: 건조설비 목적 — 3종 외는 OTHER_NOT_IN_ARTICLE3, 모름은 생략 (설치·변경 경로 동일)', () => {
  const s = base('new');
  s.equip.selected.dry = true;
  s.equip.details.dry.power = num(60);
  s.equip.details.dry.fuel = UNK();
  s.equip.details.dry.purpose = 'other';
  assert.strictEqual(M.buildEngineInput(s).equipment.dryingEquipment.purpose, 'OTHER_NOT_IN_ARTICLE3');
  s.equip.details.dry.purpose = 'organic';
  assert.strictEqual(M.buildEngineInput(s).equipment.dryingEquipment.purpose, data.DRYING_PURPOSE.ORGANIC_COMPOUND);
  s.equip.details.dry.purpose = 'unknown';
  assert.ok(!('purpose' in M.buildEngineInput(s).equipment.dryingEquipment));
  const m = modify('unknown');
  m.chg.include.dry = 'yes';
  m.chg.details.dry = { existing: 'yes', heat: 'no', target: 'yes', newPurpose: 'other' };
  assert.strictEqual(M.buildEngineInput(m).equipmentChange.dryingEquipment.newPurpose, 'OTHER_NOT_IN_ARTICLE3');
  m.chg.details.dry.target = 'no'; // 대상물 변경 없음 → 새 목적은 보내지 않는다
  assert.ok(!('newPurpose' in M.buildEngineInput(m).equipmentChange.dryingEquipment));
});
test('C8 이설: 설비 입력은 상태에 남아 있어도 엔진 입력에 포함되지 않고 module3만 전달', () => {
  const s = partial();
  for (const id of M.EQUIP_IDS) {
    s.equip.selected[id] = true;
    s.chg.include[id] = 'no';
  }
  s.equip.none = false;
  const i = M.buildEngineInput(s);
  assert.deepStrictEqual(Object.keys(i).sort(), ['businessType', 'contractCapacityKw', 'module3', 'workType']);
  assert.strictEqual(i.module3.relocatedRatedCapacityKw, 150);
});
test('C9 작업 형태 변경 시 쓰이지 않는 입력이 제외됨(신설에는 equipmentChange/module2 없음)', () => {
  const s = newA();
  s.m2.gross = num(500);
  s.chg.include.melt = 'no';
  const i = M.buildEngineInput(s);
  assert.ok(!('module2' in i) && !('equipmentChange' in i) && !('module3' in i));
  const m = modify('no');
  m.equip.none = true;
  assert.ok(!('equipment' in M.buildEngineInput(m)));
});

// ============================================================================================
// D. 단계 검증 (D-F)
// ============================================================================================
test('D1 필수 선택 미선택 시 진행 불가(작업 형태/업종/설비)', () => {
  assert.ok(M.validateStep(M.initialState(), 'workType').length);
  const s = base('new');
  s.industry = { choice: undefined, name: '' };
  assert.ok(M.validateStep(s, 'industry').length);
  s.industry = { choice: 'listed', name: '' };
  assert.ok(M.validateStep(s, 'industry').length, '목록 선택 시 업종명 필요');
  s.industry = { choice: 'unknown', name: '' };
  assert.strictEqual(M.validateStep(s, 'industry').length, 0);
  assert.ok(M.validateStep(base('new'), 'equip').length);
  assert.ok(M.validateStep(base('modify'), 'equip').length === 5);
  assert.strictEqual(M.validateStep(modify('unknown'), 'equip').length, 0);
});
test('D2 숫자 입력: 형식 오류·음수 차단, 0/쉼표/모름은 허용, 법적 임계값 비교 없음', () => {
  const chk = (v, unknown) => {
    const s = base('new');
    s.contract = { value: v, unknown: !!unknown };
    return M.validateStep(s, 'contract');
  };
  assert.ok(chk('').length);
  assert.ok(chk('abc').length);
  assert.ok(chk('-5').length);
  assert.ok(/음수/.test(chk('-5')[0].message));
  assert.ok(chk('1e3').length);
  assert.strictEqual(chk('0').length, 0);
  assert.strictEqual(chk('1,250').length, 0);
  assert.strictEqual(chk('', true).length, 0);
  assert.strictEqual(chk('1').length, 0); // 어떤 값이든 임계값 때문에 막지 않는다
  assert.strictEqual(chk('99999').length, 0);
});
test('D3 설비 세부 단계 필수 항목(신설) / 변경 세부(증설) / 이설 정격용량', () => {
  const s = base('new');
  s.equip.selected.dry = true;
  assert.strictEqual(M.validateStep(s, 'equipDetail').length, 3);
  s.equip.details.dry = { fuel: UNK(), power: num(60), purpose: 'other' };
  assert.strictEqual(M.validateStep(s, 'equipDetail').length, 0);
  const m = base('modify');
  assert.strictEqual(M.validateStep(m, 'changeDetail').length, 2);
  m.m2.gross = num(1);
  m.m2.excluded = UNK();
  m.chg.include.dry = 'yes';
  assert.strictEqual(M.validateStep(m, 'changeDetail').length, 3); // existing, heat, target
  m.chg.details.dry = { existing: 'yes', heat: 'no', target: 'yes', newPurpose: undefined };
  assert.strictEqual(M.validateStep(m, 'changeDetail').length, 1); // newPurpose
  assert.strictEqual(M.validateStep(base('partial'), 'relocationDetail').length, 1);
  assert.strictEqual(M.validateStep(partial(), 'relocationDetail').length, 0);
});

// ============================================================================================
// E. D-B 회귀 테스트 (Engine 로직은 수정하지 않는다)
// ============================================================================================
function dryInstall(purpose, extra) {
  const dry = Object.assign({ present: true, ratedPowerKw: 60 }, purpose === undefined ? {} : { purpose }, extra || {});
  const s = engine.evaluate({ workType: 'NEW', businessType: { withinListedIndustries: true }, contractCapacityKw: 400, equipment: { dryingEquipment: dry } });
  return { eq: s.moduleResults.module4.paths.installation.equipmentResults.dryingEquipment, m4: s.moduleResults.module4.status };
}
test('E1 신설 건조설비 + ORGANIC_COMPOUND → 해당 설비 TARGET', () => {
  const r = dryInstall('ORGANIC_COMPOUND');
  assert.strictEqual(r.eq.three, true);
  assert.strictEqual(r.m4, 'TARGET');
});
test('E2 신설 건조설비 + OTHER_NOT_IN_ARTICLE3 → 해당 설비 NOT_TARGET(three:false)', () => {
  const r = dryInstall('OTHER_NOT_IN_ARTICLE3');
  assert.strictEqual(r.eq.three, false);
  assert.strictEqual(r.m4, 'NOT_TARGET');
});
test('E3 신설 건조설비 + 목적 키 생략 → 해당 설비 UNKNOWN(three 키 없음)', () => {
  const r = dryInstall(undefined);
  assert.ok(!('three' in r.eq));
  assert.strictEqual(r.m4, 'UNKNOWN');
});
function dryChange(newPurpose) {
  const dry = { existingTarget: true, heatSourceTypeChanged: false, dryingTargetChanged: true }; // 열원 변경 경로를 명시적으로 배제해 목적 경로만 검증
  if (newPurpose !== undefined) dry.newPurpose = newPurpose;
  const s = engine.evaluate({
    workType: 'MODIFICATION', businessType: { withinListedIndustries: true }, contractCapacityKw: 400,
    module2: { grossRatedCapacityIncreaseKw: 10 }, equipmentChange: { dryingEquipment: dry },
  });
  return s.moduleResults.module4.paths.modification.equipmentResults.dryingEquipment;
}
test('E4 증설/교체/변경 경로의 D-B 계약 유지(newPurpose: 3종 TARGET / 3종 외 NOT_TARGET / 생략 UNKNOWN)', () => {
  assert.strictEqual(dryChange('ORGANIC_COMPOUND').three, true);
  assert.strictEqual(dryChange('OTHER_NOT_IN_ARTICLE3').three, false);
  assert.ok(!('three' in dryChange(undefined)));
});

// ============================================================================================
// F. Engine 연동 — 사용자 여정 로직(브라우저 없이 컨트롤러 수준)
// ============================================================================================
test('F1 Journey A/B 로직: 신설 용해로 대상 / 해당 설비 없음 / 모름 (equipment:{} 함정 없음)', () => {
  assert.strictEqual(run(newA()).snapshot.moduleResults.module4.status, 'TARGET');
  const none = base('new');
  none.equip.none = true;
  assert.strictEqual(run(none).snapshot.moduleResults.module4.status, 'NOT_TARGET');
  const unk = base('new');
  unk.equip.unknown = true;
  assert.strictEqual(run(unk).snapshot.moduleResults.module4.status, 'UNKNOWN');
  const blank = base('new');
  assert.strictEqual(run(blank).snapshot.moduleResults.module4.status, 'UNKNOWN');
});
test('F2 Journey C 로직: 증설 "포함 안 됨"+"모름" 혼합 → M4 UNKNOWN, 5종 모두 "포함 안 됨" → NOT_TARGET', () => {
  const mix = modify('unknown');
  mix.chg.include.melt = 'no';
  mix.chg.include.chem = 'no';
  assert.strictEqual(run(mix).snapshot.moduleResults.module4.status, 'UNKNOWN');
  assert.strictEqual(run(modify('no')).snapshot.moduleResults.module4.status, 'NOT_TARGET');
});
const COPY_HEAD = { NOT_TARGET: '입력하신 내용 기준으로는 제출 대상에 해당하지 않습니다.' };
test('F3 Journey D 로직: 부분 이설은 M4가 항상 UNKNOWN, 최종 NOT_TARGET이 나올 수 없음', () => {
  for (const cap of ['50', '150', '0']) {
    for (const choice of ['listed', 'not_listed', 'unknown']) {
      const s = base('partial');
      s.industry = { choice, name: choice === 'listed' ? 'x' : '' };
      s.m3.relocated = num(cap);
      const r = run(s);
      assert.strictEqual(r.snapshot.moduleResults.module4.status, 'UNKNOWN');
      assert.notStrictEqual(r.snapshot.finalStatus, 'NOT_TARGET');
      assert.strictEqual(r.snapshot.determinationCompleteness, 'INCOMPLETE');
      assert.ok(r.userView.confirmItems.some((i) => i.kind === 'UNRESOLVED'));
      assert.notStrictEqual(r.userView.headline.text, COPY_HEAD.NOT_TARGET);
    }
  }
});

// ============================================================================================
// G. Report 계약
// ============================================================================================
test('G1 헤드라인 4종이 (finalStatus, completeness)에 1:1 매핑되고 부제는 TARGET+INCOMPLETE에만', () => {
  const cases = [
    [newA, 'TARGET', 'COMPLETE', '유해·위험방지계획서 제출 대상에 해당합니다.', null],
    [newB, 'TARGET', 'INCOMPLETE', '유해·위험방지계획서 제출 대상에 해당합니다.', '일부 확인이 필요한 항목이 있습니다.'],
    [newC, 'UNKNOWN', 'INCOMPLETE', '대상 여부 확인이 필요합니다.', null],
    [newD, 'NOT_TARGET', 'COMPLETE', '입력하신 내용 기준으로는 제출 대상에 해당하지 않습니다.', null],
  ];
  for (const [f, fin, comp, text, sub] of cases) {
    const r = run(f());
    assert.strictEqual(r.snapshot.finalStatus, fin, f.name);
    assert.strictEqual(r.snapshot.determinationCompleteness, comp, f.name);
    assert.strictEqual(r.userView.headline.text, text);
    assert.strictEqual(r.userView.headline.subtitle, sub);
    assert.ok(r.userView.headline.ok);
  }
});
test('G2 승인 4종 밖의 조합은 임의 문구 없이 오류 상태', () => {
  const snap = JSON.parse(JSON.stringify(run(newA()).snapshot));
  snap.finalStatus = 'NOT_TARGET';
  snap.determinationCompleteness = 'INCOMPLETE';
  const v = R.toUserView(R.buildReportModel(snap, LAW_BASIS));
  assert.strictEqual(v.headline.ok, false);
  assert.strictEqual(v.headline.tone, 'error');
});
test('G3 Snapshot을 변경하지 않고(동결 상태에서 동작) Engine을 호출하지 않음', () => {
  for (const f of [newA, newB, newC, newD, partial, () => modify('no')]) {
    const snap = deepFreeze(JSON.parse(JSON.stringify(run(f()).snapshot)));
    const before = JSON.stringify(snap);
    const model = R.buildReportModel(snap, LAW_BASIS, { currentRuleVersion: engine.RULE_VERSION });
    R.toUserView(model);
    assert.strictEqual(JSON.stringify(snap), before);
  }
});
test('G4 여러 모듈이 TARGET이면 모두 표시하고, M4 대상 설비는 equipmentResults(three:true)에서만 도출', () => {
  const v = run(newA()).userView;
  assert.deepStrictEqual(v.targetModules.map((t) => t.label), ['사업장 기준 (업종·계약용량)', '대상설비 5종']);
  assert.deepStrictEqual(v.targetModules[1].equipment, ['용해로']);
  // reasons와 equipmentResults를 일부러 어긋나게 만들어 역할 분리를 검증
  const snap = JSON.parse(JSON.stringify(run(newA()).snapshot));
  snap.moduleResults.module4.paths.installation.equipmentResults.meltingFurnace.three = false;
  const v2 = R.toUserView(R.buildReportModel(snap, LAW_BASIS));
  assert.deepStrictEqual(v2.targetModules.find((t) => t.label === '대상설비 5종').equipment, []);
  snap.reasons = ['M1'];
  snap.moduleResults.module4.paths.installation.equipmentResults.meltingFurnace.three = true;
  const v3 = R.toUserView(R.buildReportModel(snap, LAW_BASIS));
  assert.ok(!v3.targetModules.some((t) => t.label === '대상설비 5종'), 'reasons에 없는 M4는 설비 근거로 나오지 않음');
});
test('G5 N/A 모듈·경로의 status는 결과로 표시되지 않음(증설)', () => {
  const v = run(modify('no')).userView;
  const m3 = v.modules.find((m) => m.label.startsWith('일부 설비 이전'));
  assert.strictEqual(m3.display, 'NOT_APPLICABLE');
  assert.ok(!('resultLabel' in m3) && !('tone' in m3));
  assert.strictEqual(m3.message, '이번 작업 유형에는 적용되지 않음');
  const m1 = v.modules[0];
  assert.strictEqual(m1.display, 'PRECONDITION');
  assert.ok(/전제조건/.test(m1.message));
  assert.deepStrictEqual(v.m4.inactivePaths, ['설치·전체 이전 기준']);
  assert.deepStrictEqual(v.m4.paths.map((p) => p.label), ['주요 구조부분 변경 기준']);
});
test('G6 three:true=조건 충족 / three:false=조건 미충족 / 키 없음=확인 필요 (해당 없음으로 재해석 금지)', () => {
  const s = base('new');
  s.equip.selected.melt = true;
  s.equip.selected.dry = true;
  s.equip.details.melt.capacity = num(5);
  s.equip.details.dry = { fuel: UNK(), power: UNK(), purpose: 'unknown' };
  const v = run(s).userView;
  const rows = Object.fromEntries(v.m4.paths[0].rows.map((r) => [r.label, r.stateLabel]));
  assert.strictEqual(rows['용해로'], '조건 충족');
  assert.strictEqual(rows['화학설비'], '조건 미충족'); // 선택하지 않은 설비(Engine three:false)
  assert.strictEqual(rows['건조설비'], '확인 필요'); // three 키 없음
  assert.ok(!JSON.stringify(v).includes('해당 없음'));
});
test('G7 "해당 설비 없음" 확정 시 설비 행 없이 경로 수준 결과만(모두 확인 필요로 오인시키지 않음)', () => {
  const v = run(newD()).userView;
  assert.strictEqual(v.m4.paths[0].rows.length, 0);
  assert.strictEqual(v.m4.paths[0].resultLabel, '대상 아님');
  const u = run(newB()).userView; // 설비 미확인
  assert.strictEqual(u.m4.paths[0].rows.length, 5);
  assert.ok(u.m4.paths[0].rows.every((r) => r.stateLabel === '확인 필요'));
});
test('G8 이설: 고정 안내(승인 문구 그대로), 설비 행 없음, 입력 보완 링크 없는 미확정 항목', () => {
  const v = run(partial()).userView;
  assert.deepStrictEqual(v.m4.unresolvedLines, [
    '일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.',
    "따라서 이 항목은 '대상 아님'으로 처리하지 않고 '확인 필요'로 남깁니다. 이 항목이 확인되지 않아 전체 판단이 완전하지 않습니다.",
    '이설에 해당하는 경우 관련 기준을 별도로 확인해 주세요.',
  ]);
  assert.strictEqual(v.m4.paths.length, 0);
  assert.strictEqual(v.m4.resultLabel, '확인 필요');
  const item = v.confirmItems.find((i) => i.kind === 'UNRESOLVED');
  assert.ok(item);
  const html = RENDER.renderResult(v);
  assert.ok(html.includes('일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.'));
  assert.ok(!/data-action="goto-target" data-target="equipment"/.test(html), '이설 미확정 항목에는 입력 수정 링크 없음');
  assert.deepStrictEqual(COPY.m4NoticeLines.slice(), v.m4.unresolvedLines); // 이설 안내 화면과 결과 화면 문구 동일
});
test('G9 UserView는 허용 목록만 포함(provenance 키 없음)', () => {
  const forbidden = ['reason', 'reasonRaw', 'note', 'openItems', 'ruleContractRef', 'ruleId', 'ruleVersion', 'engineVersion', 'snapshotId', 'equipmentResults',
    'legalBasis', 'inputsUsed', 'unresolvedLegalIssue', 'applicability', 'finalStatus', 'determinationCompleteness', 'moduleResults', 'status', 'unresolved', 'unresolvedRaw'];
  for (const f of [newA, newB, newC, newD, partial, () => modify('no')]) {
    const keys = allKeys(run(f()).userView);
    for (const k of forbidden) assert.ok(!keys.has(k), 'UserView에 ' + k);
  }
  const bk = new Set(['missing', 'statute', 'text', 'effectiveDate', 'noticeNo', 'reliabilityLabel', 'message']);
  const v = run(newA()).userView;
  for (const b of [...v.m4.basis, ...v.modules.flatMap((m) => m.basis)]) for (const k of Object.keys(b)) assert.ok(bk.has(k), '근거 필드 ' + k);
});
test('G10 ReportModel은 개발자용 provenance를 보존한다(note/openItems/ruleContractRef/reason)', () => {
  const m = run(newA()).reportModel;
  const keys = allKeys(m);
  for (const k of ['ruleId', 'ruleContractRef', 'reasonRaw', 'openItems', 'note', 'ruleVersion']) assert.ok(keys.has(k), k);
  const n3 = m.m4.basis.find((b) => b.ruleId === 'NOTICE_3');
  assert.ok(n3 && n3.openItems !== undefined);
});
test('G11 근거 조회 실패 시 내부 ID 없이 "근거 데이터 없음"', () => {
  const snap = run(newA()).snapshot;
  const v = R.toUserView(R.buildReportModel(snap, {}));
  const all = [...v.m4.basis, ...v.modules.flatMap((m) => m.basis)];
  assert.ok(all.length && all.every((b) => b.missing && b.message === '근거 데이터 없음'));
  assert.ok(!/NOTICE_|DECREE_/.test(JSON.stringify(v)));
});
test('G12 ruleVersion 불일치는 고정 배너만(내부 버전 문자열 미노출), 렌더링은 계속', () => {
  const snap = run(newA()).snapshot;
  const same = R.toUserView(R.buildReportModel(snap, LAW_BASIS, { currentRuleVersion: snap.ruleVersion }));
  assert.strictEqual(same.footer.versionMismatch, false);
  const diff = R.toUserView(R.buildReportModel(snap, LAW_BASIS, { currentRuleVersion: 'OTHER' }));
  assert.strictEqual(diff.footer.versionMismatch, true);
  assert.strictEqual(diff.footer.versionBanner, '이 결과는 현재와 다른 판정 기준으로 만들어졌습니다. 최신 기준으로 다시 확인해 주세요.');
  assert.ok(!JSON.stringify(diff).includes(snap.ruleVersion));
  const html = RENDER.renderResult(diff);
  assert.ok(html.includes(diff.footer.versionBanner) && html.includes(diff.headline.text));
  assert.ok(!html.includes(snap.ruleVersion));
});
test('G13 createdAt은 Snapshot에 있을 때만 표시(Report가 만들어내지 않음)', () => {
  const snap = JSON.parse(JSON.stringify(run(newA()).snapshot));
  assert.ok(R.toUserView(R.buildReportModel(snap, LAW_BASIS)).footer.createdAt);
  delete snap.createdAt;
  assert.strictEqual(R.toUserView(R.buildReportModel(snap, LAW_BASIS)).footer.createdAt, null);
});
test('G14 확인 필요 항목 문구는 고정 문구/구조 기반이고 reason을 사용하지 않음', () => {
  const v = run(newB()).userView;
  assert.ok(v.confirmItems.length >= 1);
  const rawReasons = JSON.stringify(run(newB()).snapshot.moduleResults.module4.reason);
  for (const i of v.confirmItems) assert.ok(!rawReasons.includes(i.text));
  assert.ok(v.confirmItems.some((i) => i.target === 'equipment'));
});

// ============================================================================================
// H. 화면 문자열 검사(DOM 문자열 — 내부 용어 노출 금지)
// ============================================================================================
const { findViolations } = require('./forbidden-terms.js');
function scanHtml(html, label) {
  const v = findViolations(html);
  assert.ok(v.length === 0, label + ': ' + v.join(', '));
}
test('H1 모든 결과 화면 시나리오의 HTML에 내부 용어가 없음', () => {
  const scen = [newA, newB, newC, newD, partial, () => modify('no'), () => modify('unknown'), () => modify('yes')];
  const full = base('full');
  full.equip.selected.chem = true;
  full.equip.selected.vent = true;
  full.equip.details.chem = { meets: 'yes', excluded: 'unknown' };
  full.equip.details.vent = { category: 'cat1', airVolume: num(70) };
  scen.push(() => full);
  scen.forEach((f, i) => scanHtml(RENDER.renderResult(run(f()).userView), '결과#' + i));
});
test('H2 모든 입력 단계 화면의 HTML에 내부 용어가 없음', () => {
  const ctx = { industryList: engine.INDUSTRY_LIST };
  const wizardStates = [];
  const mk = (s, step, errors) => {
    s.step = step;
    s.errors = errors || [];
    wizardStates.push(JSON.parse(JSON.stringify(s)));
  };
  const s0 = M.initialState();
  mk(s0, 'start');
  mk(s0, 'workType');
  for (const w of ['new', 'full', 'modify', 'partial']) {
    const s = base(w);
    for (const id of M.EQUIP_IDS) {
      s.equip.selected[id] = true;
      s.chg.include[id] = 'yes';
    }
    s.chg.details.dry.target = 'yes';
    for (const step of M.stepsFor(s).filter((x) => x !== 'result')) {
      mk(s, step);
      mk(s, step, M.validateStep(M.initialState().workType ? s : s, step));
    }
    const blank = M.initialState();
    blank.workType = w;
    for (const step of M.stepsFor(blank).filter((x) => x !== 'result')) mk(blank, step, M.validateStep(blank, step));
  }
  assert.ok(wizardStates.length > 20);
  wizardStates.forEach((s, i) => scanHtml(RENDER.renderWizard(s, ctx), '입력#' + i + '(' + s.step + ')'));
});
test('H3 렌더 HTML 이스케이프(업종명에 특수문자가 있어도 태그가 생성되지 않음)', () => {
  const s = base('new');
  s.step = 'industry';
  const html = RENDER.renderWizard(s, { industryList: ['<img src=x onerror=alert(1)>'] });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
test('H4 §12 확정 문구가 화면에 그대로 사용됨(시작/작업 형태/업종/설비/이설/결과)', () => {
  const html = (s, step) => RENDER.renderWizard(Object.assign(s, { step }), { industryList: engine.INDUSTRY_LIST });
  const a = html(M.initialState(), 'start');
  for (const t of ['유해·위험방지계획서 제출 대상 확인', '몇 가지 질문에 답하면 제출 대상 여부를 확인해 드립니다.', '이 도구는 제조업 등 사업장만 다루며 건설공사 규모기준은 다루지 않습니다.', '시작하기']) assert.ok(a.includes(t), t);
  const w = html(M.initialState(), 'workType');
  for (const t of ['이번 작업은 어떤 형태인가요?', '신설', '전체 이전', '일부 설비 이전(이설)', '증설·교체·개조(주요 구조부분 변경)']) assert.ok(w.includes(t), t);
  const i = html(base('new'), 'industry');
  for (const t of ['사업장의 업종이 대상 업종 13개 중 하나인가요?', '13개 목록에 없음', '아직 확인 못 함']) assert.ok(i.includes(t), t);
  const e = html(base('new'), 'equip');
  for (const t of ['이번에 설치하거나 이전하는 설비 중 해당하는 것을 모두 선택해 주세요.', '해당 설비 없음', '용해로', '화학설비', '건조설비', '가스집합용접장치', '유해물질 밀폐·환기·배기설비']) assert.ok(e.includes(t), t);
  const c = html(base('modify'), 'equip');
  for (const t of ['이번 작업에 아래 설비가 포함되나요?', '포함됨', '포함 안 됨']) assert.ok(c.includes(t), t);
  const m4 = html(partial(), 'm4Notice');
  for (const l of COPY.m4NoticeLines) assert.ok(m4.includes(l.replace(/'/g, '&#39;')), l);
  const d = base('new');
  d.equip.selected.dry = true;
  assert.ok(html(d, 'equipDetail').includes('위 세 가지에 해당하지 않음'));
});
test('H5 입력 화면에 단계 번호(STEP n / 6)와 이설 흐름의 STEP 5→결과', () => {
  const s = partial();
  assert.ok(RENDER.renderWizard(Object.assign(s, { step: 'relocationDetail' }), {}).includes('STEP 5 / 6'));
  assert.ok(RENDER.renderWizard(Object.assign(s, { step: 'contract' }), {}).includes('STEP 3 / 6'));
  assert.ok(RENDER.renderResult(run(newA()).userView).includes('STEP 6 / 6'));
  assert.ok(RENDER.renderWizard(Object.assign(partial(), { step: 'm4Notice' }), {}).includes('결과 보기'));
});
test('H6 접근성 마크업: fieldset/legend, label 연결, 오류 요약 role=alert', () => {
  const s = M.initialState();
  s.step = 'workType';
  s.errors = M.validateStep(s, 'workType');
  const html = RENDER.renderWizard(s, {});
  assert.ok(/<fieldset[^>]*id="g-workType"[^>]*><legend>/.test(html));
  assert.ok(/role="alert"/.test(html));
  const c = base('new');
  c.step = 'contract';
  const ch = RENDER.renderWizard(c, {});
  assert.ok(/<label class="q" for="f-contract-input">/.test(ch) && /inputmode="decimal"/.test(ch));
});

// ---- 결과 -----------------------------------------------------------------------------------
const total = pass + fail;
if (fail) {
  console.log('\n실패 목록:');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
console.log('\nUI/Report: 총 ' + total + '개 중 통과 ' + pass + ', 실패 ' + fail);
console.log(fail ? '\n실패 있음' : '\n전체 통과');
process.exit(fail ? 1 : 0);
