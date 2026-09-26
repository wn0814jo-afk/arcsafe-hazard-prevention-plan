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

test('E2: 증설 + 대상업종 + 400kW + 증가 150kW → M2 TARGET, final TARGET/COMPLETE, M4 NOT_TARGET("없음")', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.MODIFICATION,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 400,
      module2: { grossRatedCapacityIncreaseKw: 150, sameManufacturerSameModelExcludedKw: 0 },
      equipment: { none: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET); // 내부값(선행조건)은 계산됨
  assert.strictEqual(snap.moduleResults.module2.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module3.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'COMPLETE');
  assert.deepStrictEqual([...snap.reasons], ['M2']);
});

test('E3: 이설 + 대상업종 + 350kW + 이설 120kW → M3 TARGET, final TARGET/COMPLETE', () => {
  const snap = evaluate(
    baseInput({
      workType: WORK_TYPE.PARTIAL_RELOCATION,
      businessType: { withinListedIndustries: true },
      contractCapacityKw: 350,
      module3: { relocatedRatedCapacityKw: 120 },
      equipment: { none: true },
    })
  );
  assert.strictEqual(snap.moduleResults.module1.applicability, APPLICABILITY.NOT_APPLICABLE_TO_WORK_TYPE);
  assert.strictEqual(snap.moduleResults.module1.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module3.status, STATUS.TARGET);
  assert.strictEqual(snap.moduleResults.module4.status, STATUS.NOT_TARGET);
  assert.strictEqual(snap.finalStatus, STATUS.TARGET);
  assert.strictEqual(snap.determinationCompleteness, 'COMPLETE');
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
