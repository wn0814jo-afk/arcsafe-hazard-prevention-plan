/**
 * app.js — 컨트롤러 (UI-DESIGN.md §1)
 *
 *   Wizard(상태) → buildEngineInput → [evaluate] → Snapshot → buildReportModel → toUserView → Renderer
 *
 * - `evaluate()`를 호출하는 곳은 이 파일(runEvaluation)뿐이다. Wizard·Renderer·Report는 호출하지 않는다.
 * - 컨트롤러가 INDUSTRY_LIST·LAW_BASIS·현재 ruleVersion을 읽어 UI/Report에 인자로 전달한다.
 * - 판정·임계값 비교·보정 로직을 두지 않는다(OPEN-ISSUE-ENGINE-M4-CHEM-EXCLUSION-UNKNOWN 보정 금지 포함).
 * - 상태는 인메모리다(브라우저 저장소 미사용).
 */
'use strict';

const engine = require('./engine.js');
const { LAW_BASIS, INDUSTRY_LIST } = require('./law-basis.js');
const { buildReportModel, toUserView } = require('./report.js');
const model = require('./ui-model.js');
const render = require('./ui-render.js');

function createDeps(overrides) {
  return Object.assign(
    {
      evaluate: engine.evaluate,
      lawBasis: LAW_BASIS,
      industryList: INDUSTRY_LIST,
      currentRuleVersion: engine.RULE_VERSION,
      now: () => new Date().toISOString(),
    },
    overrides || {}
  );
}

/** 상태 → (Engine 입력, Snapshot, ReportModel, UserView). 판정은 Engine만 한다. */
function runEvaluation(state, deps) {
  const input = model.buildEngineInput(state);
  const snapshot = deps.evaluate(input, { now: deps.now() });
  const reportModel = buildReportModel(snapshot, deps.lawBasis, { currentRuleVersion: deps.currentRuleVersion });
  const userView = toUserView(reportModel);
  return { input, snapshot, reportModel, userView };
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

function mount(root, deps) {
  const d = deps || createDeps();
  let state = model.initialState();
  let userView = null;

  function draw(opts) {
    const o = opts || {};
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const keepId = o.keepFocus && active && active.id ? active.id : null;
    root.innerHTML = state.step === 'result' ? render.renderResult(userView) : render.renderWizard(state, { industryList: d.industryList });
    let el = null;
    if (o.focus === 'errsum') el = document.getElementById('errsum');
    else if (o.focus === 'title') el = document.getElementById('step-title');
    else if (keepId) el = document.getElementById(keepId);
    if (el && el.focus) el.focus();
  }

  function goto(step, opts) {
    state.step = step;
    state.errors = [];
    draw(opts || { focus: 'title' });
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
  }

  function next() {
    const step = state.step;
    const errs = model.validateStep(state, step);
    if (errs.length) {
      state.errors = errs;
      draw({ focus: 'errsum' });
      return;
    }
    const steps = model.stepsFor(state);
    const nextStep = steps[steps.indexOf(step) + 1];
    if (!nextStep) return;
    if (nextStep === 'result') userView = runEvaluation(state, d).userView;
    goto(nextStep);
  }

  function prev() {
    const steps = model.stepsFor(state);
    const i = steps.indexOf(state.step);
    if (i > 0) goto(steps[i - 1]);
  }

  function toggleEquip(key, checked) {
    const e = state.equip;
    if (key === 'none' || key === 'unknown') {
      e[key] = checked;
      if (checked) {
        for (const id of model.EQUIP_IDS) e.selected[id] = false;
        e[key === 'none' ? 'unknown' : 'none'] = false;
      }
    } else {
      e.selected[key] = checked;
      if (checked) {
        e.none = false;
        e.unknown = false;
      }
    }
    state.errors = [];
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!t) return;
    const a = t.getAttribute('data-action');
    if (a === 'equip-toggle') return; // change 이벤트에서 처리
    if (a === 'start') goto('workType');
    else if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'edit') goto('workType');
    else if (a === 'restart') {
      state = model.initialState();
      userView = null;
      goto('start');
    } else if (a === 'goto-target') goto(model.stepForTarget(state, t.getAttribute('data-target')));
    else if (a === 'focus-field') {
      ev.preventDefault();
      const c = document.getElementById(t.getAttribute('data-id'));
      const f = c && (c.matches('input,select') ? c : c.querySelector('input:not([disabled]),select:not([disabled])'));
      if (f) f.focus();
    }
  });

  root.addEventListener('input', (ev) => {
    const t = ev.target;
    const p = t.getAttribute && t.getAttribute('data-path');
    if (p && t.type === 'text') setPath(state, p, t.value); // 텍스트 입력은 재렌더 없이 상태만 갱신(포커스 유지)
  });

  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.getAttribute('data-action') === 'equip-toggle') {
      toggleEquip(t.getAttribute('data-key'), t.checked);
      draw({ keepFocus: true });
      return;
    }
    const p = t.getAttribute('data-path');
    if (!p || t.type === 'text') return;
    if (t.type === 'checkbox') {
      setPath(state, p, t.checked);
      if (t.checked && /\.unknown$/.test(p)) setPath(state, p.replace(/\.unknown$/, '.value'), ''); // "모름"이면 입력값 비움
    } else {
      setPath(state, p, t.value);
    }
    if (p === 'workType') state.errors = [];
    draw({ keepFocus: true });
  });

  root.addEventListener('keydown', (ev) => {
    // 키보드 편의: 숫자 입력칸에서 Enter = 다음
    if (ev.key === 'Enter' && ev.target.type === 'text' && state.step !== 'start' && state.step !== 'result') {
      ev.preventDefault();
      next();
    }
  });

  draw({});
  return { getState: () => state };
}

module.exports = { createDeps, runEvaluation, mount };

if (typeof document !== 'undefined' && document.getElementById) {
  const root = document.getElementById('app');
  if (root) mount(root);
}
