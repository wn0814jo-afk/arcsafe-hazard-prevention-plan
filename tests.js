'use strict';

const assert = require('assert');
const engine = require('./engine.js');
const { WORK_TYPE } = require('./data.js');

const { evaluate, STATUS, APPLICABILITY } = engine;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
  }
}

function baseInput(overrides) {
  return Object.assign(
    {
      workType: WORK_TYPE.NEW,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 500,
    },
    overrides
  );
}

// ===========================================================================
// A. 모듈 1
// ===========================================================================

test('A1: 대상업종 + 300kW → TARGET', () => {
  const snap = evaluate(baseInput({ contractCapacityKw: 300 }));
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET);
});

test('A2: 대상업종 + 299kW → NOT_TARGET', () => {
  const snap = evaluate(baseInput({ contractCapacityKw: 299 }));
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
});

test('A3: 비대상업종 + 500kW → NOT_TARGET', () => {
  const snap = evaluate(
    baseInput({ businessType: { withinListedIndustries: false }, contractCapacityKw: 500 })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
});

test('A4: 업종 미입력 → UNKNOWN', () => {
  const snap = evaluate(baseInput({ businessType: undefined, contractCapacityKw: 500 }));
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.UNKNOWN);
});

test('A5: 계약용량 미입력 → UNKNOWN', () => {
  const snap = evaluate(baseInput({ contractCapacityKw: undefined }));
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.UNKNOWN);
});

test('A6: 비대상업종(확정) + 계약용량 미입력 → NOT_TARGET (AND-false 우선, 3치논리)', () => {
  const snap = evaluate(
    baseInput({ businessType: { withinListedIndustries: false }, contractCapacityKw: undefined })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
});

// ===========================================================================
// B. 모듈 2 (작업형태: 증설·교체·개조)
// ===========================================================================

function module2Input(overrides) {
  return baseInput(
    Object.assign(
      {
        workType: WORK_TYPE.MODIFICATION,
        module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 0 },
      },
      overrides
    )
  );
}

test('B1: 대상업종+300kW + 증가 100kW → TARGET', () => {
  const snap = evaluate(
    module2Input({ contractCapacityKw: 300, module2: { grossRatedCapacityIncreaseKw: 100 } })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.TARGET);
});

test('B2: 대상업종+300kW + 증가 99kW → NOT_TARGET', () => {
  const snap = evaluate(
    module2Input({ contractCapacityKw: 300, module2: { grossRatedCapacityIncreaseKw: 99 } })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.NOT_TARGET);
});

test('B3: 모듈1 선행조건 미충족(업종 밖) + 증가 150kW → NOT_TARGET', () => {
  const snap = evaluate(
    module2Input({ businessType: { withinListedIndustries: false }, contractCapacityKw: 500 })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.NOT_TARGET);
});

test('B4: 동일 제조사·동일 모델 제외 적용 전 = TARGET (총증가 150kW)', () => {
  const snap = evaluate(
    module2Input({
      contractCapacityKw: 400,
      module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 0 },
    })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module2.inputsUsed.netRatedCapacityIncreaseKw, 150);
});

test('B5: 동일 제조사·동일 모델 제외 적용 후 = NOT_TARGET (150-60=90 < 100)', () => {
  const snap = evaluate(
    module2Input({
      contractCapacityKw: 400,
      module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 60 },
    })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module2.inputsUsed.netRatedCapacityIncreaseKw, 90);
});

test('B6: 필수 입력(정격용량 증가분) 누락 → UNKNOWN (모듈1은 충족)', () => {
  const snap = evaluate(
    module2Input({ contractCapacityKw: 400, module2: { grossRatedCapacityIncreaseKw: undefined } })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.UNKNOWN);
});

test('B7: 모듈2 applicability는 작업형태=증설일 때만 APPLICABLE', () => {
  const mod = evaluate(module2Input({})).moduleResults.module2;
  assert.strictEqual(mod.applicability, APPLICABILITY.APPLICABLE);
  const newWorkSnap = evaluate(baseInput({ workType: WORK_TYPE.NEW }));
  assert.strictEqual(
    newWorkSnap.moduleResults.module2.applicability,
    APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE
  );
});

// ===========================================================================
// C. 모듈 3 (작업형태: 이설) — 세션4 3차 재감사로 추가된 선행조건 검증
// ===========================================================================

function module3Input(overrides) {
  return baseInput(
    Object.assign(
      { workType: WORK_TYPE.PARTIAL_RELOCATION, module3: { relocatedRatedCapacityKw: 120 } },
      overrides
    )
  );
}

test('C1: 대상업종+300kW + 이설 100kW → TARGET', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 300, module3: { relocatedRatedCapacityKw: 100 } })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.TARGET);
});

test('C2: 대상업종+300kW + 이설 99kW → NOT_TARGET', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 300, module3: { relocatedRatedCapacityKw: 99 } })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.NOT_TARGET);
});

test('C3: 비대상업종 + 500kW + 이설 150kW → NOT_TARGET (핵심 검증 — 모듈1 전제조건이 모듈3에 적용됨)', () => {
  const snap = evaluate(
    module3Input({
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 500,
      module3: { relocatedRatedCapacityKw: 150 },
    })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.NOT_TARGET);
});

test('C4: 대상업종이지만 계약용량 미달(200kW) + 이설 150kW → NOT_TARGET', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 200, module3: { relocatedRatedCapacityKw: 150 } })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.NOT_TARGET);
});

test('C5: 필수 입력(이설 정격용량) 누락 → UNKNOWN', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 400, module3: { relocatedRatedCapacityKw: undefined } })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.UNKNOWN);
});

test('C6: 모듈2의 동일모델 제외 예외는 모듈3에 전파되지 않음(모듈3 입력 자체에 그 필드가 없음)', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 400, module3: { relocatedRatedCapacityKw: 100 } })
  );
  assert.strictEqual(snap.moduleResults.module3.inputsUsed.sameManufacturerSameModelExcludedKw, undefined);
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.TARGET);
});

// ===========================================================================
// D. 모듈 4 — 5종 설비 경계값
// ===========================================================================

function equipmentInput(equipment) {
  return baseInput({ equipment });
}

test('D1: 용해로 3톤(경계값) → TARGET', () => {
  const snap = evaluate(equipmentInput({ meltingFurnace: { present: true, capacityTon: 3 } }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D2: 용해로 2.9톤(경계값 미만) → NOT_TARGET', () => {
  const snap = evaluate(equipmentInput({ meltingFurnace: { present: true, capacityTon: 2.9 } }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D3: 건조설비 50kg/h + 유기화합물건조(둘 다 경계값/해당) → TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      dryingEquipment: { present: true, fuelConsumptionKgPerHour: 50, purpose: 'ORGANIC_COMPOUND' },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D4: 건조설비 49kg/h + 49kW(둘 다 미달) → NOT_TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      dryingEquipment: {
        present: true,
        fuelConsumptionKgPerHour: 49,
        ratedPowerKw: 49,
        purpose: 'ORGANIC_COMPOUND',
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D5: 건조설비 50kW(정격소비전력만 경계값 충족) + 가연성분말분진 → TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      dryingEquipment: { present: true, ratedPowerKw: 50, purpose: 'COMBUSTIBLE_DUST' },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D6: 가스집합용접장치 1000kg + 고정식 → TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      gasWeldingAssembly: { present: true, flammableGasQuantityKg: 1000, isFixed: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D7: 가스집합용접장치 999kg + 고정식 → NOT_TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      gasWeldingAssembly: { present: true, flammableGasQuantityKg: 999, isFixed: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D8: 가스집합용접장치 1200kg + 고정식 아님 → NOT_TARGET (AND 조건)', () => {
  const snap = evaluate(
    equipmentInput({
      gasWeldingAssembly: { present: true, flammableGasQuantityKg: 1200, isFixed: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D9: 환기설비 별표1제7호 물질 60㎥/분(경계값) → TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      ventilation: {
        present: true,
        substanceCategory: 'NOTICE_TABLE1_ITEM7',
        exhaustAirVolumeM3PerMin: 60,
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D10: 환기설비 별표1제7호 물질 59㎥/분 → NOT_TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      ventilation: {
        present: true,
        substanceCategory: 'NOTICE_TABLE1_ITEM7',
        exhaustAirVolumeM3PerMin: 59,
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D11: 환기설비 허가/관리대상 물질 150㎥/분(경계값) → TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      ventilation: {
        present: true,
        substanceCategory: 'PERMIT_OR_MANAGED_OR_DUST_TABLE16',
        exhaustAirVolumeM3PerMin: 150,
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('D12: 환기설비 허가/관리대상 물질 149㎥/분 → NOT_TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      ventilation: {
        present: true,
        substanceCategory: 'PERMIT_OR_MANAGED_OR_DUST_TABLE16',
        exhaustAirVolumeM3PerMin: 149,
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D13: 대상설비 미입력(equipment undefined) → UNKNOWN', () => {
  const snap = evaluate(baseInput({}));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
});

test('D14: 대상설비 "없음" 명시 → NOT_TARGET (UNKNOWN 아님)', () => {
  const snap = evaluate(equipmentInput({ none: true }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D15: 화학설비 — 별표9 기준 미확인(boolean 미입력) → UNKNOWN (수치 추측 금지)', () => {
  const snap = evaluate(equipmentInput({ chemicalEquipment: { present: true } }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
});

test('D16: 화학설비 — 시행령 제43조제2항 제외설비로 확인 → NOT_TARGET', () => {
  const snap = evaluate(
    equipmentInput({
      chemicalEquipment: { present: true, excludedByDecree43_2: true, meetsHazardousSubstanceThreshold: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('D17: 모듈4는 모듈1(업종/계약용량)과 무관 — 업종 미해당이어도 설비 조건이면 TARGET', () => {
  const snap = evaluate(
    baseInput({
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 100,
      equipment: { gasWeldingAssembly: { present: true, flammableGasQuantityKg: 1200, isFixed: true } },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
});

// ===========================================================================
// E. 종합 4개 시나리오 (검토자 승인 데스크체크 회귀 고정)
// ===========================================================================

test('E1: 신설 + 13업종 + 500kW + 건조설비 60kW → M1 TARGET, M4 TARGET, final TARGET/COMPLETE', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.NEW,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 500,
      equipment: {
        dryingEquipment: { present: true, ratedPowerKw: 60, purpose: 'ORGANIC_COMPOUND' },
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module1.applicability, APPLICABILITY.APPLICABLE);
  assert.strictEqual(snap.moduleResults.module2.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module3.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'COMPLETE');
  assert.deepStrictEqual([...snap.reasons].sort(), ['M1', 'M4']);
});

test('E2: 증설 + 대상업종 + 400kW + 증가 150kW → M2 TARGET, final TARGET (M4는 equipmentChange 미입력이라 UNKNOWN → INCOMPLETE, 세션5 재설계 반영)', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.MODIFICATION,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 400,
      module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 0 },
      // equipment(설치용 필드)는 MODIFICATION에서 더 이상 쓰이지 않는다 — 의도적으로 비움.
    })
  );
  assert.strictEqual(snap.moduleResults.module1.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET); // 내부값(선행조건)은 계산됨
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module3.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  // M4: workType=MODIFICATION인데 equipmentChange 자체가 없음 → UNKNOWN(세션5 재설계,
  // "변경 대상 없음(false)"과 "입력 자체가 없음(UNKNOWN)"을 구분)
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET); // M2가 TARGET이라 여전히 TARGET
  assert.strictEqual(snap.determinationCompleteness, 'INCOMPLETE'); // M4가 UNKNOWN이라 INCOMPLETE
  assert.deepStrictEqual([...snap.reasons], ['M2']);
});

test('E3: 이설 + 대상업종 + 350kW + 이설 120kW → M3 TARGET, final TARGET (M4는 OPEN-ISSUE-M4-RELOCATION-PARTIAL로 항상 UNKNOWN → INCOMPLETE, 세션5 재설계 반영)', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.PARTIAL_RELOCATION,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 350,
      module3: { relocatedRatedCapacityKw: 120 },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.TARGET);
  // M4: 이설(부분이전)의 법적 판정기준이 RULE-CONTRACT.md에 미확정
  // (OPEN-ISSUE-M4-RELOCATION-PARTIAL) — 추측하지 않고 항상 UNKNOWN.
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.strictEqual(snap.moduleResults.module4.unresolvedLegalIssue, 'OPEN-ISSUE-M4-RELOCATION-PARTIAL');
  assert.strictEqual(snap.finalStatus, STATUS.TARGET); // M3가 TARGET이라 여전히 TARGET
  assert.strictEqual(snap.determinationCompleteness, 'INCOMPLETE'); // M4가 UNKNOWN이라 INCOMPLETE
  assert.deepStrictEqual([...snap.reasons], ['M3']);
});

test('E4: 신설 + 비대상업종 + 200kW + 가스집합용접장치 1200kg → M1 NOT_TARGET, M4 TARGET, final TARGET/COMPLETE (fail-closed 핵심 검증)', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.NEW,
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 200,
      equipment: { gasWeldingAssembly: { present: true, flammableGasQuantityKg: 1200, isFixed: true } },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'COMPLETE');
  assert.deepStrictEqual([...snap.reasons], ['M4']);
});

// ===========================================================================
// Invariants
// ===========================================================================

test('Invariant 1: 동일 Input → 동일 Snapshot (determinism)', () => {
  const input = baseInput({ contractCapacityKw: 300 });
  const snap1 = evaluate(input, { snapshotId: 'x', now: '2026-09-26T00:00:00Z' });
  const snap2 = evaluate(input, { snapshotId: 'x', now: '2026-09-26T00:00:00Z' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(snap1)), JSON.parse(JSON.stringify(snap2)));
});

test('Invariant 1b: 100회 반복 실행해도 항상 동일 결과', () => {
  const input = baseInput({
    workType: WORK_TYPE.MODIFICATION,
    module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 60 },
  });
  const first = JSON.stringify(evaluate(input));
  for (let i = 0; i < 100; i += 1) {
    assert.strictEqual(JSON.stringify(evaluate(input)), first);
  }
});

test('Invariant 2: Engine 실행이 입력을 변경하지 않음(입력 객체 비변조)', () => {
  const input = baseInput({ contractCapacityKw: 300 });
  const before = JSON.stringify(input);
  evaluate(input);
  assert.strictEqual(JSON.stringify(input), before);
});

test('Invariant 2b: 반환된 Snapshot은 불변(Object.freeze)이며 변조 시도는 무시됨', () => {
  const snap = evaluate(baseInput({ contractCapacityKw: 300 }));
  assert.strictEqual(Object.isFrozen(snap), true);
  assert.strictEqual(Object.isFrozen(snap.moduleResults), true);
  assert.strictEqual(Object.isFrozen(snap.moduleResults.module1), true);
  try {
    snap.finalStatus = 'HACKED';
  } catch (e) {
    /* strict mode throws — 그것도 정상 */
  }
  assert.notStrictEqual(snap.finalStatus, 'HACKED');
});

test('Invariant 3: UNKNOWN은 NOT_TARGET으로 자동 변환되지 않는다', () => {
  const snap = evaluate(baseInput({ businessType: undefined }));
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.UNKNOWN);
  assert.notStrictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
});

test('Invariant 4/5: 모듈1 TARGET이어도 모듈2~4가 생략되지 않고 항상 4개 다 평가됨', () => {
  const snap = evaluate(baseInput({ contractCapacityKw: 300 }));
  assert.ok(snap.moduleResults.module1);
  assert.ok(snap.moduleResults.module2);
  assert.ok(snap.moduleResults.module3);
  assert.ok(snap.moduleResults.module4);
});

test('Invariant 6: 모듈3에 모듈1의 업종+계약용량 선행조건이 적용된다', () => {
  const snap = evaluate(
    module3Input({
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 500,
      module3: { relocatedRatedCapacityKw: 999 },
    })
  );
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.NOT_TARGET);
});

test('Invariant 7: 모듈2의 동일모델 제외 규칙이 모듈3으로 전파되지 않는다', () => {
  const snap = evaluate(
    module3Input({ contractCapacityKw: 400, module3: { relocatedRatedCapacityKw: 100 } })
  );
  // 모듈3의 inputsUsed 자체에 "동일모델 제외" 관련 필드가 없어야 한다 —
  // 즉 그 예외 로직이 모듈3 계산에 관여할 여지가 구조적으로 없다.
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      snap.moduleResults.module3.inputsUsed,
      'sameManufacturerSameModelExcludedKw'
    ),
    false
  );
});

test('Invariant 8/9: finalStatus/determinationCompleteness는 각각 독립 산출된다 (TARGET+INCOMPLETE 사례)', () => {
  // Module1=TARGET, Module2=UNKNOWN(적용대상 아니므로 실제 집계 제외), Module3 미적용,
  // Module4=UNKNOWN(입력 없음) → finalStatus=TARGET, completeness=INCOMPLETE
  const snap = evaluate(
    baseInput({ workType: WORK_TYPE.NEW, contractCapacityKw: 300 }) // equipment 미입력 → M4 UNKNOWN
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'INCOMPLETE');
});

test('Invariant 8b: 전부 NOT_TARGET(적용모듈)이면 finalStatus=NOT_TARGET, completeness=COMPLETE', () => {
  const snap = evaluate(
    baseInput({
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 100,
      equipment: { none: true },
    })
  );
  assert.strictEqual(snap.finalStatus, STATUS.NOT_TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'COMPLETE');
});

test('Invariant: NOT_APPLICABLE_TO_WORK_TYPE 모듈은 NOT_TARGET 집계에 섞이지 않는다', () => {
  // 신설 작업 — 모듈2·3은 NOT_APPLICABLE. 모듈1 TARGET, 모듈4 NOT_TARGET(없음)뿐이어도
  // 모듈2·3의 status(내부적으로 계산된 값)가 finalStatus에 영향을 주면 안 된다.
  const snap = evaluate(
    baseInput({ workType: WORK_TYPE.NEW, contractCapacityKw: 300, equipment: { none: true } })
  );
  assert.strictEqual(snap.finalStatus, STATUS.TARGET); // 모듈1만으로 TARGET
  assert.deepStrictEqual([...snap.reasons], ['M1']);
});

// ===========================================================================
// F. 세션5 M4 재설계 — 설치/전체이전 경로 (고시 제3조)
// ===========================================================================

function installInput(workType, equipment, overrides) {
  return baseInput(Object.assign({ workType, equipment }, overrides));
}

test('F1: 신설 3톤 용해로 → M4 TARGET, 설치경로만 적용', () => {
  const snap = evaluate(installInput(WORK_TYPE.NEW, { meltingFurnace: { present: true, capacityTon: 3 } }));
  const m4 = snap.moduleResults.module4;
  assert.strictEqual(m4.status, STATUS.TARGET);
  assert.strictEqual(m4.paths.installation.applicability, APPLICABILITY.APPLICABLE);
  assert.strictEqual(m4.paths.modification.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('F2: 신설 3톤 미만 용해로 → M4 NOT_TARGET', () => {
  const snap = evaluate(installInput(WORK_TYPE.NEW, { meltingFurnace: { present: true, capacityTon: 2.99 } }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('F3: 신설 별표9 기준량 충족 화학설비(제외설비 아님) → M4 TARGET', () => {
  const snap = evaluate(
    installInput(WORK_TYPE.NEW, {
      chemicalEquipment: { present: true, meetsHazardousSubstanceThreshold: true, excludedByDecree43_2: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('F4: 신설 별표9 충족이나 영 제43조제2항 제외설비 → M4 NOT_TARGET', () => {
  const snap = evaluate(
    installInput(WORK_TYPE.NEW, {
      chemicalEquipment: { present: true, meetsHazardousSubstanceThreshold: true, excludedByDecree43_2: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('F5: 전체이전 3톤 용해로 → M4 TARGET (고시 제2조제4호 "이전", 설치와 동일 기준)', () => {
  const snap = evaluate(
    installInput(WORK_TYPE.FULL_RELOCATION, { meltingFurnace: { present: true, capacityTon: 3 } })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module4.paths.installation.applicability, APPLICABILITY.APPLICABLE);
});

test('F6: 건조설비 경계값 — 50kg/h+목적 TARGET / 49kg/h·49kW NOT_TARGET (설치)', () => {
  const hit = evaluate(
    installInput(WORK_TYPE.NEW, {
      dryingEquipment: { present: true, fuelConsumptionKgPerHour: 50, purpose: 'ORGANIC_COMPOUND' },
    })
  );
  assert.strictEqual(hit.moduleResults.module4.status, STATUS.TARGET);
  const miss = evaluate(
    installInput(WORK_TYPE.NEW, {
      dryingEquipment: { present: true, fuelConsumptionKgPerHour: 49, ratedPowerKw: 49, purpose: 'ORGANIC_COMPOUND' },
    })
  );
  assert.strictEqual(miss.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('F7: 가스집합용접장치 1,000kg 경계값 (설치) / 유해물질설비 60·150㎥분 경계값', () => {
  assert.strictEqual(
    evaluate(
      installInput(WORK_TYPE.NEW, { gasWeldingAssembly: { present: true, flammableGasQuantityKg: 1000, isFixed: true } })
    ).moduleResults.module4.status,
    STATUS.TARGET
  );
  assert.strictEqual(
    evaluate(
      installInput(WORK_TYPE.NEW, { gasWeldingAssembly: { present: true, flammableGasQuantityKg: 999, isFixed: true } })
    ).moduleResults.module4.status,
    STATUS.NOT_TARGET
  );
  assert.strictEqual(
    evaluate(
      installInput(WORK_TYPE.NEW, {
        ventilation: { present: true, substanceCategory: 'PERMIT_OR_MANAGED_OR_DUST_TABLE16', exhaustAirVolumeM3PerMin: 150 },
      })
    ).moduleResults.module4.status,
    STATUS.TARGET
  );
});

// ===========================================================================
// G. M4 주요구조부분 변경 경로 (고시 제2조제1항제6호) — workType=MODIFICATION
// ===========================================================================

function changeInput(equipmentChange, overrides) {
  return baseInput(Object.assign({ workType: WORK_TYPE.MODIFICATION, equipmentChange }, overrides));
}

test('G1: 기존 용해로 + 열원 변경 → M4 TARGET (3톤 재판정 없음)', () => {
  const snap = evaluate(
    changeInput({ meltingFurnace: { existingTarget: true, heatSourceTypeChanged: true } })
  );
  const m4 = snap.moduleResults.module4;
  assert.strictEqual(m4.status, STATUS.TARGET);
  assert.strictEqual(m4.paths.modification.applicability, APPLICABILITY.APPLICABLE);
  assert.strictEqual(m4.paths.installation.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('G2: 기존 용해로 + 열원 미변경 → M4 NOT_TARGET (다른 설비도 확정 미해당)', () => {
  const snap = evaluate(
    changeInput({
      meltingFurnace: { existingTarget: true, heatSourceTypeChanged: false },
      chemicalEquipment: { existingTarget: false },
      dryingEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('G3: 기존 화학설비 + 생산량증가 목적 교체 → M4 TARGET (별표9 재적용 없음)', () => {
  const snap = evaluate(
    changeInput({
      chemicalEquipment: { existingTarget: true, productionOrMaterialChangeReplacement: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('G4: 기존 화학설비 + 해당 목적 없음(양 트리거 모두 false) → 화학설비 NOT_TARGET', () => {
  const snap = evaluate(
    changeInput({
      chemicalEquipment: {
        existingTarget: true,
        productionOrMaterialChangeReplacement: false,
        managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease: false,
      },
      meltingFurnace: { existingTarget: false },
      dryingEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.paths.modification.equipmentResults.chemicalEquipment.three, false);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('G5: 기존 화학설비 + 관리대상 유해물질설비 변경으로 풍속감소/배풍량증가 → TARGET (경로 나목-②)', () => {
  const snap = evaluate(
    changeInput({
      chemicalEquipment: {
        existingTarget: true,
        productionOrMaterialChangeReplacement: false,
        managedSubstanceEquipmentChangeCausingVelocityDecreaseOrAirflowIncrease: true,
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('G6: 기존 건조설비 + 열원 변경 → TARGET (경로A)', () => {
  const snap = evaluate(
    changeInput({ dryingEquipment: { existingTarget: true, heatSourceTypeChanged: true } })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('G7: 기존 건조설비 + 건조대상물 변경 + 신규목적이 제3조제3호 각목 해당 → TARGET (경로B, 크기기준 재적용 없음)', () => {
  const snap = evaluate(
    changeInput({
      dryingEquipment: {
        existingTarget: true,
        heatSourceTypeChanged: false,
        dryingTargetChanged: true,
        newPurpose: 'ORGANIC_COMPOUND',
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  // 크기(kg/h, kW) 입력이 아예 없어도 판정되어야 한다 — 변경경로는 크기기준을 재적용하지 않음.
});

test('G8: 기존 건조설비 + 건조대상물 변경 + 신규목적이 각목 어디에도 해당 안 함 → 건조설비 NOT_TARGET', () => {
  const snap = evaluate(
    changeInput({
      dryingEquipment: {
        existingTarget: true,
        heatSourceTypeChanged: false,
        dryingTargetChanged: true,
        newPurpose: 'OTHER_NOT_IN_ARTICLE3',
      },
      meltingFurnace: { existingTarget: false },
      chemicalEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.paths.modification.equipmentResults.dryingEquipment.three, false);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
});

test('G9: 기존 가스집합용접장치 + 주관 구조 변경 → TARGET (1,000kg 재적용 없음)', () => {
  const snap = evaluate(
    changeInput({ gasWeldingAssembly: { existingTarget: true, mainPipeStructureChanged: true } })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('G10: 기존 유해물질/분진 설비 + 후드제어풍속 감소 → TARGET (60/150㎥분 재적용 없음)', () => {
  const snap = evaluate(
    changeInput({
      ventilation: { existingTarget: true, equipmentChangeCausingVelocityDecreaseOrAirflowIncrease: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

// ===========================================================================
// H. M4 변경경로 UNKNOWN (fail-closed) — 추측 금지
// ===========================================================================

test('H1: 기존 대상설비 여부 UNKNOWN + 열원변경 TRUE → UNKNOWN (TARGET 아님)', () => {
  const snap = evaluate(
    changeInput({
      meltingFurnace: { existingTarget: undefined, heatSourceTypeChanged: true },
      chemicalEquipment: { existingTarget: false },
      dryingEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.notStrictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

test('H2: 변경조건 UNKNOWN + 기존 대상설비 TRUE → UNKNOWN', () => {
  const snap = evaluate(
    changeInput({
      meltingFurnace: { existingTarget: true, heatSourceTypeChanged: undefined },
      chemicalEquipment: { existingTarget: false },
      dryingEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
});

test('H3: 건조대상물 변경 TRUE + 신규 목적 UNKNOWN → 건조설비 UNKNOWN', () => {
  const snap = evaluate(
    changeInput({
      dryingEquipment: {
        existingTarget: true,
        heatSourceTypeChanged: false,
        dryingTargetChanged: true,
        newPurpose: undefined,
      },
      meltingFurnace: { existingTarget: false },
      chemicalEquipment: { existingTarget: false },
      gasWeldingAssembly: { existingTarget: false },
      ventilation: { existingTarget: false },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.paths.modification.equipmentResults.dryingEquipment.three, undefined);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
});

test('H4: 증설·교체·개조인데 equipmentChange 자체가 없으면 UNKNOWN (false로 정규화하지 않음)', () => {
  const snap = evaluate(baseInput({ workType: WORK_TYPE.MODIFICATION }));
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.strictEqual(snap.moduleResults.module4.paths.modification.status, STATUS.UNKNOWN);
});

test('H5: 신설인데 equipmentChange 없음은 정상 — 변경경로 미평가(NOT_APPLICABLE)', () => {
  const snap = evaluate(
    installInput(WORK_TYPE.NEW, { meltingFurnace: { present: true, capacityTon: 3 } })
  );
  assert.strictEqual(snap.moduleResults.module4.paths.modification.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
});

// ===========================================================================
// I. 경로 배타성 · 부분이전 미확정 · 독립성
// ===========================================================================

test('I1: workType=MODIFICATION인데 input.equipment가 설치기준을 충족해도 설치경로는 TARGET에 기여하지 않는다', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.MODIFICATION,
      equipment: { meltingFurnace: { present: true, capacityTon: 10 } }, // 설치기준 충족
      equipmentChange: {
        meltingFurnace: { existingTarget: true, heatSourceTypeChanged: false },
        chemicalEquipment: { existingTarget: false },
        dryingEquipment: { existingTarget: false },
        gasWeldingAssembly: { existingTarget: false },
        ventilation: { existingTarget: false },
      },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.paths.installation.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('I2: workType=NEW인데 equipmentChange에 변경 TRUE가 있어도 변경경로는 TARGET에 기여하지 않는다', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.NEW,
      equipment: { none: true },
      equipmentChange: { meltingFurnace: { existingTarget: true, heatSourceTypeChanged: true } },
    })
  );
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.paths.modification.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('I3: PARTIAL_RELOCATION은 설치경로/변경경로 어디로도 추측 매핑하지 않고 UNKNOWN (OPEN-ISSUE-M4-RELOCATION-PARTIAL)', () => {
  // 설치기준을 충족하는 equipment와 변경 TRUE를 둘 다 줘도 TARGET/NOT_TARGET으로 새어나가면 안 된다.
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.PARTIAL_RELOCATION,
      equipment: { meltingFurnace: { present: true, capacityTon: 10 } },
      equipmentChange: { meltingFurnace: { existingTarget: true, heatSourceTypeChanged: true } },
      module3: { relocatedRatedCapacityKw: 10 },
    })
  );
  const m4 = snap.moduleResults.module4;
  assert.strictEqual(m4.status, STATUS.UNKNOWN);
  assert.strictEqual(m4.unresolvedLegalIssue, 'OPEN-ISSUE-M4-RELOCATION-PARTIAL');
  assert.strictEqual(m4.paths.installation.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(m4.paths.modification.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('I4: M1 NOT_TARGET + M4 TARGET(설치) → finalStatus TARGET (독립성)', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.NEW,
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 100,
      equipment: { meltingFurnace: { present: true, capacityTon: 5 } },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
});

test('I5: M1 NOT_TARGET + M4 UNKNOWN(변경 미입력) 및 다른 적용모듈 전부 NOT_TARGET → finalStatus UNKNOWN', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.MODIFICATION,
      businessType: { withinListedIndustries: false },
      contractCapacityKw: 100,
      module2: { grossRatedCapacityIncreaseKw: 50 },
      // equipmentChange 없음 → M4 UNKNOWN
    })
  );
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.UNKNOWN);
  assert.strictEqual(snap.finalStatus, STATUS.UNKNOWN);
  assert.strictEqual(snap.determinationCompleteness, 'INCOMPLETE');
});

test('I6: M4 변경경로 결과에 provenance(ruleId, legalBasis, applicability)가 Snapshot에 기록된다', () => {
  const snap = evaluate(
    changeInput({ meltingFurnace: { existingTarget: true, heatSourceTypeChanged: true } })
  );
  const mod = snap.moduleResults.module4.paths.modification;
  assert.strictEqual(mod.ruleId, 'M4-CHANGE');
  assert.deepStrictEqual([...mod.legalBasis], ['NOTICE_2_1_6']);
  assert.strictEqual(mod.applicability, APPLICABILITY.APPLICABLE);
  assert.strictEqual(snap.moduleResults.module4.paths.installation.ruleId, 'M4-INSTALL');
});

test('J1: 신설/전체이전 + equipmentChange 동봉 → 변경경로는 무시(NOT_APPLICABLE), 설치경로 결과만 M4에 반영', () => {
  [WORK_TYPE.NEW, WORK_TYPE.FULL_RELOCATION].forEach((wt) => {
    const snap = evaluate(
      baseInput({
        workType: wt,
        equipment: { none: true },
        equipmentChange: { meltingFurnace: { existingTarget: true, heatSourceTypeChanged: true } },
      })
    );
    const m4 = snap.moduleResults.module4;
    assert.strictEqual(m4.status, STATUS.NOT_TARGET);
    assert.strictEqual(m4.paths.modification.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  });
});

test('J2: 증설·교체·개조 + equipment(설치용)만 있고 equipmentChange 없음 → 설치용 입력은 무시, M4 UNKNOWN', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.MODIFICATION,
      equipment: { meltingFurnace: { present: true, capacityTon: 5 } },
    })
  );
  const m4 = snap.moduleResults.module4;
  assert.strictEqual(m4.status, STATUS.UNKNOWN);
  assert.strictEqual(m4.paths.installation.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
});

test('J3: 이설 M4는 applicability=APPLICABLE(NOT_APPLICABLE 아님) + status=UNKNOWN + INCOMPLETE + unresolvedLegalIssue', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.PARTIAL_RELOCATION,
      module3: { relocatedRatedCapacityKw: 10 }, // 모듈3은 NOT_TARGET이라 M4 UNKNOWN이 finalStatus를 결정
    })
  );
  const m4 = snap.moduleResults.module4;
  assert.strictEqual(m4.applicability, APPLICABILITY.APPLICABLE); // "미확정"은 "적용 안 됨"이 아니다
  assert.strictEqual(m4.status, STATUS.UNKNOWN);
  assert.strictEqual(m4.unresolvedLegalIssue, 'OPEN-ISSUE-M4-RELOCATION-PARTIAL');
  assert.strictEqual(snap.determinationCompleteness, 'INCOMPLETE');
  assert.strictEqual(snap.finalStatus, STATUS.UNKNOWN);
});

// ===========================================================================
// 결과 보고
// ===========================================================================

console.log(`\n총 ${passed + failed}개 중 통과 ${passed}, 실패 ${failed}\n`);
if (failures.length > 0) {
  failures.forEach(({ name, err }) => {
    console.log(`✗ ${name}`);
    console.log(`  ${err.message}\n`);
  });
  process.exitCode = 1;
} else {
  console.log('전체 통과');
}
