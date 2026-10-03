/**
 * ui-render.js — 화면 렌더러 (순수 함수: 상태/UserView → HTML 문자열)
 *
 *  - 결과 화면은 UserView(허용 목록 투영)만 받는다. ReportModel/Snapshot에는 접근하지 않는다.
 *  - 법적 판정·임계값 비교 없음. engine.js / data.js를 import하지 않는다.
 *  - DOM(속성 포함)에 Engine 열거값·내부 필드명·내부 ID·개발 문서명이 들어가지 않는다.
 *  - 모든 동적 문자열은 esc()로 이스케이프한다.
 */
'use strict';

const { COPY } = require('./ui-copy.js');
const { EQUIP_IDS, STEP_NUMBER, stepsFor } = require('./ui-model.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function errMsg(errors, id) {
  const e = (errors || []).find((x) => x.id === id);
  return e ? e.message : null;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ---- 입력 컨트롤 ----------------------------------------------------------------------
function radioGroup(state, errors, { id, path, legend, options }) {
  const cur = getPath(state, path);
  const m = errMsg(errors, id);
  const items = options
    .map((o, i) => {
      const iid = id + '-' + i;
      return (
        '<label class="opt" for="' + iid + '"><input type="radio" id="' + iid + '" name="' + esc(id) + '" data-path="' + esc(path) +
        '" value="' + esc(o.value) + '"' + (cur === o.value ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>'
      );
    })
    .join('');
  return (
    '<fieldset class="group' + (m ? ' has-error' : '') + '" id="' + esc(id) + '"' + (m ? ' aria-describedby="err-' + esc(id) + '"' : '') +
    '><legend>' + esc(legend) + '</legend>' + items +
    (m ? '<p class="err" id="err-' + esc(id) + '">' + esc(m) + '</p>' : '') + '</fieldset>'
  );
}

function numField(state, errors, { id, path, label, unit }) {
  const f = getPath(state, path);
  const m = errMsg(errors, id);
  return (
    '<div class="field' + (m ? ' has-error' : '') + '" id="' + esc(id) + '">' +
    '<label class="q" for="' + esc(id) + '-input">' + esc(label) + '</label>' +
    '<div class="row"><input id="' + esc(id) + '-input" type="text" inputmode="decimal" autocomplete="off" data-path="' + esc(path) +
    '.value" value="' + esc(f.value) + '"' + (f.unknown ? ' disabled' : '') + (m ? ' aria-invalid="true" aria-describedby="err-' + esc(id) + '"' : '') +
    '><span class="unit">' + esc(unit) + '</span></div>' +
    '<label class="opt" for="' + esc(id) + '-unknown"><input type="checkbox" id="' + esc(id) + '-unknown" data-path="' + esc(path) +
    '.unknown"' + (f.unknown ? ' checked' : '') + '><span>' + esc(COPY.unknown) + '</span></label>' +
    (m ? '<p class="err" id="err-' + esc(id) + '">' + esc(m) + '</p>' : '') + '</div>'
  );
}

// ---- 단계별 본문 -----------------------------------------------------------------------
function bodyWorkType(state, errors) {
  return radioGroup(state, errors, { id: 'g-workType', path: 'workType', legend: COPY.workTypeQ, options: COPY.workTypeOptions });
}

function bodyIndustry(state, errors, ctx) {
  const m = errMsg(errors, 'g-industry');
  const mName = errMsg(errors, 'f-industry-name');
  const ch = state.industry.choice;
  const opts = (ctx.industryList || [])
    .map((n) => '<option value="' + esc(n) + '"' + (state.industry.name === n ? ' selected' : '') + '>' + esc(n) + '</option>')
    .join('');
  const radio = (i, value, label) =>
    '<label class="opt" for="g-industry-' + i + '"><input type="radio" id="g-industry-' + i + '" name="g-industry" data-path="industry.choice" value="' +
    value + '"' + (ch === value ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  return (
    '<fieldset class="group' + (m ? ' has-error' : '') + '" id="g-industry"><legend>' + esc(COPY.industryQ) + '</legend>' +
    radio(0, 'listed', COPY.industryListed) +
    '<div class="sub' + (mName ? ' has-error' : '') + '" id="f-industry-name"><label class="vh" for="f-industry-name-input">' + esc(COPY.industryPlaceholder) + '</label>' +
    '<select id="f-industry-name-input" data-path="industry.name"' + (ch === 'listed' ? '' : ' disabled') + (mName ? ' aria-invalid="true"' : '') + '>' +
    '<option value="">' + esc(COPY.industryPlaceholder) + '</option>' + opts + '</select>' +
    (mName ? '<p class="err" id="err-f-industry-name">' + esc(mName) + '</p>' : '') + '</div>' +
    radio(1, 'not_listed', COPY.industryNotListed) +
    radio(2, 'unknown', COPY.unknown) +
    (m ? '<p class="err" id="err-g-industry">' + esc(m) + '</p>' : '') + '</fieldset>'
  );
}

function bodyContract(state, errors) {
  return numField(state, errors, { id: 'f-contract', path: 'contract', label: COPY.contractQ, unit: COPY.unitKw });
}

function bodyEquip(state, errors) {
  if (state.workType === 'modify') {
    return (
      '<p class="lead">' + esc(COPY.equipChangeQ) + '</p>' +
      EQUIP_IDS.map((id) =>
        radioGroup(state, errors, { id: 'g-include-' + id, path: 'chg.include.' + id, legend: COPY.equipNames[id], options: COPY.includeOptions })
      ).join('')
    );
  }
  const m = errMsg(errors, 'g-equip');
  const e = state.equip;
  const cb = (key, label, checked) =>
    '<label class="opt" for="eq-' + key + '"><input type="checkbox" id="eq-' + key + '" data-action="equip-toggle" data-key="' + key + '"' +
    (checked ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  return (
    '<fieldset class="group' + (m ? ' has-error' : '') + '" id="g-equip"><legend>' + esc(COPY.equipInstallQ) + '</legend>' +
    EQUIP_IDS.map((id) => cb(id, COPY.equipNames[id], e.selected[id])).join('') +
    '<hr class="sep">' + cb('none', COPY.equipNone, e.none) + cb('unknown', COPY.unknown, e.unknown) +
    (m ? '<p class="err" id="err-g-equip">' + esc(m) + '</p>' : '') + '</fieldset>'
  );
}

function section(title, inner) {
  return '<section class="subsec"><h3>' + esc(title) + '</h3>' + inner + '</section>';
}

function bodyEquipDetail(state, errors) {
  const s = state.equip.selected;
  const rg = (id, path, legend, options) => radioGroup(state, errors, { id, path, legend, options });
  const nf = (id, path, label, unit) => numField(state, errors, { id, path, label, unit });
  let out = '';
  if (s.melt) out += section(COPY.equipNames.melt, nf('f-melt-capacity', 'equip.details.melt.capacity', COPY.meltCapacityQ, COPY.unitTon));
  if (s.chem) {
    out += section(
      COPY.equipNames.chem,
      rg('g-chem-meets', 'equip.details.chem.meets', COPY.chemMeetsQ, COPY.yesNo) +
        rg('g-chem-excluded', 'equip.details.chem.excluded', COPY.chemExcludedQ, COPY.yesNo)
    );
  }
  if (s.dry) {
    out += section(
      COPY.equipNames.dry,
      nf('f-dry-fuel', 'equip.details.dry.fuel', COPY.dryFuelQ, COPY.unitKgH) +
        nf('f-dry-power', 'equip.details.dry.power', COPY.dryPowerQ, COPY.unitKw) +
        rg('g-dry-purpose', 'equip.details.dry.purpose', COPY.dryPurposeQ, COPY.dryPurposeOptions)
    );
  }
  if (s.gas) {
    out += section(
      COPY.equipNames.gas,
      nf('f-gas-quantity', 'equip.details.gas.quantity', COPY.gasQuantityQ, COPY.unitKg) +
        rg('g-gas-fixed', 'equip.details.gas.fixed', COPY.gasFixedQ, COPY.yesNo)
    );
  }
  if (s.vent) {
    out += section(
      COPY.equipNames.vent,
      rg('g-vent-category', 'equip.details.vent.category', COPY.ventCategoryQ, COPY.ventCategoryOptions) +
        nf('f-vent-airVolume', 'equip.details.vent.airVolume', COPY.ventAirVolumeQ, COPY.unitM3)
    );
  }
  return out;
}

function bodyChangeDetail(state, errors) {
  const inc = state.chg.include;
  const rg = (id, path, legend, options) => radioGroup(state, errors, { id, path, legend, options });
  const nf = (id, path, label, unit) => numField(state, errors, { id, path, label, unit });
  const yn = COPY.yesNo;
  let out = section(
    COPY.changeDetailTitle,
    nf('f-m2-gross', 'm2.gross', COPY.m2GrossQ, COPY.unitKw) + nf('f-m2-excluded', 'm2.excluded', COPY.m2ExcludedQ, COPY.unitKw)
  );
  const ex = (id) => rg('g-' + id + '-existing', 'chg.details.' + id + '.existing', COPY.existingQ(COPY.equipNames[id]), yn);
  if (inc.melt === 'yes') out += section(COPY.equipNames.melt, ex('melt') + rg('g-melt-heat', 'chg.details.melt.heat', COPY.heatQ, yn));
  if (inc.chem === 'yes') {
    out += section(
      COPY.equipNames.chem,
      ex('chem') + rg('g-chem-production', 'chg.details.chem.production', COPY.chemProductionQ, yn) + rg('g-chem-managed', 'chg.details.chem.managed', COPY.chemManagedQ, yn)
    );
  }
  if (inc.dry === 'yes') {
    out += section(
      COPY.equipNames.dry,
      ex('dry') +
        rg('g-dry-heat', 'chg.details.dry.heat', COPY.dryHeatQ, yn) +
        rg('g-dry-target', 'chg.details.dry.target', COPY.dryTargetQ, yn) +
        (state.chg.details.dry.target === 'yes' ? rg('g-dry-newPurpose', 'chg.details.dry.newPurpose', COPY.dryNewPurposeQ, COPY.dryPurposeOptions) : '')
    );
  }
  if (inc.gas === 'yes') out += section(COPY.equipNames.gas, ex('gas') + rg('g-gas-pipe', 'chg.details.gas.pipe', COPY.gasPipeQ, yn));
  if (inc.vent === 'yes') out += section(COPY.equipNames.vent, ex('vent') + rg('g-vent-change', 'chg.details.vent.change', COPY.ventChangeQ, yn));
  return out;
}

function bodyRelocationDetail(state, errors) {
  return numField(state, errors, { id: 'f-m3-relocated', path: 'm3.relocated', label: COPY.m3Q, unit: COPY.unitKw });
}

function bodyM4Notice() {
  return '<div class="callout tone-unknown">' + COPY.m4NoticeLines.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div>';
}

const TITLES = {
  workType: () => COPY.workTypeQ,
  industry: () => COPY.industryQ,
  contract: () => COPY.contractQ,
  equip: (s) => (s.workType === 'modify' ? COPY.equipChangeQ : COPY.equipInstallQ),
  equipDetail: () => COPY.equipDetailTitle,
  changeDetail: () => COPY.changeDetailTitle,
  relocationDetail: () => COPY.relocationDetailTitle,
  m4Notice: () => COPY.m4NoticeTitle,
};

// 질문 문구는 fieldset의 legend에 이미 있으므로, 제목은 화면 이름 역할만 한다.
function stepHeading(state, step) {
  if (step === 'workType' || step === 'industry' || step === 'contract' || step === 'equip') {
    return { visible: false, text: TITLES[step](state) };
  }
  return { visible: true, text: TITLES[step](state) };
}

function renderErrorSummary(errors) {
  if (!errors || !errors.length) return '';
  return (
    '<div class="errsum" id="errsum" role="alert" tabindex="-1"><p><strong>' + esc(COPY.errorSummary) + '</strong></p><ul>' +
    errors.map((e) => '<li><a href="#' + esc(e.id) + '" data-action="focus-field" data-id="' + esc(e.id) + '">' + esc(e.message) + '</a></li>').join('') +
    '</ul></div>'
  );
}

/** 입력 단계 렌더링(시작 화면 포함). 결과 화면은 renderResult를 쓴다. */
function renderWizard(state, ctx) {
  const step = state.step;
  if (step === 'start') {
    return (
      '<section class="screen"><h1 id="step-title" tabindex="-1">' + esc(COPY.appTitle) + '</h1><p class="lead">' + esc(COPY.intro) + '</p>' +
      '<p class="scope">' + esc(COPY.scope) + '</p>' +
      '<div class="nav"><button type="button" class="btn primary" data-action="start">' + esc(COPY.start) + '</button></div></section>'
    );
  }
  const steps = stepsFor(state);
  const idx = steps.indexOf(step);
  const prevStep = idx > 0 ? steps[idx - 1] : null;
  const nextStep = idx >= 0 ? steps[idx + 1] : null;
  const errors = state.errors || [];
  const bodies = {
    workType: bodyWorkType,
    industry: (s, e) => bodyIndustry(s, e, ctx),
    contract: bodyContract,
    equip: bodyEquip,
    equipDetail: bodyEquipDetail,
    changeDetail: bodyChangeDetail,
    relocationDetail: bodyRelocationDetail,
    m4Notice: bodyM4Notice,
  };
  const h = stepHeading(state, step);
  const num = STEP_NUMBER[step];
  return (
    '<section class="screen" aria-labelledby="step-title">' +
    (num ? '<p class="stepno">' + esc(COPY.stepLabel(num)) + '</p>' : '') +
    '<h2 id="step-title" tabindex="-1"' + (h.visible ? '' : ' class="vh"') + '>' + esc(h.text) + '</h2>' +
    renderErrorSummary(errors) +
    bodies[step](state, errors) +
    '<p class="scope">' + esc(COPY.scope) + '</p>' +
    '<div class="nav">' +
    (prevStep ? '<button type="button" class="btn" data-action="prev">' + esc(COPY.prev) + '</button>' : '<span></span>') +
    '<button type="button" class="btn primary" data-action="next">' + esc(nextStep === 'result' ? COPY.showResult : COPY.next) + '</button>' +
    '</div></section>'
  );
}

// ---- 결과 화면 (UserView만 사용) -----------------------------------------------------------
const ICON = { target: '●', unknown: '▲', neutral: '○', error: '■' };

function badge(tone, text) {
  return '<span class="badge tone-' + esc(tone) + '"><span aria-hidden="true">' + ICON[tone] + '</span> ' + esc(text) + '</span>';
}

function basisBlock(list) {
  if (!list || !list.length) return '';
  const items = list
    .map((b) => {
      if (b.missing) return '<li><p>' + esc(b.message) + '</p></li>';
      const meta = [b.effectiveDate ? '시행일 ' + b.effectiveDate : '', b.noticeNo ? '고시 ' + b.noticeNo : '', b.reliabilityLabel || '']
        .filter(Boolean)
        .join(' · ');
      return '<li><strong>' + esc(b.statute) + '</strong><p>' + esc(b.text) + '</p>' + (meta ? '<p class="muted">' + esc(meta) + '</p>' : '') + '</li>';
    })
    .join('');
  return '<details class="basis"><summary>' + esc(COPY.basisToggle) + '</summary><ul>' + items + '</ul></details>';
}

function moduleCard(m) {
  if (m.display === 'NOT_APPLICABLE') {
    return '<article class="card tone-neutral"><h4>' + esc(m.label) + '</h4><p class="muted">' + esc(m.message) + '</p></article>';
  }
  return (
    '<article class="card tone-' + esc(m.tone) + '"><h4>' + esc(m.label) + '</h4><p>' + badge(m.tone, m.resultLabel) + '</p>' +
    (m.display === 'PRECONDITION' ? '<p class="muted">' + esc(m.message) + '</p>' : '') + basisBlock(m.basis) + '</article>'
  );
}

function m4Card(m4) {
  let inner = '<h4>' + esc(m4.label) + '</h4><p>' + badge(m4.tone, m4.resultLabel) + '</p>';
  if (m4.unresolvedLines) {
    inner += '<div class="callout tone-unknown">' + m4.unresolvedLines.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div>';
  }
  for (const p of m4.paths) {
    inner += '<div class="path"><h5>' + esc(p.label) + '</h5><p>' + badge(p.tone, p.resultLabel) + '</p>';
    if (p.rows.length) {
      inner += '<ul class="rows">' + p.rows.map((r) => '<li><span>' + esc(r.label) + '</span>' + badge(r.tone, r.stateLabel) + '</li>').join('') + '</ul>';
    }
    inner += '</div>';
  }
  if (m4.inactivePaths.length) inner += '<p class="muted">' + esc(m4.inactiveMessage) + ': ' + esc(m4.inactivePaths.join(', ')) + '</p>';
  inner += basisBlock(m4.basis);
  return '<article class="card tone-' + esc(m4.tone) + '">' + inner + '</article>';
}

function formatCreatedAt(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function renderResult(view) {
  const h = view.headline;
  let out = '<section class="screen result" aria-labelledby="step-title"><p class="stepno">' + esc(COPY.stepLabel(6)) + '</p>';
  out += '<div class="headline tone-' + esc(h.tone) + '" aria-live="polite"><span class="ico" aria-hidden="true">' + ICON[h.tone] + '</span><div>' +
    '<h2 id="step-title" tabindex="-1">' + esc(h.text) + '</h2>' + (h.subtitle ? '<p class="sub">' + esc(h.subtitle) + '</p>' : '') + '</div></div>';
  if (view.footer.versionBanner) out += '<p class="callout tone-unknown" role="status">' + esc(view.footer.versionBanner) + '</p>';
  if (view.workTypeLabel) out += '<p class="muted">' + esc(view.workTypeLabel) + '</p>';

  if (view.confirmItems.length) {
    out += '<section class="block tone-unknown"><h3>' + esc(COPY.confirmTitle) + '</h3><ul class="confirm">' +
      view.confirmItems
        .map((i) =>
          '<li><span>' + esc(i.text) + '</span>' +
          (i.kind === 'INPUT' ? ' <button type="button" class="link" data-action="goto-target" data-target="' + esc(i.target) + '">' + esc(COPY.editInput) + '</button>' : '') + '</li>'
        )
        .join('') + '</ul></section>';
  }
  if (view.targetModules.length) {
    out += '<section class="block"><h3>' + esc(COPY.targetBasisTitle) + '</h3><ul>' +
      view.targetModules.map((t) => '<li>' + esc(t.label) + (t.equipment.length ? ' — ' + esc(t.equipment.join(', ')) : '') + '</li>').join('') + '</ul></section>';
  }
  out += '<section class="block"><h3>' + esc(COPY.detailTitle) + '</h3>' + view.modules.map(moduleCard).join('') + m4Card(view.m4) + '</section>';
  if (view.footer.createdAt) out += '<p class="muted">' + esc(COPY.createdAt) + ': ' + esc(formatCreatedAt(view.footer.createdAt)) + '</p>';
  out += '<p class="scope">' + esc(COPY.scope) + '</p>';
  out += '<div class="nav"><button type="button" class="btn" data-action="edit">' + esc(COPY.editInput) + '</button>' +
    '<button type="button" class="btn" data-action="restart">' + esc(COPY.restart) + '</button></div></section>';
  return out;
}

module.exports = { esc, renderWizard, renderResult, formatCreatedAt };
