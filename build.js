/**
 * build.js — 단일 배포 HTML 생성기 (의존성 없음)
 *
 *   node build.js  →  dist/hazard-prevention-plan.html
 *
 * engine.js / law-basis.js / data.js(기존 계약, 수정 없음)와 report.js / ui-*.js / app.js를
 * 한 파일로 묶는다. 각 파일은 작은 CommonJS 래퍼 안에서 실행된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist', 'hazard-prevention-plan.html');

// 의존 순서(require는 래퍼가 해결하므로 순서는 중요하지 않지만 가독성을 위해 정렬)
const MODULES = ['data.js', 'law-basis.js', 'engine.js', 'report.js', 'ui-model.js', 'ui-copy.js', 'ui-render.js', 'app.js'];

function buildHtml() {
  const defs = MODULES.map((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // </script> 시퀀스가 소스에 있으면 HTML이 깨지므로 방지
    if (/<\/script/i.test(src)) throw new Error(f + ': </script 시퀀스를 포함할 수 없습니다');
    return "'./" + f + "': function (module, exports, require) {\n" + src + '\n}';
  }).join(',\n');

  const runtime =
    '(function () {\n' +
    'var defs = {\n' + defs + '\n};\n' +
    'var cache = {};\n' +
    'function req(name) {\n' +
    "  var key = name.indexOf('./') === 0 ? name : './' + name;\n" +
    "  if (!/\\.js$/.test(key)) key += '.js';\n" +
    '  if (cache[key]) return cache[key].exports;\n' +
    "  if (!defs[key]) throw new Error('module not found: ' + name);\n" +
    '  var m = { exports: {} };\n' +
    '  cache[key] = m;\n' +
    '  defs[key].call(m.exports, m, m.exports, req);\n' +
    '  return m.exports;\n' +
    '}\n' +
    "req('./app.js');\n" +
    '})();';

  const css = fs.readFileSync(path.join(ROOT, 'ui.css'), 'utf8');
  return (
    '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>유해·위험방지계획서 제출 대상 확인</title>\n<style>\n' + css + '</style>\n</head>\n<body>\n' +
    '<main id="app"></main>\n<script>\n' + runtime + '\n</script>\n</body>\n</html>\n'
  );
}

module.exports = { buildHtml, OUT };

if (require.main === module) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buildHtml(), 'utf8');
  console.log('built', path.relative(ROOT, OUT), fs.statSync(OUT).size + ' bytes');
}
