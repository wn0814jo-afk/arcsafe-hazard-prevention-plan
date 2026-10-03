/**
 * report.js — STEP 6-1 Report 계층 (REPORT-DESIGN.md 구현)
 *
 *   Snapshot ──▶ buildReportModel(snapshot, lawBasis, ctx) ──▶ ReportModel
 *                ReportModel ──▶ toUserView(model) ──▶ UserView (허용 목록만)
 *
 * 계약 (REPORT-DESIGN.md / UI-DESIGN.md):
 *  - Snapshot을 읽기만 한다(변경 금지). Engine을 호출하지 않는다.
 *  - engine.js / data.js를 import하지 않는다. LAW_BASIS와 현재 ruleVersion은 인자로 받는다.
 *  - 임계값 재계산, 법령 조건 재판정, `reason` 파싱을 하지 않는다.
 *  - three:true=조건 충족 / three:false=조건 미충족 / three 키 없음=확인 필요 — 그 이상 해석하지 않는다.
 *  - N/A 모듈·경로의 status는 결과로 표시하지 않는다(applicability 우선).
 *  - 제6조(제출면제), Pro/Free 분기는 존재하지 않는다.
 *  - 개발자용 provenance(note, openItems, ruleContractRef, ruleId, reason, ruleVersion 원문 등)는
 *    ReportModel에만 보존되고, toUserView의 허용 목록 밖이므로 사용자 화면으로 전달되지 않는다.
 *
 * 아래 상수 문자열(status/applicability/workType 값)은 Snapshot의 값 어휘를 그대로 적은 것이며,
 * 일치 여부는 tests-ui.js의 계약 테스트가 engine.js/data.js와 대조해 검증한다.
 */
'use strict';

// ---- Snapshot 값 어휘 (계약 테스트가 Engine과 대조) -----------------------------
const V = Object.freeze({
  TARGET: 'TARGET',
  NOT_TARGET: 'NOT_TARGET',
  UNKNOWN: 'UNKNOWN',
  APPLICABLE: 'APPLICABLE',
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE',
});

// ---- 사용자 문구 (UI-DESIGN.md §12-2, §12-5, §12-6) ---------------------------------
const COPY = Object.freeze({
  headline: Object.freeze({
    'TARGET|COMPLETE': { text: '유해·위험방지계획서 제출 대상에 해당합니다.', subtitle: null, tone: 'target' },
    'TARGET|INCOMPLETE': {
      text: '유해·위험방지계획서 제출 대상에 해당합니다.',
      subtitle: '일부 확인이 필요한 항목이 있습니다.',
      tone: 'target',
    },
    'UNKNOWN|INCOMPLETE': { text: '대상 여부 확인이 필요합니다.', subtitle: null, tone: 'unknown' },
    'NOT_TARGET|COMPLETE': {
      text: '입력하신 내용 기준으로는 제출 대상에 해당하지 않습니다.',
      subtitle: null,
      tone: 'nontarget',
    },
  }),
  // 승인 4종 밖의 조합 — 임의 문구를 만들지 않고 오류 상태로 표시한다.
  headlineError: '결과를 표시할 수 없습니다. 처음부터 다시 시도해 주세요.',
  workType: Object.freeze({
    NEW: '신설',
    FULL_RELOCATION: '전체 이전',
    PARTIAL_RELOCATION: '일부 설비 이전(이설)',
    MODIFICATION: '증설·교체·개조(주요 구조부분 변경)',
  }),
  notApplicable: '이번 작업 유형에는 적용되지 않음',
  inactivePath: '이번 작업 유형에는 적용되지 않는 경로',
  result: Object.freeze({ TARGET: '대상', NOT_TARGET: '대상 아님', UNKNOWN: '확인 필요' }),
  precondition: Object.freeze({ TARGET: '충족', NOT_TARGET: '미충족', UNKNOWN: '확인 필요' }),
  preconditionNote: '독립 제출 사유가 아니라 다른 항목의 전제조건입니다.',
  row: Object.freeze({ MET: '조건 충족', NOT_MET: '조건 미충족', UNKNOWN: '확인 필요' }),
  versionBanner: '이 결과는 현재와 다른 판정 기준으로 만들어졌습니다. 최신 기준으로 다시 확인해 주세요.',
  // 이설 M4 — 승인된 고정 문구(UI-DESIGN §12-5, 그대로)
  unresolved: Object.freeze([
    '일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.',
    "따라서 이 항목은 '대상 아님'으로 처리하지 않고 '확인 필요'로 남깁니다. 이 항목이 확인되지 않아 전체 판단이 완전하지 않습니다.",
    '이설에 해당하는 경우 관련 기준을 별도로 확인해 주세요.',
  ]),
  reliability: Object.freeze({ PRIMARY: '1차 자료 대조 확인' }),
  basisMissing: '근거 데이터 없음',
});

const MODULES = Object.freeze([
  { id: 'M1', key: 'module1', label: '사업장 기준 (업종·계약용량)', target: 'business', input: '사업장 기준(업종·계약용량) 정보가 부족합니다.' },
  { id: 'M2', key: 'module2', label: '증설·교체·개조 (정격용량)', target: 'increase', input: '증설·교체·개조 정격용량 정보가 부족합니다.' },
  { id: 'M3', key: 'module3', label: '일부 설비 이전·이설 (정격용량)', target: 'relocation', input: '이설 설비 정격용량 정보가 부족합니다.' },
]);
const M4_LABEL = '대상설비 5종';
const M4_TARGET = 'equipment';
const M4_PATH_UNKNOWN_TEXT = '대상설비 해당 여부 정보가 부족합니다.';

const EQUIPMENT = Object.freeze([
  { key: 'meltingFurnace', label: '용해로' },
  { key: 'chemicalEquipment', label: '화학설비' },
  { key: 'dryingEquipment', label: '건조설비' },
  { key: 'gasWeldingAssembly', label: '가스집합용접장치' },
  { key: 'ventilation', label: '유해물질 밀폐·환기·배기설비' },
]);
const PATHS = Object.freeze([
  { key: 'installation', label: '설치·전체 이전 기준' },
  { key: 'modification', label: '주요 구조부분 변경 기준' },
]);

// ---- 작은 헬퍼 (모두 Snapshot 읽기 전용) -------------------------------------------
function statusKey(s) {
  // 알 수 없는 값은 fail-closed로 '확인 필요'. NOT_TARGET으로 바꾸지 않는다.
  return s === V.TARGET || s === V.NOT_TARGET ? s : V.UNKNOWN;
}

function lookupBasis(ids, lawBasis) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = lawBasis && Object.prototype.hasOwnProperty.call(lawBasis, id) ? lawBasis[id] : undefined;
    out.push({
      ruleId: id, // provenance (사용자 화면 금지)
      found: !!e,
      statute: e ? e.statute : undefined,
      text: e ? e.text : undefined,
      effectiveDate: e ? e.effectiveDate : undefined,
      noticeNo: e ? e.noticeNo : undefined,
      reliability: e ? e.reliability : undefined,
      note: e ? e.note : undefined, // provenance
      openItems: e ? e.openItems : undefined, // provenance
      ruleContractRef: e ? e.ruleContractRef : undefined, // provenance
    });
  }
  return out;
}

function buildModuleModel(def, snap, lawBasis, anyDependentApplicable) {
  const r = snap.moduleResults && snap.moduleResults[def.key];
  const applicable = !!r && r.applicability === V.APPLICABLE;
  let display;
  if (applicable) display = 'APPLICABLE';
  else if (def.id === 'M1' && anyDependentApplicable) display = 'PRECONDITION'; // M2/M3가 전제조건으로 사용
  else display = 'NOT_APPLICABLE';
  return {
    id: def.id,
    label: def.label,
    target: def.target,
    display,
    resultKey: r ? statusKey(r.status) : V.UNKNOWN,
    basis: lookupBasis(r && r.legalBasis, lawBasis),
    reasonRaw: r ? r.reason : undefined, // provenance (사용자 화면 금지)
    inputsUsedRaw: r ? r.inputsUsed : undefined, // provenance
  };
}

function buildPathModel(def, p, lawBasis) {
  if (!p) return { kind: def.key, label: def.label, present: false, applicable: false, rows: [], basis: [] };
  const applicable = p.applicability === V.APPLICABLE;
  const results = p.equipmentResults || {};
  const hasAnyKey = Object.keys(results).length > 0;
  const pathStatus = statusKey(p.status);
  // 설비 행: 적용 경로이면서, (결과 키가 하나라도 있거나 경로가 확인 필요)일 때만. 키 없음 = 확인 필요(C1).
  // 경로가 '대상 아님'이고 결과 키가 없는 경우(해당 설비 없음 확정)에는 행 없이 경로 수준 결과만 표시한다.
  const showRows = applicable && (hasAnyKey || pathStatus === V.UNKNOWN);
  const rows = showRows
    ? EQUIPMENT.map((e) => {
        const has = Object.prototype.hasOwnProperty.call(results, e.key);
        const item = has ? results[e.key] : undefined;
        const three = item && Object.prototype.hasOwnProperty.call(item, 'three') ? item.three : undefined;
        const state = three === true ? 'MET' : three === false ? 'NOT_MET' : 'UNKNOWN';
        return { key: e.key, label: e.label, state, reasonRaw: item ? item.reason : undefined };
      })
    : [];
  return {
    kind: def.key,
    label: def.label,
    present: true,
    applicable,
    resultKey: pathStatus,
    rows,
    basis: lookupBasis(p.legalBasis, lawBasis),
    reasonRaw: p.reason, // provenance
  };
}

/**
 * Snapshot → ReportModel. Snapshot을 변경하지 않는다.
 * @param {object} snapshot  Engine이 만든 Snapshot
 * @param {object} lawBasis  LAW_BASIS (호출자가 전달)
 * @param {object} [ctx]     { currentRuleVersion } — ruleVersion 불일치 여부 비교용(원문은 모델에만 보존)
 */
function buildReportModel(snapshot, lawBasis, ctx) {
  const snap = snapshot || {};
  const mr = snap.moduleResults || {};
  const key = String(snap.finalStatus) + '|' + String(snap.determinationCompleteness);
  const headline = Object.prototype.hasOwnProperty.call(COPY.headline, key)
    ? { ok: true, key, ...COPY.headline[key] }
    : { ok: false, key, text: COPY.headlineError, subtitle: null, tone: 'error' };

  const dependentApplicable = ['module2', 'module3'].some((k) => mr[k] && mr[k].applicability === V.APPLICABLE);
  const modules = MODULES.map((d) => buildModuleModel(d, snap, lawBasis, dependentApplicable));

  // 모듈 4
  const m4r = mr.module4;
  const paths = PATHS.map((d) => buildPathModel(d, m4r && m4r.paths && m4r.paths[d.key], lawBasis));
  const m4Basis = lookupBasis(
    [].concat((m4r && m4r.legalBasis) || [], ...paths.filter((p) => p.applicable).map((p) => p.basis.map((b) => b.ruleId))),
    lawBasis
  );
  const m4 = {
    label: M4_LABEL,
    target: M4_TARGET,
    resultKey: m4r ? statusKey(m4r.status) : V.UNKNOWN,
    unresolved: !!(m4r && m4r.unresolvedLegalIssue),
    unresolvedRaw: m4r ? m4r.unresolvedLegalIssue : undefined, // provenance
    paths,
    basis: m4Basis,
    reasonRaw: m4r ? m4r.reason : undefined, // provenance
  };

  // 대상 판단 근거(B): reasons는 '대상 모듈' 식별에만 쓴다. M4의 대상 설비는 equipmentResults(three:true)에서만 도출한다.
  const reasonIds = Array.isArray(snap.reasons) ? snap.reasons : [];
  const targetModules = [];
  for (const m of modules) {
    if (reasonIds.includes(m.id)) targetModules.push({ label: m.label, equipment: [] });
  }
  if (reasonIds.includes('M4')) {
    const equipment = [];
    for (const p of paths) {
      if (!p.applicable) continue;
      for (const r of p.rows) if (r.state === 'MET') equipment.push(r.label);
    }
    targetModules.push({ label: M4_LABEL, equipment });
  }

  // 확인 필요(E) — 문구 출처: 구조 필드 기반 고정 문구 / 이설 고정 문구 / 입력 보완 안내(구조에서 직접 확인되는 범위)
  const confirmItems = [];
  const addItem = (kind, target, text) => {
    if (!confirmItems.some((i) => i.text === text)) confirmItems.push({ kind, target, text });
  };
  const m1 = modules[0];
  if (m1.display === 'PRECONDITION' && m1.resultKey === V.UNKNOWN) addItem('INPUT', m1.target, MODULES[0].input);
  modules.forEach((m, i) => {
    if (m.display === 'APPLICABLE' && m.resultKey === V.UNKNOWN) addItem('INPUT', m.target, MODULES[i].input);
  });
  if (m4.unresolved) {
    addItem('UNRESOLVED', M4_TARGET, COPY.unresolved.join(' '));
  } else if (m4.resultKey === V.UNKNOWN) {
    let added = false;
    for (const p of paths) {
      if (!p.applicable) continue;
      for (const r of p.rows) {
        if (r.state === 'UNKNOWN') {
          addItem('INPUT', M4_TARGET, r.label + ': 세부 조건 입력이 필요합니다.');
          added = true;
        }
      }
    }
    if (!added) addItem('INPUT', M4_TARGET, M4_PATH_UNKNOWN_TEXT);
  }

  const cur = ctx && ctx.currentRuleVersion;
  const meta = {
    createdAt: typeof snap.createdAt === 'string' ? snap.createdAt : undefined,
    snapshotId: snap.snapshotId, // provenance
    engineVersion: snap.engineVersion, // provenance
    ruleVersion: snap.ruleVersion, // provenance (원문은 사용자 화면 금지)
    ruleVersionMismatch: cur !== undefined && snap.ruleVersion !== cur,
  };

  return {
    headline,
    finalStatus: snap.finalStatus, // provenance
    determinationCompleteness: snap.determinationCompleteness, // provenance
    workType: snap.input ? snap.input.workType : undefined,
    targetModules,
    modules,
    m4,
    confirmItems,
    meta,
  };
}

// ---- ReportModel → UserView (허용 목록 투영) -----------------------------------------
function userBasis(list) {
  return (list || []).map((b) =>
    b.found
      ? {
          missing: false,
          statute: b.statute,
          text: b.text,
          effectiveDate: b.effectiveDate,
          noticeNo: b.noticeNo,
          reliabilityLabel: Object.prototype.hasOwnProperty.call(COPY.reliability, b.reliability)
            ? COPY.reliability[b.reliability]
            : null,
        }
      : { missing: true, message: COPY.basisMissing } // 내부 ID는 노출하지 않는다
  );
}

function toneOf(k) {
  return k === V.TARGET ? 'target' : k === V.UNKNOWN ? 'unknown' : 'neutral';
}

/**
 * ReportModel → UserView. **허용 목록**: 여기서 명시적으로 만든 필드만 존재한다.
 * note / openItems / ruleContractRef / ruleId / reason / ruleVersion·engineVersion·snapshotId 원문은 포함되지 않는다.
 */
function toUserView(model) {
  const m = model;
  const modules = m.modules.map((x) => {
    if (x.display === 'APPLICABLE') {
      return {
        label: x.label,
        target: x.target,
        display: 'APPLICABLE',
        resultLabel: COPY.result[x.resultKey],
        tone: toneOf(x.resultKey),
        basis: userBasis(x.basis),
      };
    }
    if (x.display === 'PRECONDITION') {
      return {
        label: x.label,
        target: x.target,
        display: 'PRECONDITION',
        resultLabel: COPY.precondition[x.resultKey],
        tone: toneOf(x.resultKey),
        message: COPY.preconditionNote,
        basis: userBasis(x.basis),
      };
    }
    // N/A — status는 전달하지 않는다
    return { label: x.label, target: x.target, display: 'NOT_APPLICABLE', message: COPY.notApplicable, basis: [] };
  });

  const m4 = {
    label: m.m4.label,
    target: m.m4.target,
    resultLabel: COPY.result[m.m4.resultKey],
    tone: toneOf(m.m4.resultKey),
    unresolvedLines: m.m4.unresolved ? COPY.unresolved.slice() : null,
    paths: m.m4.paths
      .filter((p) => p.applicable && !m.m4.unresolved)
      .map((p) => ({
        label: p.label,
        resultLabel: COPY.result[p.resultKey],
        tone: toneOf(p.resultKey),
        rows: p.rows.map((r) => ({
          label: r.label,
          stateLabel: COPY.row[r.state],
          tone: r.state === 'MET' ? 'target' : r.state === 'UNKNOWN' ? 'unknown' : 'neutral',
        })),
      })),
    inactivePaths: m.m4.paths.filter((p) => p.present && !p.applicable).map((p) => p.label),
    inactiveMessage: COPY.inactivePath,
    basis: userBasis(m.m4.basis),
  };

  return {
    headline: { text: m.headline.text, subtitle: m.headline.subtitle, tone: m.headline.tone, ok: m.headline.ok },
    workTypeLabel: Object.prototype.hasOwnProperty.call(COPY.workType, m.workType) ? COPY.workType[m.workType] : null,
    targetModules: m.targetModules.map((t) => ({ label: t.label, equipment: t.equipment.slice() })),
    confirmItems: m.confirmItems.map((i) => ({ kind: i.kind, target: i.target, text: i.text })),
    modules,
    m4,
    footer: {
      createdAt: m.meta.createdAt || null,
      versionMismatch: !!m.meta.ruleVersionMismatch,
      versionBanner: m.meta.ruleVersionMismatch ? COPY.versionBanner : null,
    },
  };
}

module.exports = { buildReportModel, toUserView, REPORT_COPY: COPY, REPORT_VOCAB: V, REPORT_EQUIPMENT: EQUIPMENT };
