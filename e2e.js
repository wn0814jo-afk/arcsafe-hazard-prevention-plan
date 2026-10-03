/**
 * e2e.js — 실제 브라우저(Playwright + Chromium) 사용자 여정 검증.
 *   npm run test:e2e   (dist/hazard-prevention-plan.html을 file://로 연다)
 * Playwright는 저장소 의존성이 아니다(전역 설치 사용). 스크린샷은 E2E_SHOTS 경로(기본 ./e2e-shots, git 제외 대상).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findViolations } = require('./forbidden-terms.js');

const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const URL = 'file://' + path.join(__dirname, 'dist', 'hazard-prevention-plan.html');
const SHOTS = process.env.E2E_SHOTS || path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const domChecks = { screens: 0 };

async function domText(page) {
  // 실제 사용자 DOM(속성 포함) — 번들 스크립트/스타일 내용은 제외
  return page.evaluate(() => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll('script,style').forEach((e) => e.remove());
    return c.innerHTML + '\n' + c.innerText;
  });
}
async function scan(page, label) {
  const v = findViolations(await domText(page));
  domChecks.screens++;
  assert.ok(v.length === 0, '[' + label + '] 내부 용어 노출: ' + v.join(', '));
}
async function headline(page) {
  return (await page.locator('#step-title').innerText()).trim();
}
async function next(page, label) {
  await page.getByRole('button', { name: /^(다음|결과 보기)$/ }).click();
  await scan(page, label);
}
async function startFlow(page) {
  await page.getByRole('button', { name: '시작하기' }).click();
}
async function chooseWork(page, label) {
  await page.getByLabel(label, { exact: true }).check();
  await next(page, '작업 형태');
}
async function chooseIndustry(page, kind) {
  if (kind === 'listed') {
    await page.locator('#g-industry-0').check();
    await page.locator('#f-industry-name-input').selectOption({ index: 1 });
  } else if (kind === 'not_listed') await page.locator('#g-industry-1').check();
  else await page.locator('#g-industry-2').check();
  await next(page, '업종');
}
async function fillContract(page, v) {
  await page.getByRole('textbox', { name: '사업장의 전기 계약용량은 얼마인가요?' }).fill(v);
  await next(page, '계약용량');
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
}

async function journey(name, browser, fn, ctxOpts) {
  const context = await browser.newContext(ctxOpts || { viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  try {
    await page.goto(URL);
    await scan(page, name + ' 시작');
    await fn(page);
    assert.deepStrictEqual(errors, [], '브라우저 오류');
    results.push({ name, ok: true });
    console.log('  ✓ ' + name);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log('  ✗ ' + name + '\n      ' + String(e && e.message).split('\n').join('\n      '));
    try {
      await shot(page, 'FAIL-' + name.replace(/[^A-Za-z0-9가-힣]/g, '_'));
    } catch (_) {}
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await pw.chromium.launch();
  const HEAD_TARGET = '유해·위험방지계획서 제출 대상에 해당합니다.';
  const HEAD_UNKNOWN = '대상 여부 확인이 필요합니다.';
  const HEAD_NOT = '입력하신 내용 기준으로는 제출 대상에 해당하지 않습니다.';
  const SUB_PARTIAL = '일부 확인이 필요한 항목이 있습니다.';
  console.log('브라우저 사용자 여정 검증 (' + URL + ')');

  // ---------------- Journey A: 신설 → 용해로 → 유효한 용량 → 결과 ----------------
  await journey('Journey A: 신설 → 용해로 선택 → 용량 입력 → 대상(완전)', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '신설');
    await chooseIndustry(page, 'listed');
    await fillContract(page, '400');
    assert.ok(await page.getByText('STEP 4 / 6').isVisible());
    await page.getByLabel('용해로', { exact: true }).check();
    await next(page, '설비 선택');
    assert.ok(await page.getByText('STEP 5 / 6').isVisible());
    await page.getByRole('textbox', { name: '용해로 용량은 얼마인가요?' }).fill('5');
    await next(page, '용해로 용량');
    assert.strictEqual(await headline(page), HEAD_TARGET);
    assert.strictEqual(await page.locator('.headline .sub').count(), 0, '완전한 대상에는 부제 없음');
    const body = await page.locator('#app').innerText();
    assert.ok(/대상 판단 근거[\s\S]*대상설비 5종 — 용해로/.test(body), '대상 설비가 근거에 표시');
    await page.locator('.basis summary').first().click();
    assert.ok(await page.locator('.basis li strong').first().isVisible(), '근거 펼침');
    await shot(page, 'A-result-target');
  });

  // ---------------- Journey B: 해당 설비 없음 / 모름 / 미선택 ----------------
  await journey('Journey B1: 신설 → 해당 설비 없음 → 대상 아님', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '신설');
    await chooseIndustry(page, 'not_listed');
    await fillContract(page, '100');
    await page.getByLabel('해당 설비 없음').check();
    await next(page, '해당 설비 없음');
    assert.strictEqual(await headline(page), HEAD_NOT);
    assert.ok(!(await page.locator('#app').innerText()).includes('일부 확인이 필요한'));
    await shot(page, 'B1-result-nontarget');
  });
  await journey('Journey B2: 신설 → 설비 "아직 확인 못 함" → 확인 필요 (equipment:{} 함정 없음)', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '신설');
    await chooseIndustry(page, 'not_listed');
    await fillContract(page, '100');
    await page.getByLabel('아직 확인 못 함').check();
    await next(page, '설비 모름');
    assert.strictEqual(await headline(page), HEAD_UNKNOWN);
    const body = await page.locator('#app').innerText();
    assert.ok(body.includes('확인이 필요한 항목'));
    assert.ok(!body.includes(HEAD_NOT), '확인 필요가 대상 아님으로 새지 않음');
    await shot(page, 'B2-result-unknown');
  });
  await journey('Journey B3: 신설 → 설비를 아무것도 고르지 않고 다음 → 진행 차단(빈 equipment로 NOT_TARGET이 되지 않음)', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '신설');
    await chooseIndustry(page, 'not_listed');
    await fillContract(page, '100');
    await page.getByRole('button', { name: '결과 보기' }).click();
    assert.ok(await page.locator('#errsum').isVisible(), '오류 요약 표시');
    assert.ok(await page.getByText('STEP 4 / 6').isVisible(), '같은 단계에 머묾');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'errsum', '오류 요약으로 포커스 이동');
    await scan(page, '설비 미선택 오류');
    await shot(page, 'B3-blocked');
  });

  // ---------------- Journey C: 증설 "포함 안 됨"+"모름" 혼합 ----------------
  async function modifyToChange(page, gross) {
    await startFlow(page);
    await chooseWork(page, '증설·교체·개조(주요 구조부분 변경)');
    await chooseIndustry(page, 'listed');
    await fillContract(page, '400');
    const pick = async (legend, opt) => page.getByRole('group', { name: legend, exact: true }).getByLabel(opt, { exact: true }).check();
    await pick('용해로', '포함 안 됨');
    await pick('화학설비', '포함 안 됨');
    await pick('건조설비', '아직 확인 못 함');
    await pick('가스집합용접장치', '아직 확인 못 함');
    await pick('유해물질 밀폐·환기·배기설비', '아직 확인 못 함');
    await next(page, '증설 설비 포함 여부');
    await page.locator('#f-m2-gross-input').fill(gross);
    await page.locator('#f-m2-excluded-input').fill('0');
    await next(page, '증설 정격용량');
  }
  await journey('Journey C1: 증설 → 포함 안 됨+모름 혼합 → 확인 필요', browser, async (page) => {
    await modifyToChange(page, '50');
    assert.strictEqual(await headline(page), HEAD_UNKNOWN);
    const body = await page.locator('#app').innerText();
    assert.ok(/대상설비 5종[\s\S]*확인 필요/.test(body));
    assert.ok(body.includes('이번 작업 유형에는 적용되지 않음'), '해당 없는 모듈/경로는 적용 안 됨으로 표시');
    assert.ok(/건조설비: 세부 조건 입력이 필요합니다\./.test(body), '모름으로 둔 설비가 확인 필요 항목에 표시');
    await shot(page, 'C1-result-unknown');
  });
  await journey('Journey C2: 증설 → 정격용량 충족 + 설비 일부 모름 → 대상 + 일부 확인 필요', browser, async (page) => {
    await modifyToChange(page, '150');
    assert.strictEqual(await headline(page), HEAD_TARGET);
    assert.strictEqual((await page.locator('.headline .sub').innerText()).trim(), SUB_PARTIAL);
    await shot(page, 'C2-result-target-incomplete');
  });
  await journey('Journey C3: 증설 → 확인 필요 항목의 "입력 수정" 링크가 해당 질문으로 이동', browser, async (page) => {
    await modifyToChange(page, '50');
    await page.getByRole('button', { name: '입력 수정' }).first().click();
    assert.ok(await page.getByText('STEP 4 / 6').isVisible(), '설비 포함 여부 단계로 이동(증설의 장비 질문)');
  });

  // ---------------- Journey D: 부분 이설 ----------------
  async function relocation(page, industry, contract, kw) {
    await startFlow(page);
    await chooseWork(page, '일부 설비 이전(이설)');
    await chooseIndustry(page, industry);
    await fillContract(page, contract);
    assert.ok(await page.getByText('STEP 5 / 6').isVisible(), '이설은 STEP 3 다음에 STEP 5로 이동(STEP 4 생략)');
    const body = await page.locator('#app').innerText();
    assert.ok(!body.includes('설치하거나 이전하는 설비') && !body.includes('용해로'), '설비 입력 질문 없음');
    await page.getByRole('textbox', { name: '옮기는 설비의 전기정격용량 합은 얼마인가요?' }).fill(kw);
    await next(page, '이설 정격용량');
    assert.ok(await page.getByRole('heading', { name: '대상설비 5종 확인 안내' }).isVisible(), 'M4 안내 화면');
    const notice = await page.locator('#app').innerText();
    assert.ok(notice.includes('일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.'));
    await page.getByRole('button', { name: '결과 보기' }).click();
    await scan(page, '이설 결과');
  }
  await journey('Journey D1: 부분 이설 → STEP 4 생략 → M3 입력 → 안내 → 결과(대상 아님으로 끝나지 않음)', browser, async (page) => {
    await relocation(page, 'listed', '400', '150');
    const h = await headline(page);
    assert.notStrictEqual(h, HEAD_NOT);
    const body = await page.locator('#app').innerText();
    assert.ok(body.includes('일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.'));
    assert.ok(body.includes("'대상 아님'으로 처리하지 않고 '확인 필요'로 남깁니다."));
    await shot(page, 'D1-result-relocation');
  });
  await journey('Journey D2: 부분 이설 → 정격용량·업종 조건이 모두 작아도 대상 아님이 나오지 않음', browser, async (page) => {
    await relocation(page, 'not_listed', '10', '1');
    assert.strictEqual(await headline(page), HEAD_UNKNOWN);
    assert.ok(!(await page.locator('#app').innerText()).includes(HEAD_NOT));
    await shot(page, 'D2-result-relocation-unknown');
  });

  // ---------------- Journey E: 키보드만으로 조작 ----------------
  async function tabTo(page, pred, max) {
    for (let i = 0; i < (max || 40); i++) {
      await page.keyboard.press('Tab');
      const ok = await page.evaluate(pred);
      if (ok) return;
    }
    throw new Error('Tab으로 대상에 도달하지 못함: ' + pred);
  }
  const nameOf = (txt) => `(() => { const e = document.activeElement; const n = (e.labels && e.labels[0] ? e.labels[0].innerText : e.innerText || '').trim(); return n === ${JSON.stringify(txt)}; })()`;
  await journey('Journey E: 키보드만으로 입력·다음·이전·오류 처리', browser, async (page) => {
    await tabTo(page, nameOf('시작하기'));
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'step-title', '단계 전환 시 제목으로 포커스');
    // 작업 형태 — 라디오 하나 선택(스페이스), 다음(엔터)
    await tabTo(page, nameOf('신설'));
    await page.keyboard.press('Space');
    await tabTo(page, nameOf('다음'));
    await page.keyboard.press('Enter');
    // 업종 — 방향키로 "13개 목록에 없음" 선택
    await tabTo(page, `document.activeElement.name === 'g-industry'`);
    await page.keyboard.press('ArrowDown');
    assert.ok(await page.locator('#g-industry-1').isChecked(), '방향키로 라디오 선택');
    await tabTo(page, nameOf('다음'));
    await page.keyboard.press('Enter');
    // 계약용량 — 빈 값으로 Enter → 오류 요약, 포커스 이동
    await tabTo(page, `document.activeElement.id === 'f-contract-input'`);
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('#errsum').isVisible());
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'errsum');
    // 오류 요약의 링크 → 해당 입력으로 이동
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'f-contract-input', '오류 링크로 입력칸 포커스');
    await page.keyboard.type('100');
    await page.keyboard.press('Enter');
    // 설비 — 해당 설비 없음 체크(스페이스)
    await tabTo(page, nameOf('해당 설비 없음'));
    await page.keyboard.press('Space');
    assert.ok(await page.locator('#eq-none').isChecked());
    // 이전(엔터) → 계약용량으로 돌아간 뒤 다시 다음
    await tabTo(page, nameOf('이전'));
    await page.keyboard.press('Enter');
    assert.ok(await page.getByText('STEP 3 / 6').isVisible(), '키보드로 이전 단계 이동');
    assert.strictEqual(await page.locator('#f-contract-input').inputValue(), '100', '이전으로 돌아가도 입력값 유지');
    await page.locator('#f-contract-input').focus();
    await page.keyboard.press('Enter');
    await tabTo(page, nameOf('결과 보기'));
    await page.keyboard.press('Enter');
    assert.strictEqual(await headline(page), HEAD_NOT);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'step-title');
    // 결과 화면의 모든 버튼이 키보드로 도달 가능
    await tabTo(page, nameOf('처음부터 다시'));
    await page.keyboard.press('Enter');
    assert.ok(await page.getByRole('button', { name: '시작하기' }).isVisible(), '처음부터 다시');
  });

  // ---------------- 접근성 마크업(실제 DOM) ----------------
  await journey('접근성: 모든 입력에 라벨, 라디오 그룹에 legend, 포커스 표시, 오류 aria', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '증설·교체·개조(주요 구조부분 변경)');
    await chooseIndustry(page, 'listed');
    await fillContract(page, '400');
    const audit = () =>
      page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('input,select').forEach((e) => {
          if (!e.labels || e.labels.length === 0) bad.push('라벨 없음: ' + (e.id || e.name));
        });
        document.querySelectorAll('input[type=radio]').forEach((e) => {
          if (!e.closest('fieldset') || !e.closest('fieldset').querySelector('legend')) bad.push('legend 없음: ' + (e.id || e.name));
        });
        return bad;
      });
    assert.deepStrictEqual(await audit(), []);
    await page.getByRole('button', { name: '다음' }).click(); // 미선택 오류
    assert.ok(await page.locator('fieldset.has-error [id^="err-"]').first().isVisible());
    assert.ok((await page.locator('fieldset.has-error').first().getAttribute('aria-describedby')).startsWith('err-'));
    // 실제 키보드(Tab)로 버튼에 도달했을 때의 포커스 표시를 확인한다(focus-visible은 키보드 조작에서만 적용됨)
    await tabTo(page, `document.activeElement.classList.contains('primary')`);
    const outline = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement);
      return cs.outlineStyle + ' ' + cs.outlineWidth;
    });
    assert.ok(outline.startsWith('solid') && parseFloat(outline.split(' ')[1]) >= 2, '키보드 포커스 표시: ' + outline);
    assert.ok((await page.locator('html').getAttribute('lang')) === 'ko');
  });

  // ---------------- 모바일 폭 ----------------
  const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  await journey('모바일(390px): 신설 용해로 여정 + 가로 스크롤/터치 크기', browser, async (page) => {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const small = () =>
      page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('button,.opt,input[type=text],select,summary').forEach((e) => {
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.height < 43.5) bad.push((e.id || e.className || e.tagName) + ':' + Math.round(r.height));
        });
        return bad;
      });
    await shot(page, 'M-start');
    assert.ok((await overflow()) <= 0, '가로 스크롤 없음(시작)');
    await page.getByRole('button', { name: '시작하기' }).tap();
    await page.getByLabel('신설', { exact: true }).check();
    assert.deepStrictEqual(await small(), [], '터치 영역 44px 이상(작업 형태)');
    await page.getByRole('button', { name: '다음' }).tap();
    await page.locator('#g-industry-0').check();
    await page.locator('#f-industry-name-input').selectOption({ index: 1 });
    await page.getByRole('button', { name: '다음' }).tap();
    await page.getByRole('textbox', { name: '사업장의 전기 계약용량은 얼마인가요?' }).fill('400');
    await page.getByRole('button', { name: '다음' }).tap();
    await shot(page, 'M-equip');
    assert.ok((await overflow()) <= 0, '가로 스크롤 없음(설비 선택)');
    assert.deepStrictEqual(await small(), [], '터치 영역 44px 이상(설비)');
    await page.getByLabel('용해로', { exact: true }).check();
    await page.getByRole('button', { name: '다음' }).tap();
    await page.getByRole('textbox', { name: '용해로 용량은 얼마인가요?' }).fill('5');
    await page.getByRole('button', { name: '결과 보기' }).tap();
    await scan(page, '모바일 결과');
    assert.strictEqual(await headline(page), HEAD_TARGET);
    assert.ok((await overflow()) <= 0, '가로 스크롤 없음(결과)');
    await shot(page, 'M-result-target');
    assert.ok(await page.getByRole('button', { name: '처음부터 다시' }).isVisible());
  }, MOBILE);
  await journey('모바일(390px): 부분 이설 결과(확인 필요 안내)', browser, async (page) => {
    await startFlow(page);
    await chooseWork(page, '일부 설비 이전(이설)');
    await chooseIndustry(page, 'listed');
    await fillContract(page, '400');
    await page.getByRole('textbox', { name: '옮기는 설비의 전기정격용량 합은 얼마인가요?' }).fill('150');
    await next(page, '이설 용량');
    await shot(page, 'M-m4-notice');
    await page.getByRole('button', { name: '결과 보기' }).tap();
    await scan(page, '모바일 이설 결과');
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    await shot(page, 'M-result-relocation');
  }, MOBILE);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n브라우저 검증: 총 ' + results.length + '개 여정 중 통과 ' + (results.length - failed.length) + ', 실패 ' + failed.length + ' (DOM 내부 용어 검사 화면 ' + domChecks.screens + '건)');
  console.log('스크린샷: ' + SHOTS);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
