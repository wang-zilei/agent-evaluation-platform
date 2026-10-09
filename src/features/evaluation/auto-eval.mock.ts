import type { EvaluatorOptimizationExperiment, EvaluatorOptimizationRow } from './evaluation.types';

const MOCK_STAMP = '20261008';
const mockSequence: Record<string, number> = { EVO: 1 };

export const nextMockId = (prefix: string) => {
  mockSequence[prefix] = (mockSequence[prefix] ?? 0) + 1;
  return `${prefix}-${MOCK_STAMP}-${String(mockSequence[prefix]).padStart(3, '0')}`;
};

const row = (item: EvaluatorOptimizationRow): EvaluatorOptimizationRow => item;

const basePrompt = `# 评估目标

判断 Agent 的实际回答是否满足参考答案中的明确要求。

# 输入

{{Input}}
{{Expected Output}}
{{Agent Output}}

# 输出要求

按参考答案列出的要点逐条核对，统计被覆盖的要点数量。
返回 score 和 reason。只返回 JSON。`;

const candidatePrompt = `# 评估目标

判断 Agent 的实际回答是否满足参考答案中的明确要求。

# 输入

{{Input}}
{{Expected Output}}
{{Agent Output}}

# 判断规则

按语义核对要点是否覆盖，不要求与参考答案逐字一致。
条件、动作或数值实质缺失时，仍判为未覆盖。

# 输出要求

按参考答案列出的要点逐条核对，统计被覆盖的要点数量。
返回 score 和 reason。只返回 JSON。`;

const rows: EvaluatorOptimizationRow[] = [
  row({
    taskId: 'TASK-20260922-001', taskName: '退款客服助手 V3｜退货政策对照组', caseId: 'CASE-HIS-024', cohort: '人工校准',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品未使用且不影响二次销售时，可申请退货。',
    originalResult: 0.25, originalReason: '只覆盖商品完好条件。', calibratedResult: 0.5,
    calibratedReason: '“未使用且不影响二次销售”已经表达商品完好条件，实际覆盖 2 个要点。',
    candidateResult: 0.5, candidateReason: '候选规则识别了语义等价表达。', judgment: '符合人工校准',
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款客服助手 V4｜退货政策实验组 A', caseId: 'CASE-UP-018', cohort: '人工校准',
    input: '退款申请提交后多久能到账？', agentOutput: '退款审核通过后会原路退回，通常需要 3-5 个工作日。',
    originalResult: 0.92, originalReason: '覆盖时效，但省略渠道处理差异。', calibratedResult: 0.98,
    calibratedReason: '已覆盖审核后、3-5 个工作日、原路退回三个必选要点。',
    candidateResult: 0.98, candidateReason: '候选规则只核对必选要点。', judgment: '符合人工校准',
  }),
  row({
    taskId: 'TASK-20260923-003', taskName: '退款客服助手 V5｜简洁回答实验组 B', caseId: 'CASE-UP-018', cohort: '人工校准',
    input: '退款申请提交后多久能到账？', agentOutput: '退款审核通过后会原路退回，一般需要 3-5 个工作日，具体到账时间以支付渠道为准。',
    originalResult: 0.84, originalReason: '表达与参考答案不完全一致。', calibratedResult: 0.98,
    calibratedReason: '表达不同但语义完整，应按全部覆盖计算。',
    candidateResult: 0.98, candidateReason: '候选规则按语义判断覆盖。', judgment: '符合人工校准',
  }),
  row({
    taskId: 'TASK-20260922-001', taskName: '退款客服助手 V3｜退货政策对照组', caseId: 'CASE-GEN-011', cohort: '影响检查',
    input: '订单号缺失，帮我查询退款进度。', agentOutput: '请先补充订单号，我再帮你查询退款进度。',
    originalResult: 0.86, originalReason: '满足主要验收要求，但未说明查询入口。',
    candidateResult: 0.86, candidateReason: '候选规则没有改变判断。', judgment: '结果一致',
  }),
  row({
    taskId: 'TASK-20260923-004', taskName: '退款客服助手 V3｜结果质量对照组', caseId: 'CASE-UP-019', cohort: '影响检查',
    input: '跨境订单被海关扣留，还能退款吗？', agentOutput: '请核实订单状态和跨境售后政策，必要时转人工。',
    originalResult: 0.73, originalReason: '方向正确，但缺少具体凭证要求。',
    candidateResult: 0.73, candidateReason: '候选规则没有改变判断。', judgment: '结果一致',
  }),
  row({
    taskId: 'TASK-20260923-005', taskName: '退款客服助手 V4｜结果质量实验组', caseId: 'CASE-HIS-024', cohort: '影响检查',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品完好且不影响二次销售时，可申请退货。',
    originalResult: 0.88, originalReason: '覆盖 4 个主要验收要点。',
    candidateResult: 0.75, candidateReason: '候选规则重新拆分要点后，识别到寄回方式未明确。', judgment: '新增影响',
  }),
];

const publishedRows: EvaluatorOptimizationRow[] = rows.map((item) => item.judgment === '新增影响' ? {
  ...item,
  candidateResult: item.originalResult,
  candidateReason: '已收紧语义判断边界，未改变该样本原有结论。',
  judgment: '结果一致' as const,
} : item);

export const evaluatorOptimizations: EvaluatorOptimizationExperiment[] = [{
  id: 'EVO-20261008-001', name: '参考答案遵从度｜语义覆盖判断', evaluatorId: 'P0-02', evaluatorName: '参考答案遵从度',
  evaluatorKind: '模型评估器', baseVersion: '0.1.0', candidateVersion: '0.1.1 草稿',
  sourceTaskIds: ['TASK-20260922-001', 'TASK-20260922-002', 'TASK-20260923-003'], taskCount: 3, calibrationCount: 3,
  issuePattern: '同义表达被判为未覆盖', frozenAt: '2026-10-08 14:30', baseContent: basePrompt, candidateContent: candidatePrompt,
  changeSummary: '判断要点覆盖时改为比较语义，不再要求与参考答案逐字一致。',
  contract: { target: '判断回答是否覆盖参考答案中的明确要求', inputSemantics: ['Input', 'Expected Output', 'Agent Output'], scoreType: 'numeric', passThreshold: 0.7 },
  rows, summary: { corrected: 3, unchanged: 2, affected: 1, blocked: 0 }, status: '待确认', createdAt: '2026-10-08 14:30',
}, {
  id: 'EVO-20261007-003', name: '参考答案遵从度｜语义覆盖判断（已发布）', evaluatorId: 'P0-02', evaluatorName: '参考答案遵从度',
  evaluatorKind: '模型评估器', baseVersion: '0.1.0', candidateVersion: '0.1.1', savedVersion: '0.1.1',
  sourceTaskIds: ['TASK-20260922-001', 'TASK-20260922-002', 'TASK-20260923-003'], taskCount: 3, calibrationCount: 3,
  issuePattern: '同义表达被判为未覆盖', frozenAt: '2026-10-07 16:40', baseContent: basePrompt, candidateContent: candidatePrompt,
  changeSummary: '判断要点覆盖时改为比较语义，不再要求与参考答案逐字一致；新增影响已在发布前确认。',
  contract: { target: '判断回答是否覆盖参考答案中的明确要求', inputSemantics: ['Input', 'Expected Output', 'Agent Output'], scoreType: 'numeric', passThreshold: 0.7 },
  rows: publishedRows, summary: { corrected: 3, unchanged: 3, affected: 0, blocked: 0 }, status: '已生成版本', createdAt: '2026-10-07 16:40',
}];
