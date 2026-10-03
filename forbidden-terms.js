/**
 * forbidden-terms.js — 사용자 화면(DOM)에 나타나면 안 되는 내부 용어. tests-ui.js(문자열)와 e2e.js(실제 브라우저 DOM)가 공유한다.
 */
'use strict';

const FORBIDDEN_SUBSTR = [
  'OPEN-ISSUE', 'RULE-CONTRACT', 'ENGINE-DESIGN', 'REPORT-DESIGN', 'UI-DESIGN', 'reason', 'NOTICE_', 'DECREE_', 'PSM_', 'openItems', 'note', 'LEGAL SOURCE',
  '저장소', 'finalStatus', 'determinationCompleteness', 'moduleResults', 'equipmentResults', 'applicability', 'unresolvedLegalIssue', 'legalBasis', 'ruleVersion',
  'engineVersion', 'snapshotId', 'inputsUsed', 'ruleId', 'ruleContractRef', 'meltingFurnace', 'chemicalEquipment', 'dryingEquipment', 'gasWeldingAssembly',
  'ventilation', 'withinListedIndustries', 'existingTarget', 'excludedByDecree', 'ORGANIC_COMPOUND', 'OTHER_NOT_IN_ARTICLE3', 'COMBUSTIBLE_DUST', 'COATING_FLAMMABLE',
  'PARTIAL_RELOCATION', 'FULL_RELOCATION', 'MODIFICATION', 'M4-', 'DECREE', 'NOTICE',
];
const FORBIDDEN_WORD = /\b(NOT_TARGET|TARGET|UNKNOWN|INCOMPLETE|COMPLETE|APPLICABLE|NOT_APPLICABLE_TO_WORK_TYPE)\b/;

/** @returns {string[]} 발견된 위반 목록(비어 있으면 통과) */
function findViolations(html) {
  const out = [];
  for (const t of FORBIDDEN_SUBSTR) if (html.includes(t)) out.push('금지 용어 "' + t + '"');
  const m = html.match(FORBIDDEN_WORD);
  if (m) out.push('내부 상태명 "' + m[0] + '"');
  return out;
}

module.exports = { FORBIDDEN_SUBSTR, FORBIDDEN_WORD, findViolations };
