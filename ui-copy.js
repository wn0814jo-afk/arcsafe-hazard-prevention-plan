/**
 * ui-copy.js — 화면 문구. UI-DESIGN.md §12의 문구를 그대로 쓴다.
 * §12에 정의되지 않았지만 화면 구성상 꼭 필요한 문구는 "[추가]"로 표시했다(구현 후 검토 요청 대상).
 * 임계값 숫자를 문구에 쓰지 않는다. 법적 안내를 새로 만들지 않는다.
 */
'use strict';

const UNKNOWN_LABEL = '아직 확인 못 함';

const COPY = Object.freeze({
  // §12-1
  appTitle: '유해·위험방지계획서 제출 대상 확인',
  intro: '몇 가지 질문에 답하면 제출 대상 여부를 확인해 드립니다. 답을 모르는 항목은 "아직 확인 못 함"을 고르시면 됩니다.',
  scope: '이 도구는 제조업 등 사업장만 다루며 건설공사 규모기준은 다루지 않습니다.',
  start: '시작하기',
  unknown: UNKNOWN_LABEL,

  // §12-2
  workTypeQ: '이번 작업은 어떤 형태인가요?',
  workTypeOptions: Object.freeze([
    { value: 'new', label: '신설' },
    { value: 'full', label: '전체 이전' },
    { value: 'partial', label: '일부 설비 이전(이설)' },
    { value: 'modify', label: '증설·교체·개조(주요 구조부분 변경)' },
  ]),

  // §12-3
  industryQ: '사업장의 업종이 대상 업종 13개 중 하나인가요?',
  industryListed: '업종 목록에서 선택', // §12의 "(업종 목록에서 선택)" 안내 표기를 선택지 라벨로 옮김
  industryPlaceholder: '업종을 선택해 주세요', // [추가]
  industryNotListed: '13개 목록에 없음',
  contractQ: '사업장의 전기 계약용량은 얼마인가요?',

  // §12-4
  equipInstallQ: '이번에 설치하거나 이전하는 설비 중 해당하는 것을 모두 선택해 주세요.',
  equipNone: '해당 설비 없음',
  equipChangeQ: '이번 작업에 아래 설비가 포함되나요?',
  includeOptions: Object.freeze([
    { value: 'yes', label: '포함됨' },
    { value: 'no', label: '포함 안 됨' },
    { value: 'unknown', label: UNKNOWN_LABEL },
  ]),
  equipNames: Object.freeze({
    melt: '용해로',
    chem: '화학설비',
    dry: '건조설비',
    gas: '가스집합용접장치',
    vent: '유해물질 밀폐·환기·배기설비',
  }),
  yesNo: Object.freeze([
    { value: 'yes', label: '예' },
    { value: 'no', label: '아니오' },
    { value: 'unknown', label: UNKNOWN_LABEL },
  ]),
  meltCapacityQ: '용해로 용량은 얼마인가요?',
  chemMeetsQ: '취급하는 위험물질이 안전보건규칙 별표9의 기준량 이상인가요?',
  chemExcludedQ: '시행령 제43조제2항에서 정한 설비에 해당해 화학설비 대상에서 제외되나요?',
  dryPurposeQ: '건조설비를 어떤 목적으로 사용하나요?',
  dryPurposeOptions: Object.freeze([
    { value: 'organic', label: '유기화합물 건조' },
    { value: 'coating', label: '도료·피막제 도포 후 표면건조(인화성 증기 발생)' },
    { value: 'dust', label: '가연성 분말·분진이 발생하는 건조' },
    { value: 'other', label: '위 세 가지에 해당하지 않음' },
    { value: 'unknown', label: UNKNOWN_LABEL },
  ]),
  m2GrossQ: '이번 작업으로 늘어나는 전기정격용량의 합은 얼마인가요?',
  m2ExcludedQ: '동일 제조사·동일 모델로 교체하는 설비의 정격용량(있다면):',
  m3Q: '옮기는 설비의 전기정격용량 합은 얼마인가요?',
  heatQ: '이번 작업으로 용해로의 열원 종류가 바뀌나요?',
  numberFormatError: '숫자로 입력해 주세요.',

  // §12-5 (이설 M4 안내 — 승인된 고정 문구, 그대로)
  m4NoticeTitle: '대상설비 5종 확인 안내', // [추가] 안내 화면 제목
  m4NoticeLines: Object.freeze([
    '일부 설비 이전(이설) 시 대상설비 5종의 적용 기준이 아직 확정되지 않았습니다.',
    "따라서 이 항목은 '대상 아님'으로 처리하지 않고 '확인 필요'로 남깁니다. 이 항목이 확인되지 않아 전체 판단이 완전하지 않습니다.",
    '이설에 해당하는 경우 관련 기준을 별도로 확인해 주세요.',
  ]),

  // §12-6
  confirmTitle: '확인이 필요한 항목',
  editInput: '입력 수정',
  restart: '처음부터 다시',

  // ---- [추가] §12에 없는 화면 구성 문구 ----------------------------------------------
  prev: '이전', // [추가]
  next: '다음', // [추가]
  showResult: '결과 보기', // [추가]
  stepLabel: (n) => 'STEP ' + n + ' / 6', // [추가]
  errorSummary: '입력을 확인해 주세요.', // [추가]
  targetBasisTitle: '대상 판단 근거', // REPORT-DESIGN §5-B 명칭
  detailTitle: '상세 판정', // REPORT-DESIGN §5-C 명칭
  basisToggle: '근거 보기', // REPORT-DESIGN §5-C
  createdAt: '결과 생성 시각', // [추가]
  unitKw: 'kW',
  unitTon: '톤',
  unitKgH: 'kg/시간',
  unitKg: 'kg',
  unitM3: '㎥/분',

  // [추가] 설비별 세부 질문(§12에는 예시 일부만 있음) — 설비 필드 의미를 그대로 옮긴 최소 문구
  existingQ: (name) => name + '은(는) 이번 작업 전에 이미 대상설비에 해당했나요?',
  chemProductionQ: '생산량 증가 또는 원료·제품 변경을 위해 화학설비를 교체·변경·추가하나요?',
  chemManagedQ: '관리대상 유해물질 취급 설비를 변경해 제어풍속이 낮아지거나 배기량이 늘어나나요?',
  dryHeatQ: '이번 작업으로 건조설비의 열원 종류가 바뀌나요?',
  dryTargetQ: '이번 작업으로 건조 대상물이 바뀌나요?',
  dryNewPurposeQ: '바뀐 건조 대상물의 건조 목적은 무엇인가요?',
  gasPipeQ: '이번 작업으로 가스집합용접장치의 주관 구조가 변경되나요?',
  ventChangeQ: '이번 작업으로 제어풍속이 낮아지거나 배기량이 늘어나나요?',
  dryFuelQ: '건조설비의 연료 사용량은 시간당 얼마인가요?',
  dryPowerQ: '건조설비의 정격소비전력은 얼마인가요?',
  gasQuantityQ: '가스집합용접장치의 가연성가스 저장·취급 수량은 얼마인가요?',
  gasFixedQ: '고정 설치되는 장치인가요?',
  ventCategoryQ: '해당 설비가 다루는 물질 구분은 무엇인가요?',
  ventCategoryOptions: Object.freeze([
    { value: 'cat1', label: '안전검사 절차에 관한 고시 별표1 제7호 유해물질' },
    { value: 'cat2', label: '허가대상·관리대상 유해물질 또는 별표16 분진작업' },
    { value: 'unknown', label: UNKNOWN_LABEL },
  ]),
  ventAirVolumeQ: '배풍량(배기풍량)은 얼마인가요?',
  equipDetailTitle: '선택한 설비의 세부 조건', // [추가]
  changeDetailTitle: '정격용량과 변경 조건', // [추가]
  relocationDetailTitle: '이설 설비의 정격용량', // [추가]
});

module.exports = { COPY };
