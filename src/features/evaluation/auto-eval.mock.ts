import type { EvaluatorOptimizationAction, EvaluatorOptimizationExperiment, EvaluatorOptimizationRow, EvaluatorOptimizationTraceStep } from './evaluation.types';

const MOCK_STAMP = '20261008';
const mockSequence: Record<string, number> = { EVO: 1 };

export const nextMockId = (prefix: string) => {
  mockSequence[prefix] = (mockSequence[prefix] ?? 0) + 1;
  return `${prefix}-${MOCK_STAMP}-${String(mockSequence[prefix]).padStart(3, '0')}`;
};

const row = (item: EvaluatorOptimizationRow): EvaluatorOptimizationRow => item;

const modelTrace = (caseId: string, originalResult: string | number, calibratedResult: string | number, reason: string): EvaluatorOptimizationTraceStep[] => [
  { id: `${caseId}-model-input`, kind: 'input', name: '加载评估上下文', status: '成功', duration: '8 ms', detail: '读取 Input、Expected Output、Agent Output 和人工校准原因，完成变量绑定。', output: '评估输入完整。' },
  { id: `${caseId}-model-call`, kind: 'model', name: '模型逐项判断', status: '成功', duration: '1.2 s', detail: reason, output: `原始评分 ${typeof originalResult === 'number' ? originalResult.toFixed(2) : originalResult}` },
  { id: `${caseId}-model-output`, kind: 'output', name: '解析结构化结果', status: '成功', duration: '11 ms', detail: '校验 score 与 reason 后写入评估结果。', output: `评分 ${typeof originalResult === 'number' ? originalResult.toFixed(2) : originalResult} · 人工校准 ${typeof calibratedResult === 'number' ? calibratedResult.toFixed(2) : calibratedResult}` },
];

const agentTrace = (caseId: string, originalResult: number, calibratedResult: number): EvaluatorOptimizationTraceStep[] => [
  { id: `${caseId}-trace-input`, kind: 'input', name: '读取 Agent 执行上下文', status: '成功', duration: '15 ms', detail: '加载 Input、Agent Output、完整 Trace 和人工校准原因。', output: '识别到 4 个候选 Trace 节点。' },
  { id: `${caseId}-trace-skill`, kind: 'skill', name: 'Trace Span Retrieve', status: '成功', duration: '240 ms', detail: '恢复订单查询、售后政策检索和最终回复节点。', output: '定位到订单查询与退款状态节点。' },
  { id: `${caseId}-trace-tool`, kind: 'tool', name: '订单查询 MCP', status: '成功', duration: '680 ms', detail: '读取订单退款状态、商品状态和售后阶段。', input: '订单号', output: '退款申请已审核，等待原路退回。' },
  { id: `${caseId}-trace-model`, kind: 'model', name: '综合轨迹与工具结果判断', status: '成功', duration: '1.4 s', detail: '模型比较 Agent 声明、Trace 节点和业务终态后生成评分。', output: `原始评分 ${originalResult.toFixed(2)}` },
  { id: `${caseId}-trace-output`, kind: 'output', name: '输出评分与证据引用', status: '成功', duration: '12 ms', detail: '返回 score、reason 和 evidence_refs，并写入评估结果。', output: `评分 ${originalResult.toFixed(2)} · 人工校准 ${calibratedResult.toFixed(2)}` },
];

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

const baseAgentPrompt = `# 评估目标

核查 Agent 是否真实完成了退款、退货或业务查询动作。

# 输入

{{Input}}
{{Agent Output}}
{{Trace}}

# 工作流

1. 读取 Agent Output 和 Trace。
2. 根据 Agent 的完成声明和可见节点给出 0 到 1 的评分。
3. 返回 score、reason 和 evidence_refs。`;

const candidateAgentPrompt = `# 评估目标

核查 Agent 是否真实完成了退款、退货或业务查询动作。

# 输入

{{Input}}
{{Agent Output}}
{{Trace}}

# 工作流

1. 使用 Trace Span Retrieve 恢复关键业务节点。
2. 优先调用订单查询 MCP 读取权威退款状态，不把 Agent 自述当作完成证据。
3. 对金额、运费和例外规则使用 Skill 重新计算。
4. 综合输入、Trace、工具结果和 Agent Output 返回 0 到 1 的评分。
5. 返回 score、reason 和 evidence_refs。`;

const rows: EvaluatorOptimizationRow[] = [
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-HIS-024', cohort: '人工校准',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品未使用且不影响二次销售时，可申请退货。',
    originalResult: 0.25, originalReason: '只覆盖商品完好条件。', calibratedResult: 0.5,
    calibratedReason: '“未使用且不影响二次销售”已经表达商品完好条件，实际覆盖 2 个要点。',
    candidateResult: 0.58, candidateReason: '候选规则识别了语义等价表达。', judgment: '符合人工校准',
    evaluatorTrace: modelTrace('CASE-HIS-024', 0.25, 0.5, '按参考答案原文逐项匹配，只把“商品完好”视为一个覆盖要点。'),
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款政策补充信息验证', caseId: 'CASE-UP-018', cohort: '人工校准',
    input: '退款申请提交后多久能到账？', agentOutput: '退款审核通过后会原路退回，通常需要 3-5 个工作日。',
    originalResult: 0.92, originalReason: '覆盖时效，但省略渠道处理差异。', calibratedResult: 1,
    calibratedReason: '已覆盖审核后、3-5 个工作日、原路退回三个必选要点。',
    candidateResult: 0.98, candidateReason: '候选规则只核对必选要点。', judgment: '符合人工校准',
    evaluatorTrace: modelTrace('CASE-UP-018', 0.92, 1, '把参考答案中的三个必选要点逐项与 Agent Output 进行匹配。'),
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款政策补充信息验证', caseId: 'CASE-UP-018', cohort: '人工校准',
    input: '退款申请提交后多久能到账？', agentOutput: '退款审核通过后会原路退回，一般需要 3-5 个工作日，具体到账时间以支付渠道为准。',
    originalResult: 0.84, originalReason: '表达与参考答案不完全一致。', calibratedResult: 1,
    calibratedReason: '表达不同但语义完整，应按全部覆盖计算。',
    candidateResult: 0.98, candidateReason: '候选规则按语义判断覆盖。', judgment: '符合人工校准',
    evaluatorTrace: modelTrace('CASE-UP-018', 0.84, 1, '检测到“原路退回”和“3-5 个工作日”同时出现，但参考句式的细节差异导致扣分。'),
  }),
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-GEN-011', cohort: '影响检查',
    input: '订单号缺失，帮我查询退款进度。', agentOutput: '请先补充订单号，我再帮你查询退款进度。',
    originalResult: 0.86, originalReason: '满足主要验收要求，但未说明查询入口。',
    candidateResult: 0.86, candidateReason: '候选规则没有改变判断。', judgment: '结果一致',
    evaluatorTrace: modelTrace('CASE-GEN-011', 0.86, 0.86, '核对追问订单号和下一步查询动作，未发现无关扣分。'),
  }),
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-UP-019', cohort: '影响检查',
    input: '跨境订单被海关扣留，还能退款吗？', agentOutput: '请核实订单状态和跨境售后政策，必要时转人工。',
    originalResult: 0.73, originalReason: '方向正确，但缺少具体凭证要求。',
    candidateResult: 0.73, candidateReason: '候选规则没有改变判断。', judgment: '结果一致',
    evaluatorTrace: modelTrace('CASE-UP-019', 0.73, 0.73, '区分政策方向、凭证要求和人工升级三个判断点。'),
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款政策补充信息验证', caseId: 'CASE-HIS-024', cohort: '影响检查',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品完好且不影响二次销售时，可申请退货。',
    originalResult: 0.88, originalReason: '覆盖 4 个主要验收要点。',
    candidateResult: 0.75, candidateReason: '候选规则重新拆分要点后，识别到寄回方式未明确。', judgment: '新增影响',
    evaluatorTrace: modelTrace('CASE-HIS-024', 0.88, 0.88, '重新拆分退货条件后，发现“寄回方式”缺失可能造成新增影响。'),
  }),
];

const agentRows: EvaluatorOptimizationRow[] = [
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-HIS-024', cohort: '人工校准',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品未使用且不影响二次销售时，可申请退货。',
    originalResult: 0.45, originalReason: '回答提到可退货，但没有结合订单和工具返回核验售后状态。', calibratedResult: 0.8,
    calibratedReason: '订单查询显示退款申请已通过，Trace 中存在完整查询节点；回答方向正确，应给较高分。',
    candidateResult: 0.78, candidateReason: '候选评估器读取订单终态并引用了 Trace 证据。', judgment: '符合人工校准',
    evaluatorTrace: agentTrace('CASE-HIS-024', 0.45, 0.8),
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款政策补充信息验证', caseId: 'CASE-UP-018', cohort: '人工校准',
    input: '退款申请提交后多久能到账？', agentOutput: '退款审核通过后会原路退回，通常需要 3-5 个工作日。',
    originalResult: 0.56, originalReason: '只检查回答是否出现退款时效，没有核验审核状态和支付渠道。', calibratedResult: 0.9,
    calibratedReason: '回答覆盖审核后、3-5 个工作日和原路退回，业务终态与回答一致。',
    candidateResult: 0.88, candidateReason: '候选评估器调用订单 MCP 后确认退款状态为已审核。', judgment: '符合人工校准',
    evaluatorTrace: agentTrace('CASE-UP-018', 0.56, 0.9),
  }),
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-UP-019', cohort: '人工校准',
    input: '跨境订单被海关扣留，还能退款吗？', agentOutput: '请核实订单状态和跨境售后政策，必要时转人工。',
    originalResult: 0.38, originalReason: '没有确认是否存在有效退款申请，也未读取人工接管记录。', calibratedResult: 0.76,
    calibratedReason: 'Trace 已转人工，回答提供了核查和升级路径，可以认为部分完成。',
    candidateResult: 0.73, candidateReason: '候选评估器识别工具失败并使用工单终态修正结论。', judgment: '符合人工校准',
    evaluatorTrace: agentTrace('CASE-UP-019', 0.38, 0.76),
  }),
  row({
    taskId: 'TASK-20260922-001', taskName: '退款政策基线验证', caseId: 'CASE-GEN-011', cohort: '影响检查',
    input: '订单号缺失，帮我查询退款进度。', agentOutput: '请先补充订单号，我再帮你查询退款进度。',
    originalResult: 0.82, originalReason: '没有调用订单查询，但正确追问了必要信息。',
    candidateResult: 0.82, candidateReason: '候选评估器没有因为缺少工具结果而错误扣分。', judgment: '结果一致',
    evaluatorTrace: agentTrace('CASE-GEN-011', 0.82, 0.82),
  }),
  row({
    taskId: 'TASK-20260922-002', taskName: '退款政策补充信息验证', caseId: 'CASE-HIS-024', cohort: '影响检查',
    input: '商品签收 3 天后不想要了，还能退吗？', agentOutput: '商品完好且不影响二次销售时，可申请退货。',
    originalResult: 0.77, originalReason: '退款申请仍是待审核状态。',
    candidateResult: 0.74, candidateReason: '候选评估器加入工具终态后保持相近判断。', judgment: '结果一致',
    evaluatorTrace: agentTrace('CASE-HIS-024', 0.77, 0.77),
  }),
];

const modelReportActions: EvaluatorOptimizationAction[] = [
  {
    id: 'EOA-MODEL-001', priority: '优先处理', target: '判断规则',
    title: '按语义核对参考答案要点',
    summary: '将“逐字匹配参考答案”改为“按语义判断条件、动作和数值是否完整覆盖”，允许同义表达命中。',
    reason: '3 条人工校准 Case 中，有 2 条因为表达与参考答案不同而被错误扣分。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-018'], tagIds: ['semantic-equivalent', 'required-point'],
    validation: '重跑 3 条人工校准 Case，候选分数与人工分数误差不超过 0.10。',
  },
  {
    id: 'EOA-MODEL-002', priority: '随后处理', target: '评分边界',
    title: '明确部分覆盖与全部覆盖的计分边界',
    summary: '把“部分覆盖”与“全部覆盖”的分数区间写入判断规则，减少相似回答之间的分数漂移。',
    reason: '同一类语义完整回答出现 0.84、0.92、1.00 等多个分数，评分尺度不稳定。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-018'], tagIds: ['partial-boundary', 'score-offset'],
    validation: '检查同类语义表达是否落在相同的 0.1 分档内。',
  },
  {
    id: 'EOA-MODEL-003', priority: '随后处理', target: '输出约束',
    title: '要求逐项输出覆盖与缺失要点',
    summary: '评分理由必须分别列出已覆盖要点、未覆盖要点和扣分依据，便于回查。',
    reason: '基线理由只给出单句结论，难以判断扣分来自未覆盖、表达差异还是模型判断波动。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-018'], tagIds: ['reason-incomplete'],
    validation: '确认每条校准 Case 都能回查到具体覆盖项和缺失项。',
  },
];

const agentReportActions: EvaluatorOptimizationAction[] = [
  {
    id: 'EOA-AGENT-001', priority: '优先处理', target: '执行流程',
    title: '先查询业务终态，再判断任务是否完成',
    summary: '在读取 Agent Output 后调用订单查询 MCP，读取退款、售后和工单的权威状态，再生成评分。',
    reason: '3 条校准 Case 中，基线评估器主要依赖 Agent 自述或可见文本，没有验证真实业务终态。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-018', 'CASE-UP-019'], tagIds: ['tool-evidence', 'business-state'],
    validation: '重跑 3 条人工校准 Case，要求工具证据被引用且评分误差不超过 0.10。',
  },
  {
    id: 'EOA-AGENT-002', priority: '随后处理', target: '上下文输入',
    title: '明确 Trace 与工具结果的证据优先级',
    summary: '当 Agent Output、Trace 和业务工具结果冲突时，以工具权威终态和关键 Trace 节点为准。',
    reason: '部分 Case 的 Trace 中有工具返回，但评估器仍按 Agent 的完成描述判断。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-019'], tagIds: ['trace-selection', 'source-priority', 'self-report'],
    validation: '构造“Agent 声称完成但工具终态未完成”的对照 Case，确认评分下调。',
  },
  {
    id: 'EOA-AGENT-003', priority: '随后处理', target: 'Skill 内容',
    title: '补充退款规则和金额重算证据',
    summary: '使用业务规则 Skill 复核退款路径、运费责任和例外条件，并保留计算结果作为证据。',
    reason: '现有评估器的判断说明没有记录运费责任和例外规则的计算过程。',
    caseIds: ['CASE-HIS-024', 'CASE-UP-019'], tagIds: ['skill-scope'],
    validation: '确认金额、运费和例外规则均由 Skill 结果支持，而不是模型自行推断。',
  },
];

export const evaluatorOptimizations: EvaluatorOptimizationExperiment[] = [{
  id: 'EVO-20261008-001', name: '参考答案遵从度｜语义覆盖判断', evaluatorId: 'P0-02', evaluatorName: '参考答案遵从度',
  evaluatorKind: '模型评估器', baseVersion: '0.1.0', candidateVersion: '0.1.1 草稿',
  sourceTaskIds: ['TASK-20260922-001', 'TASK-20260922-002'], taskCount: 2, calibrationCount: 3,
  issuePattern: '同义表达被判为未覆盖', frozenAt: '2026-10-08 14:30', baseContent: basePrompt, candidateContent: candidatePrompt,
  changeSummary: '判断要点覆盖时改为比较语义，不再要求与参考答案逐字一致。',
  contract: { target: '判断回答是否覆盖参考答案中的明确要求', inputSemantics: ['Input', 'Expected Output', 'Agent Output'], scoreType: 'numeric', passThreshold: 0.7 },
  rows,
  report: {
    generatedAt: '2026-10-08 14:30',
    summary: ['3 条人工校准均显示参考答案匹配过严。', '候选规则按语义核对覆盖，3/3 条落在人工校准允许误差内。', '2 条回归 Case 保持一致，1 条新增影响等待确认。'],
    attributionTags: [
      { id: 'semantic-equivalent', category: 'Prompt', label: '语义等价表达未识别', count: 2 },
      { id: 'required-point', category: 'Prompt', label: '必选要点判定过严', count: 2 },
      { id: 'partial-boundary', category: 'Prompt', label: '部分覆盖边界不清', count: 1 },
      { id: 'score-offset', category: '模型', label: '分数尺度偏移', count: 2 },
      { id: 'reason-incomplete', category: '模型', label: '评分理由缺少逐项依据', count: 2 },
    ],
    actions: modelReportActions,
  },
  summary: { corrected: 3, unchanged: 2, affected: 1, blocked: 0 }, status: '待确认', createdAt: '2026-10-08 14:30',
}, {
  id: 'EVO-20261007-003', name: 'Trace 证据核查｜工具终态判断', evaluatorId: 'agent-trace-audit', evaluatorName: 'Trace 证据核查',
  evaluatorKind: 'Agent 评估器', baseVersion: '0.1.0', candidateVersion: '0.1.1', savedVersion: '0.1.1',
  sourceTaskIds: ['TASK-20260922-001', 'TASK-20260922-002'], taskCount: 2, calibrationCount: 3,
  issuePattern: '评估器读取了 Trace，但未使用业务工具返回的权威终态', frozenAt: '2026-10-07 16:40', baseContent: baseAgentPrompt, candidateContent: candidateAgentPrompt,
  changeSummary: 'Agent 评估器增加业务终态查询、Trace 证据优先级和退款规则重算步骤。',
  contract: { target: '核查 Agent 是否真实完成退款和售后业务动作', inputSemantics: ['Input', 'Agent Output', 'Trace'], scoreType: 'numeric', passThreshold: 0.8 },
  rows: agentRows,
  report: {
    generatedAt: '2026-10-07 16:40',
    summary: ['风险方向集中在“有 Trace 但未使用工具终态”。', '候选 Agent 评估器增加订单 MCP 查询和 Trace 证据整理。', '3/3 条校准 Case 命中，2 条回归 Case 保持一致。'],
    attributionTags: [
      { id: 'tool-evidence', category: 'Agent', label: '工具证据未被使用', count: 3 },
      { id: 'trace-selection', category: 'Agent', label: 'Trace 节点选择不完整', count: 2 },
      { id: 'source-priority', category: 'Prompt', label: '证据优先级不明确', count: 2 },
      { id: 'business-state', category: '工具', label: '业务终态未核验', count: 2 },
      { id: 'self-report', category: '模型', label: '结论依赖 Agent 自述', count: 1 },
      { id: 'skill-scope', category: 'Skill', label: '业务规则适用范围不清', count: 1 },
    ],
    actions: agentReportActions,
  },
  summary: { corrected: 3, unchanged: 2, affected: 0, blocked: 0 }, status: '已生成版本', createdAt: '2026-10-07 16:40',
}];
