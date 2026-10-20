import { demoComparisons, demoDataset, demoEvaluators, demoExperiments, demoTasks } from './evaluation-demo';
import { evaluatorOptimizations } from './auto-eval.mock';
import {
  financialComplianceAgent,
  financialComplianceDataset,
  financialComplianceEvaluators,
  financialComplianceHistoryConversations,
  financialComplianceTasks,
} from './financial-compliance.mock';
import {
  QUERY_AGENT_AGENT_VERSION,
  QUERY_AGENT_CORE_EVALUATOR_IDS,
  QUERY_AGENT_DATASET_ID,
  createQueryAgentResults,
  queryAgentAgents,
  queryAgentDataset,
  queryAgentEvaluators,
  queryAgentHistoryConversations,
} from './query-agent.mock';
import type {
  AgentMcpConnection,
  AgentSkillBinding,
  AgentOption,
  AgentConfigSnapshot,
  CaseResult,
  ComparisonRecord,
  ComparisonCaseRow,
  ComparisonEvaluatorRow,
  ComparisonMetricCell,
  ComparisonRuntimeRow,
  ComparisonTaskRef,
  Dataset,
  EvaluationState,
  EvaluationTask,
  Evaluator,
  EvaluatorResult,
  FieldDefinition,
  HistoryConversation,
  HistoryTraceRecord,
  HumanLabelDefinition,
  OptimizeExperiment,
  OptimizationResult,
  ScoreType,
  TraceEvent,
} from './evaluation.types';

const field = (id: string, name: string, semantic: FieldDefinition['semantic'], description: string, required = false): FieldDefinition => ({ id, name, semantic, description, required });

const trace = (events: TraceEvent[]): TraceEvent[] => events.map((event, index) => ({ ...event, input: event.input ?? (index === 0 ? 'Case 输入与运行上下文' : '上游节点输出'), output: event.output ?? (event.status === '失败' ? '无有效输出' : event.detail), error: event.error ?? (event.status === '失败' ? event.detail : undefined), tokens: event.tokens ?? 120 + index * 86 }));

const baseTrace = trace([
  { id: 't1', type: 'system', name: '接收用户输入', status: '成功', duration: '18 ms', detail: '解析为 1 条用户消息，检测到退款意图。' },
  { id: 't2', type: 'retrieval', name: '知识库检索 · 退款政策', status: '成功', duration: '620 ms', detail: '命中 4 条知识片段，最高相关度 0.91。' },
  { id: 't3', type: 'tool', name: '订单查询', status: '成功', duration: '388 ms', detail: 'order_id=OD202608180042，返回物流状态与商品状态。' },
  { id: 't4', type: 'agent', name: '生成最终回答', status: '成功', duration: '1.8 s', detail: '基于检索片段和订单信息生成回复。' },
]);

const failedTrace = trace([
  { id: 'f1', type: 'system', name: '接收用户输入', status: '成功', duration: '15 ms', detail: '解析为跨境订单退款咨询。' },
  { id: 'f2', type: 'tool', name: '订单查询', status: '失败', duration: '4.2 s', detail: '订单服务超时，未返回有效订单信息。' },
  { id: 'f3', type: 'agent', name: '生成最终回答', status: '跳过', duration: '未采集', detail: '依赖的订单信息不可用，未生成有效回答。' },
]);

const result = (
  evaluatorId: string,
  evaluatorName: string,
  scoreType: Evaluator['scoreType'],
  status: EvaluatorResult['evaluationStatus'],
  reason: string,
  _evidence: string[],
  evidenceRefs: string[],
  score?: number,
): EvaluatorResult => ({
  evaluatorId,
  evaluatorName,
  evaluatorVersion: '0.1.0',
  attemptId: 'attempt-1',
  scoreType,
  evaluationResult: scoreType === 'numeric' ? (score ?? 0) : status === '通过' ? '通过' : status,
  evaluationReason: evaluatorId.startsWith('code-') ? '' : reason,
  evaluationStatus: status,
  traceRefs: evidenceRefs,
  evaluationKind: evaluatorId.startsWith('code-') ? '代码评估' : '模型评估器',
  diagnostics: evaluatorId.startsWith('code-') ? (status === '通过' ? [] : [{ code: 'CHECK_FAILED', message: reason, path: '$.agent_output' }]) : undefined,
  observations: evaluatorId.startsWith('code-') ? { checks: status === '通过' ? 1 : 0, failed: status === '通过' ? 0 : 1 } : undefined,
});

const runtime = (status: CaseResult['status'], duration: string, firstTokenLatency = '620 ms', inputTokens = 2400, outputTokens = 600, evaluatorDuration = '2.8 s'): CaseResult['runtime'] => ({
  runStatus: status,
  agentDuration: duration,
  firstTokenLatency,
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
  evaluatorDuration,
});

const withRuntime = (item: unknown): CaseResult => { const value = item as CaseResult & { duration?: string }; const badcase = ['CASE-HIS-024', 'CASE-UP-019', 'CASE-GEN-011', 'CASE-FILE-002', 'CASE-FAIL-001', 'CASE-HISTORY-006'].includes(value.caseId); return { ...value, caseMark: value.caseMark ?? (badcase ? 'Badcase' : undefined), runtime: value.runtime ?? runtime(value.status, value.duration ?? '未采集') }; };

const refundResults: CaseResult[] = [
  {
    caseId: 'CASE-HIS-024',
    status: '不通过',
    duration: '12.6 s',
    input: '商品签收 3 天后不想要了，还能退吗？',
    expectedOutput: '说明 7 天无理由退货、商品完好条件、寄回方式和运费承担。',
    agentOutput: '商品未使用且不影响二次销售时，可申请退货。',
    userFeedback: '没有说明寄回方式和运费承担。',
    agentConfiguration: '退款客服助手 V3 · 知识库：售后政策 · 工具：订单查询',
    trace: baseTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '不通过', '回答没有覆盖用户做决定所需的完整退货条件。', ['Agent Output 缺少寄回方式和运费承担'], ['t4'], 0),
      result('P0-02', '参考答案遵从度', 'numeric', '不通过', '仅覆盖商品完好条件，未满足参考答案中的 4 个要点。', ['Expected Output 约定了 4 个回答要点', 'Agent Output 只覆盖 1 个要点'], ['t4'], 0.25),
      result('P0-03', '指令遵循', 'pass_fail', '通过', '回答语气、格式和售后政策边界符合 Agent 配置。', ['Agent Configuration', 'Agent Output'], ['t4'], 1),
      result('P0-05', '检索相关性', 'numeric', '通过', '检索片段都围绕 7 天无理由和商品状态，未发现明显无关内容。', ['4 条命中片段均与退款政策相关'], ['t2'], 0.92),
      result('P0-07', '回答忠实度', 'numeric', '通过', '回答中的“商品未使用且不影响二次销售”可被检索片段直接支持。', ['售后政策片段 #refund-02'], ['t2', 't4'], 0.96),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '通过', '先检索政策再查询订单，路径合理；主要问题来自回答覆盖不足。', ['无重复工具调用', 'Trace 顺序完整'], ['t1', 't2', 't3', 't4'], 0.88),
      result('code-required-fields', '必填字段完整性', 'numeric', '不通过', '缺少 return_method 和 shipping_cost。', ['required_fields'], ['t4'], 0.5),
    ],
  },
  {
    caseId: 'CASE-UP-018',
    status: '通过',
    duration: '8.4 s',
    input: '退款申请提交后多久能到账？',
    expectedOutput: '说明审核通过后的到账时效和原路退回规则。',
    agentOutput: '退款审核通过后，通常会在 3-5 个工作日内原路退回；具体到账时间以银行或支付渠道处理为准。',
    agentConfiguration: '退款客服助手 V3 · 知识库：售后政策 · 工具：订单查询',
    trace: baseTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '通过', '直接回答到账时间，并补充了渠道差异。', ['Agent Output 覆盖时效和原路退回'], ['t4'], 1),
      result('P0-02', '参考答案遵从度', 'numeric', '通过', '覆盖审核通过、3-5 个工作日和原路退回三个要点。', ['Expected Output 要点全部出现'], ['t4'], 0.98),
      result('P0-03', '指令遵循', 'pass_fail', '通过', '没有承诺超出政策边界的确定性时间。', ['“通常”“以渠道处理为准”'], ['t4'], 1),
      result('P0-05', '检索相关性', 'numeric', '通过', '检索内容集中于退款时效。', ['命中退款时效片段'], ['t2'], 0.97),
      result('P0-07', '回答忠实度', 'numeric', '通过', '回答中的时效表述被知识库片段完整支持。', ['售后政策片段 #refund-05'], ['t2', 't4'], 0.98),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '通过', '问题简单，检索一次后直接回答，没有多余调用。', ['一步检索后生成回答'], ['t1', 't2', 't4'], 0.95),
    ],
  },
  {
    caseId: 'CASE-GEN-011',
    status: '证据不足',
    duration: '未采集',
    input: '订单号缺失，帮我查询退款进度。',
    expectedOutput: '提示用户补充订单号，不应直接执行订单查询。',
    agentOutput: '',
    agentConfiguration: '退款客服助手 V3 · 知识库：售后政策 · 工具：订单查询',
    trace: trace([
      { id: 'g1', type: 'system', name: '接收用户输入', status: '成功', duration: '12 ms', detail: '检测到退款进度查询，但未发现订单号。' },
    ]),
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '无法执行', 'Agent Output 缺失，无法判断任务是否完成。', ['缺少 Agent Output'], ['g1']),
      result('P0-02', '参考答案遵从度', 'numeric', '无法执行', '评估器必需的 Agent Output 不存在。', ['缺少 Agent Output'], ['g1']),
      result('P0-03', '指令遵循', 'pass_fail', '无法执行', '缺少最终回答和完整 Trace。', ['Trace 只有输入解析节点'], ['g1']),
      result('P0-05', '检索相关性', 'numeric', '证据不足', '未发生检索，不能把“未检索”解释为相关性得分。', ['没有检索节点'], ['g1']),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '证据不足', 'Trace 在输入解析后终止，缺少足够执行证据。', ['Trace 不完整'], ['g1']),
    ],
  },
  {
    caseId: 'CASE-UP-019',
    status: '执行失败',
    duration: '4.2 s',
    input: '跨境订单被海关扣留，还能退款吗？',
    expectedOutput: '说明需要先核实订单状态和跨境售后政策，必要时转人工。',
    agentOutput: '订单查询暂时不可用，请稍后重试。',
    agentConfiguration: '退款客服助手 V3 · 知识库：售后政策 · 工具：订单查询',
    trace: failedTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '执行失败', '订单查询依赖失败，Agent 未能完成必要的政策判断。', ['工具节点失败', '最终回答为系统错误提示'], ['f2', 'f3']),
      result('P0-03', '指令遵循', 'pass_fail', '证据不足', '没有足够 Trace 证明失败后的转人工规则是否生效。', ['Trace 在工具失败后终止'], ['f2']),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '执行失败', '关键工具调用超时，导致执行链路中断。', ['订单查询 4.2 s 超时'], ['f1', 'f2', 'f3']),
    ],
  },
].map(withRuntime);

const automationResults: CaseResult[] = refundResults.map((item, index) => ({
  ...item,
  caseId: `SESSION-AUTO-${String(index + 1).padStart(3, '0')}`,
  userFeedback: undefined,
  evaluatorResults: item.evaluatorResults.filter((result) => ['P0-07', 'P0-12'].includes(result.evaluatorId)),
}));

const comparisonResult = (
  source: CaseResult,
  status: CaseResult['status'],
  agentOutput: string,
  duration: string,
  firstTokenLatency: string,
  inputTokens: number,
  outputTokens: number,
  scores: Record<string, { status: EvaluatorResult['evaluationStatus']; score?: number; reason: string }>,
): CaseResult => ({
  ...source,
  status,
  agentOutput,
  duration,
  runtime: runtime(status, duration, firstTokenLatency, inputTokens, outputTokens, status === '执行失败' ? '1.1 s' : '2.2 s'),
  evaluatorResults: [
    result('P0-01', '任务完成度', 'pass_fail', scores['P0-01'].status, scores['P0-01'].reason, ['Agent Output', 'Expected Output'], ['t4'], scores['P0-01'].score),
    result('P0-02', '参考答案遵从度', 'numeric', scores['P0-02'].status, scores['P0-02'].reason, ['Expected Output', 'Agent Output'], ['t4'], scores['P0-02'].score),
    result('P0-05', '检索相关性', 'numeric', scores['P0-05'].status, scores['P0-05'].reason, ['Trace'], ['t2'], scores['P0-05'].score),
    result('P0-12', 'Agent 轨迹质量', 'numeric', scores['P0-12'].status, scores['P0-12'].reason, ['Trace'], ['t1', 't2', 't3', 't4'], scores['P0-12'].score),
  ],
});

const comparisonBaseResults: CaseResult[] = [
  comparisonResult(refundResults[0], '不通过', '商品未使用且不影响二次销售时，可申请退货。', '12.6 s', '1.18 s', 2280, 460, {
    'P0-01': { status: '不通过', score: 0, reason: '未说明寄回方式和运费承担。' },
    'P0-02': { status: '不通过', score: 0.25, reason: '只覆盖商品完好条件。' },
    'P0-05': { status: '通过', score: 0.92, reason: '检索内容与退货政策相关。' },
    'P0-12': { status: '通过', score: 0.88, reason: '先检索政策，再生成回答。' },
  }),
  comparisonResult(refundResults[1], '通过', '退款审核通过后，通常会在 3-5 个工作日内原路退回；具体到账时间以银行或支付渠道处理为准。', '8.4 s', '760 ms', 2140, 520, {
    'P0-01': { status: '通过', score: 1, reason: '覆盖到账时效和原路退回规则。' },
    'P0-02': { status: '通过', score: 0.98, reason: '覆盖全部验收要点。' },
    'P0-05': { status: '通过', score: 0.97, reason: '检索内容集中于退款时效。' },
    'P0-12': { status: '通过', score: 0.95, reason: '一次检索后直接回答。' },
  }),
  comparisonResult(refundResults[2], '通过', '请先补充订单号，我再帮你查询退款进度。', '6.2 s', '610 ms', 1860, 310, {
    'P0-01': { status: '通过', score: 1, reason: '正确要求补充订单号。' },
    'P0-02': { status: '通过', score: 0.86, reason: '满足主要验收要求，但未说明查询入口。' },
    'P0-05': { status: '证据不足', reason: '该 Case 不需要检索。' },
    'P0-12': { status: '通过', score: 0.82, reason: '识别缺少订单号后停止查询。' },
  }),
  comparisonResult(refundResults[3], '通过', '跨境订单可先核实订单状态和跨境售后政策；如仍无法退款，可转人工处理。', '10.8 s', '940 ms', 2460, 580, {
    'P0-01': { status: '通过', score: 1, reason: '覆盖核实、跨境政策和转人工。' },
    'P0-02': { status: '通过', score: 0.73, reason: '覆盖方向正确，但缺少具体凭证要求。' },
    'P0-05': { status: '通过', score: 0.9, reason: '检索内容与跨境售后相关。' },
    'P0-12': { status: '通过', score: 0.84, reason: '工具异常后仍完成政策兜底。' },
  }),
];

const comparisonExperimentResults: CaseResult[] = [
  comparisonResult(refundResults[0], '通过', '可以。商品签收后 7 天内，商品完好且不影响二次销售即可申请无理由退货。请在订单详情中提交退货，审核通过后按页面提示寄回；无理由退货通常由买家承担寄回运费，质量问题由商家承担。', '9.8 s', '720 ms', 2320, 690, {
    'P0-01': { status: '通过', score: 1, reason: '覆盖退货条件、寄回方式和运费承担。' },
    'P0-02': { status: '通过', score: 0.88, reason: '覆盖 4 个主要验收要点。' },
    'P0-05': { status: '通过', score: 0.94, reason: '检索片段覆盖退货条件和运费规则。' },
    'P0-12': { status: '通过', score: 0.91, reason: '检索政策并补充运费工具结果。' },
  }),
  comparisonResult(refundResults[1], '通过', '退款审核通过后会原路退回，通常需要 3-5 个工作日。', '10.2 s', '830 ms', 2210, 430, {
    'P0-01': { status: '通过', score: 1, reason: '回答到账时效。' },
    'P0-02': { status: '通过', score: 0.92, reason: '覆盖时效，但省略渠道处理差异。' },
    'P0-05': { status: '通过', score: 0.96, reason: '检索内容与退款时效相关。' },
    'P0-12': { status: '通过', score: 0.89, reason: '路径正确，但多一次无效订单查询。' },
  }),
  comparisonResult(refundResults[2], '通过', '请提供订单号。补充后我可以继续查询退款进度。', '5.8 s', '540 ms', 1790, 280, {
    'P0-01': { status: '通过', score: 1, reason: '要求补充必要信息。' },
    'P0-02': { status: '通过', score: 0.84, reason: '满足主要要求，缺少下一步说明。' },
    'P0-05': { status: '证据不足', reason: '该 Case 不需要检索。' },
    'P0-12': { status: '通过', score: 0.86, reason: '识别输入不足后停止查询。' },
  }),
  comparisonResult(refundResults[3], '执行失败', '', '58.4 s', '2.10 s', 2380, 0, {
    'P0-01': { status: '执行失败', reason: '订单查询超时，未生成有效回答。' },
    'P0-02': { status: '执行失败', reason: '缺少 Agent Output。' },
    'P0-05': { status: '证据不足', reason: '检索完成，但最终执行失败。' },
    'P0-12': { status: '执行失败', reason: '关键工具调用超时。' },
  }),
];

const tenderResults: CaseResult[] = [
  {
    caseId: 'CASE-FILE-001',
    status: '通过',
    duration: '26.1 s',
    input: '请分析招标文件，输出供应商评分报告，并交付一份可下载的 Excel。',
    expectedOutput: '报告覆盖资格条件、技术评分、商务评分、风险项，并交付可打开的 Excel 文件。',
    agentOutput: '已完成招标文件分析，报告包含资格条件、技术评分、商务评分和风险项。已生成《供应商评分报告.xlsx》。',
    agentConfiguration: '招标文件评估助手 V1 · Skill：文档分析 · 工具：PDF 解析、表格生成',
    trace: trace([
      { id: 'tf1', type: 'system', name: '接收文件与任务', status: '成功', duration: '25 ms', detail: '识别 2 个 PDF 文件。' },
      { id: 'tf2', type: 'skill', name: '加载 Skill · 文档分析', status: '成功', duration: '42 ms', detail: '激活文档分析和表格交付指令。' },
      { id: 'tf3', type: 'tool', name: 'PDF 解析', status: '成功', duration: '8.6 s', detail: '解析 86 页，提取 127 个评分条款。' },
      { id: 'tf4', type: 'tool', name: '生成 Excel', status: '成功', duration: '4.2 s', detail: '生成 1 个 xlsx 文件，包含 4 个工作表。' },
      { id: 'tf5', type: 'agent', name: '生成交付说明', status: '成功', duration: '2.9 s', detail: '说明分析范围、文件名和下载入口。' },
    ]),
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '通过', '四类评分项和文件交付均完成。', ['Agent Output 明确列出覆盖范围和文件名'], ['tf4', 'tf5'], 1),
      result('P0-04', '文件交付质量', 'numeric', '通过', '文件可打开，工作表结构清晰，覆盖要求中的四类评分项。', ['xlsx 校验通过', '4 个工作表', '127 个评分条款'], ['tf3', 'tf4'], 0.94),
      result('P0-08', '网页检索质量', 'numeric', '证据不足', '该 Case 未要求网页检索，评估器不适用。', ['Input 未要求网页来源'], ['tf1']),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '通过', '先激活 Skill，再解析文件和生成表格，顺序符合任务依赖。', ['工具与 Skill 顺序合理'], ['tf1', 'tf2', 'tf3', 'tf4', 'tf5'], 0.97),
    ],
  },
].map(withRuntime);

const failureResults: CaseResult[] = [
  {
    caseId: 'CASE-FAIL-001',
    status: '执行失败',
    duration: '60 s',
    input: '请查询订单 OD202608180099 的退款状态。',
    agentOutput: '',
    agentConfiguration: '退款客服助手 V2 · 工具：订单查询',
    trace: failedTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '执行失败', '订单查询超时，无法完成任务。', ['订单查询节点超时'], ['f2']),
      result('P0-10', '工具参数正确性', 'pass_fail', '证据不足', '工具调用未返回有效结果，无法完整判断参数影响。', ['工具节点无有效响应'], ['f2']),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '执行失败', '执行链路在关键工具节点中断。', ['订单查询超时'], ['f1', 'f2', 'f3']),
    ],
  },
].map(withRuntime);

const evaluatorPrompt = (name: string, variables: string, output: string): string => `# 评估目标\n\n判断 ${name} 是否满足当前 Case 的明确要求。\n\n# 输入\n\n${variables}\n\n# 输出要求\n\n${output}\n只返回 JSON，不输出 Markdown、思考过程、分析过程、草稿或额外字段。`;

const evaluatorDefinitions: Array<Pick<Evaluator, 'id' | 'name' | 'purpose' | 'category' | 'scoreType' | 'variables'>> = [
  { id: 'P0-01', name: '任务完成度', purpose: '判断用户任务是否整体完成。', category: '结果质量', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-02', name: '参考答案遵从度', purpose: '判断实际回答是否满足参考答案或明确验收要求。', category: '结果质量', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }] },
  { id: 'P0-03', name: '指令遵循', purpose: '判断 Agent 是否遵守生效的 Agent 指令和用户要求。', category: '结果质量', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-04', name: '文件交付质量', purpose: '判断生成或交付文件的有效性、覆盖度、结构和可用性。', category: '文件与交付', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-05', name: '检索相关性', purpose: '判断知识库检索内容是否真正与用户问题相关。', category: '知识库检索', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-06', name: '检索完整性', purpose: '判断检索结果是否覆盖当前问题明确要求的关键事实。', category: '知识库检索', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Trace', semantic: 'Trace', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: false }] },
  { id: 'P0-07', name: '回答忠实度', purpose: '判断最终回答中的事实和结论是否得到实际检索内容支持。', category: '知识库检索', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: false }] },
  { id: 'P0-08', name: '网页检索质量', purpose: '判断网页搜索或网页读取过程是否支持最终结果。', category: '网页与来源', scoreType: 'numeric', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-09', name: '工具选择正确性', purpose: '判断是否选择了适合任务的工具，以及是否避免了明显不必要的工具。', category: '工具调用', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-10', name: '工具参数正确性', purpose: '判断工具调用参数是否符合任务要求和工具定义。', category: '工具调用', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-11', name: '工具结果利用正确性', purpose: '判断 Agent 是否正确使用工具返回结果并反映到最终输出。', category: '工具调用', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Trace', semantic: 'Trace', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }] },
  { id: 'P0-12', name: 'Agent 轨迹质量', purpose: '基于完整 Trace 判断整体执行路径质量。', category: '过程质量', scoreType: 'numeric', variables: [{ name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-13', name: 'Skill 选择正确性', purpose: '判断是否选择并激活了适合任务的 Skill。', category: 'Skill', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
  { id: 'P0-14', name: 'Skill 指令遵循', purpose: '判断 Skill 激活后是否遵守其指令和约束。', category: 'Skill', scoreType: 'pass_fail', variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }] },
];

export const agents: AgentOption[] = [
  ...queryAgentAgents,
  financialComplianceAgent,
  { id: 'agent-refund', name: '退款客服助手', versions: ['V4', 'V3', 'V2'], description: '处理退款政策、申请进度和售后咨询。', source: '万智', protocol: '实时上报' },
  { id: 'agent-tender', name: '招标文件评估助手', versions: ['V1'], description: '分析招标文件并生成结构化评分报告。', source: '外部', protocol: '框架适配' },
  { id: 'agent-research', name: '网页研究助手', versions: ['V2', 'V1'], description: '基于网页检索完成带来源的研究任务。', source: '万智', protocol: '实时上报' },
  { id: 'agent-external-service', name: '外部客服助手', versions: ['V1'], description: '处理账户、订单和售后服务问题。', source: '外部', protocol: '数据库转换' },
];

const replayTrace = (id: string, name: string, summary: string, input: string, agentOutput: string, userFeedback: string, occurredAt: string): HistoryTraceRecord => ({ id, name, summary, input, agentOutput, userFeedback, occurredAt });

const historyConversation = (id: string, title: string, occurredAt: string, agentId: string, agentVersion: string, traces: HistoryTraceRecord[]): HistoryConversation => ({ id, title, occurredAt, agentId, agentVersion, traces });

export const historyConversations: HistoryConversation[] = [
  historyConversation('SESSION-20260827-001', '商品签收 3 天后不想要了，还能退吗？', '2026-08-27 09:18', 'agent-refund', 'V3', [
    replayTrace('TRACE-27001-A', '第 1 轮', '询问 7 天无理由退货条件', '商品签收 3 天后不想要了，还能退吗？', '商品未使用且不影响二次销售时，可申请退货。', '用户点踩：没有说明寄回方式和运费承担。', '2026-08-27 09:18'),
    replayTrace('TRACE-27001-B', '第 2 轮', '补充订单号后追问运费', '订单号 OD202608180042，运费谁承担？', '退货运费一般由买家承担，质量问题除外。', '', '2026-08-27 09:22'),
  ]),
  historyConversation('SESSION-20260827-002', '退款申请提交后多久能到账？', '2026-08-27 11:06', 'agent-refund', 'V3', [
    replayTrace('TRACE-27002-A', '第 1 轮', '查询退款到账时效', '退款申请提交后多久能到账？', '审核通过后通常 3-5 个工作日原路退回。', '', '2026-08-27 11:06'),
  ]),
  historyConversation('SESSION-20260826-003', '我已经提交退款申请，为什么还没有到账？', '2026-08-26 16:02', 'agent-refund', 'V3', [
    replayTrace('TRACE-26003-A', '第 1 轮', '未核实订单状态直接回复时效', '我已经提交退款申请，为什么还没有到账？', '退款申请一般会在审核通过后的 3-5 个工作日内原路退回。', '用户点踩：没有先核实订单号和当前审核状态。', '2026-08-26 16:02'),
    replayTrace('TRACE-26003-B', '第 2 轮', '用户补充订单号', '订单号是 OD202608180099。', '正在查询该订单的审核状态。', '', '2026-08-26 16:05'),
    replayTrace('TRACE-26003-C', '第 3 轮', '返回审核中状态', '查到了吗？', '当前仍在审核中，请等待审核结果。', '', '2026-08-26 16:07'),
  ]),
  historyConversation('SESSION-20260826-004', '怎么在订单详情里申请退货？', '2026-08-26 10:28', 'agent-refund', 'V3', [
    replayTrace('TRACE-26004-A', '第 1 轮', '说明退货入口', '怎么在订单详情里申请退货？', '打开订单详情后，选择申请售后即可提交退货。', '', '2026-08-26 10:28'),
  ]),
  historyConversation('SESSION-20260825-005', '跨境订单退款一直失败，应该怎么办？', '2026-08-25 15:46', 'agent-refund', 'V3', [
    replayTrace('TRACE-25005-A', '第 1 轮', '未给出转人工路径', '跨境订单退款一直失败，应该怎么办？', '请核实订单状态和支付渠道后再重试。', '用户点踩：未说明转人工路径。', '2026-08-25 15:46'),
    replayTrace('TRACE-25005-B', '第 2 轮', '追问人工客服入口', '那怎么转人工？', '可在售后页选择联系客服。', '', '2026-08-25 15:49'),
  ]),
  historyConversation('SESSION-20260825-006', '退货要包装完好吗？', '2026-08-25 09:12', 'agent-refund', 'V3', [
    replayTrace('TRACE-25006-A', '第 1 轮', '说明商品完好条件', '退货要包装完好吗？', '需保持商品完好、不影响二次销售。', '', '2026-08-25 09:12'),
  ]),
  historyConversation('SESSION-20260824-007', '质量问题退货运费谁出？', '2026-08-24 18:31', 'agent-refund', 'V3', [
    replayTrace('TRACE-24007-A', '第 1 轮', '质量问题运费规则', '质量问题退货运费谁出？', '因质量问题退货，运费由商家承担。', '用户点赞。', '2026-08-24 18:31'),
    replayTrace('TRACE-24007-B', '第 2 轮', '确认凭证要求', '需要提供开箱视频吗？', '建议保留开箱记录，便于售后审核。', '', '2026-08-24 18:33'),
  ]),
  historyConversation('SESSION-20260824-008', '可以只退其中一个商品吗？', '2026-08-24 11:08', 'agent-refund', 'V3', [
    replayTrace('TRACE-24008-A', '第 1 轮', '部分退货说明', '可以只退其中一个商品吗？', '支持按商品申请部分退货。', '', '2026-08-24 11:08'),
  ]),
  historyConversation('SESSION-20260823-009', '退款被拒后还能再申请吗？', '2026-08-23 20:14', 'agent-refund', 'V3', [
    replayTrace('TRACE-23009-A', '第 1 轮', '再次申请规则', '退款被拒后还能再申请吗？', '可以补充凭证后再次提交售后申请。', '用户点赞。', '2026-08-23 20:14'),
  ]),
  historyConversation('SESSION-20260823-010', '货已寄回，怎么查看物流？', '2026-08-23 13:40', 'agent-refund', 'V3', [
    replayTrace('TRACE-23010-A', '第 1 轮', '查询退货物流', '货已寄回，怎么查看物流？', '在售后详情页可查看退货物流进度。', '', '2026-08-23 13:40'),
    replayTrace('TRACE-23010-B', '第 2 轮', '未更新物流的处理', '物流两天没更新正常吗？', '可能存在中转延迟，建议再等待 24 小时。', '', '2026-08-23 13:42'),
  ]),
  historyConversation('SESSION-20260822-011', '七天无理由包含拆封商品吗？', '2026-08-22 16:55', 'agent-refund', 'V3', [
    replayTrace('TRACE-22011-A', '第 1 轮', '拆封商品是否可退', '七天无理由包含拆封商品吗？', '不影响二次销售的拆封商品仍可申请。', '用户点踩：没有说明例外类目。', '2026-08-22 16:55'),
  ]),
  historyConversation('SESSION-20260821-012', '如何取消已经提交的退货申请？', '2026-08-21 08:47', 'agent-refund', 'V3', [
    replayTrace('TRACE-21012-A', '第 1 轮', '撤销售后申请', '如何取消已经提交的退货申请？', '在售后详情中选择撤销申请即可。', '', '2026-08-21 08:47'),
    replayTrace('TRACE-21012-B', '第 2 轮', '撤销后是否影响额度', '撤销后还能再申请吗？', '可以，撤销不占用后续申请次数。', '', '2026-08-21 08:50'),
  ]),
  historyConversation('SESSION-20260810-013', '上个月的订单还能退吗？', '2026-08-10 19:03', 'agent-refund', 'V3', [
    replayTrace('TRACE-10013-A', '第 1 轮', '超期退货咨询', '上个月的订单还能退吗？', '超过 7 天无理由期限后，需按质量问题申请。', '用户点赞。', '2026-08-10 19:03'),
  ]),
  historyConversation('SESSION-20260826-014', '订单查询超时后怎么处理？', '2026-08-26 12:11', 'agent-refund', 'V2', [
    replayTrace('TRACE-26014-A', '第 1 轮', '工具超时兜底', '订单查询一直转圈，还能退款吗？', '订单查询暂时不可用，请稍后重试。', '用户点踩：没有给替代路径。', '2026-08-26 12:11'),
  ]),
  historyConversation('SESSION-20260824-015', 'V2 如何查看退款进度？', '2026-08-24 09:36', 'agent-refund', 'V2', [
    replayTrace('TRACE-24015-A', '第 1 轮', '退款进度入口', '怎么查看退款进度？', '在订单详情的售后记录中查看。', '', '2026-08-24 09:36'),
  ]),
  historyConversation('SESSION-20260825-016', '请分析招标文件并输出评分报告', '2026-08-25 14:20', 'agent-tender', 'V1', [
    replayTrace('TRACE-25016-A', '第 1 轮', '解析招标文件', '请分析招标文件，输出供应商评分报告。', '已完成资格、技术和商务评分项提取。', '', '2026-08-25 14:20'),
    replayTrace('TRACE-25016-B', '第 2 轮', '生成 Excel 交付', '请把结果导出成 Excel。', '已生成《供应商评分报告.xlsx》。', '用户点赞。', '2026-08-25 14:26'),
  ]),
  historyConversation('SESSION-20260822-017', '帮我检索竞品退款政策并总结', '2026-08-22 17:48', 'agent-research', 'V2', [
    replayTrace('TRACE-22017-A', '第 1 轮', '网页检索退款政策', '帮我检索竞品退款政策并总结差异。', '已检索 4 个来源，并整理到账时效差异。', '', '2026-08-22 17:48'),
  ]),
  ...financialComplianceHistoryConversations,
  ...queryAgentHistoryConversations,
];

export const evaluators: Evaluator[] = evaluatorDefinitions.map((item) => ({
  ...item,
  kind: '模型评估器',
  mode: 'preset',
  version: '0.1.0',
  versions: ['0.1.0'],
  description: item.purpose,
  model: item.scoreType === 'numeric' ? 'Doubao-Seed-1.6' : 'Doubao-Seed-1.6-flash',
  prompt: evaluatorPrompt(item.name, item.variables.map((variable) => `{{${variable.name}}}：${variable.semantic === variable.name ? '按字段语义自动绑定' : variable.semantic}`).join('\n'), item.scoreType === 'numeric' ? '返回 score（0 到 1 的数字）和 reason。' : '返回 result（通过或不通过）和 reason。'),
  creator: '系统',
  updatedAt: '2026-08-25 18:20',
  runCount: 128 + Number(item.id.slice(-2)) * 7,
  passThreshold: item.scoreType === 'numeric' ? (item.id === 'P0-02' ? 0.7 : 0.8) : undefined,
}));

evaluators.push({
  id: 'custom-relevance',
  name: '客服回答相关性',
  kind: '模型评估器',
  mode: 'custom',
  version: '0.0.3',
  versions: ['0.0.1', '0.0.2', '0.0.3'],
  description: '判断客服回答是否紧扣用户问题，没有引入无关解释。',
  purpose: '用于客服回归任务的自定义相关性检查。',
  category: '自建评估器',
  scoreType: 'numeric',
  model: 'Doubao-Seed-1.6',
  prompt: '# 评估目标\n\n判断客服回答是否紧扣用户问题。\n\n# 输入\n\n{{Input}}\n{{Agent Output}}\n\n# 输出要求\n\n返回 0 到 1 的 score 和 reason。只返回 JSON，不输出 Markdown、思考过程、分析过程、草稿或额外字段。',
  variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }],
  creator: '王子磊',
  updatedAt: '2026-08-24 14:12',
  runCount: 42,
  passThreshold: 0.7,
});

const codeEvaluator = (
  id: string,
  name: string,
  category: string,
  description: string,
  scope: string,
  notFor: string,
  scoreType: ScoreType,
  implementation: '内置规则' | 'Python' | 'JavaScript',
  variables: Evaluator['variables'],
  rules: Array<{ condition: string; output: string }>,
  outputExample: string,
  code: string,
  dependencies: string,
  runCount: number,
): Evaluator => ({
  id,
  name,
  kind: '代码评估',
  mode: 'preset',
  version: '0.1.0',
  versions: ['0.1.0'],
  description,
  purpose: scope,
  category,
  scoreType,
  model: '规则执行器',
  prompt: '',
  variables,
  implementation,
  code,
  scope,
  notFor,
  rules,
  outputExample,
  dependencies,
  creator: '系统',
  updatedAt: '2026-09-24 10:00',
  runCount,
});

const actualOutput = { name: 'Agent Output', semantic: 'Agent Output' as const, required: true };
const traceInput = { name: 'Trace', semantic: 'Trace' as const, required: true };

evaluators.push(
  codeEvaluator('code-json-schema', 'JSON Schema 校验', '格式与结构', '检查结构化输出是否符合指定 Schema。', '字段、类型、枚举、必填项和嵌套结构。', '不判断字段内容是否正确或完整。', 'pass_fail', 'Python', [actualOutput, { name: 'schema', semantic: 'Custom', required: true }], [
    { condition: '输出可解析且符合 Schema', output: '通过' },
    { condition: '存在类型、必填项或结构错误', output: '不通过，并返回逐项路径' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "SCHEMA_TYPE_MISMATCH",\n    "path": "$.items[0].quantity",\n    "expected": "integer",\n    "actual": "string"\n  }],\n  "observations": { "valid_paths": 7, "total_paths": 8 }\n}`, 'def evaluate(ctx):\\n    errors = validate(ctx.actual_output.json(), ctx.config.schema)\\n    return EvalResult.from_errors(errors)', 'Python 标准库 + jsonschema', 126),
  codeEvaluator('code-required-fields', '必填字段完整性', '格式与结构', '统计必填字段覆盖率并定位缺失字段。', 'JSON、工单和结构化报告的固定字段。', '不判断已有字段的内容质量。', 'numeric', '内置规则', [actualOutput, { name: 'required_fields', semantic: 'Custom', required: true }], [
    { condition: '全部必填字段存在', output: '1.0' },
    { condition: '部分字段缺失', output: '按存在字段数 / 必填字段数计分' },
    { condition: '输出无法解析', output: '执行失败' },
  ], `{\n  "check": "completed",\n  "value": 0.67,\n  "diagnostics": [{\n    "code": "MISSING_REQUIRED_FIELD",\n    "path": "$.required_fields",\n    "expected": "array",\n    "actual": "undefined"\n  }],\n  "observations": { "matched": 2, "total": 3 }\n}`, 'required = ctx.config.required_fields\\nactual = ctx.actual_output.json()\\nmissing = [key for key in required if key not in actual]\\nreturn EvalResult.ratio(len(required) - len(missing), len(required), missing)', '内置规则', 98),
  codeEvaluator('code-json-parse', 'JSON 可解析校验', '格式与结构', '检查输出是否为可解析的合法 JSON。', '去除代码围栏后解析 JSON，并保留错误位置。', '不校验业务字段和内容语义。', 'pass_fail', '内置规则', [actualOutput], [
    { condition: '输出可解析', output: '通过' },
    { condition: '存在语法错误或多个顶层对象', output: '不通过，并返回行列位置' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "JSON_PARSE_ERROR",\n    "location": { "line": 4, "column": 18 },\n    "message": "Unexpected token }"\n  }]\n}`, 'text = strip_code_fence(ctx.actual_output.text)\\nreturn EvalResult.parse_json(text)', '内置规则', 74),
  codeEvaluator('code-markdown-structure', 'Markdown 结构校验', '格式与结构', '检查标题层级、必备章节和表格结构。', '报告、方案、纪要等 Markdown 交付物。', '不判断章节内容是否正确。', 'pass_fail', 'Python', [actualOutput, { name: 'outline', semantic: 'Custom', required: true }], [
    { condition: '必备章节齐备且标题层级连续', output: '通过' },
    { condition: '缺章节、跳级或表格列数错误', output: '不通过，并定位块位置' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "MISSING_SECTION",\n    "location": { "line": 22 },\n    "expected": "## 风险与依赖",\n    "actual": "## 总结"\n  }]\n}`, 'doc = parse_markdown(ctx.actual_output.text)\\nmissing = diff_outline(doc.headings, ctx.config.outline)\\nreturn EvalResult.from_errors(missing)', 'Python 标准库 + markdown-it', 63),
  codeEvaluator('code-regex-rule', '正则规则校验', '内容与约束', '按包含、排除或格式正则检查输出。', '编号、日期、订单号、固定格式和禁用模式。', '不进行同义改写或语义判断。', 'pass_fail', 'JavaScript', [actualOutput, { name: 'patterns', semantic: 'Custom', required: true }], [
    { condition: '所有 include 规则命中且 exclude 规则未命中', output: '通过' },
    { condition: '任一规则不满足', output: '不通过，并返回匹配片段' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "REGEX_NOT_MATCHED",\n    "pattern": "CASE-\\\\d{4}",\n    "actual": "case 2048"\n  }]\n}`, 'const failed = ctx.config.patterns.filter(rule => !matches(rule, ctx.actual_output.text))\\nreturn EvalResult.fromErrors(failed)', 'JavaScript RegExp', 85),
  codeEvaluator('code-banned-phrases', '禁用词与敏感表述', '内容与约束', '检测禁用词、敏感词和越界承诺。', '合规词库、承诺性措辞和指定禁用表达。', '不判断上下文中的合理引用或反例。', 'pass_fail', '内置规则', [actualOutput, { name: 'banned_terms', semantic: 'Custom', required: true }], [
    { condition: '未命中禁用表达', output: '通过' },
    { condition: '命中任一禁用表达', output: '不通过，并记录词项与位置' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "BANNED_TERM_FOUND",\n    "term": "百分之百成功",\n    "location": { "line": 2, "column": 14 }\n  }]\n}`, 'hits = find_banned_terms(ctx.actual_output.text, ctx.config.banned_terms)\\nreturn EvalResult.from_errors(hits)', '内置词库匹配', 58),
  codeEvaluator('code-length-boundary', '输出长度边界', '内容与约束', '检查字符、行数、Token 或文件体积限制。', '标题、摘要、表格、模型输出和上传产物。', '不判断内容是否啰嗦或冗余。', 'pass_fail', '内置规则', [actualOutput, { name: 'limits', semantic: 'Custom', required: true }], [
    { condition: '所有指标位于配置范围', output: '通过' },
    { condition: '任一指标越界', output: '不通过，并返回实测值' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "LIMIT_EXCEEDED",\n    "metric": "tokens",\n    "expected": "<= 800",\n    "actual": 936\n  }]\n}`, 'metrics = measure_output(ctx.actual_output, ctx.config.limits)\\nreturn EvalResult.within_limits(metrics)', '内置计数器', 47),
  codeEvaluator('code-duplicate-content', '重复内容检测', '内容与约束', '识别重复句、循环文本和模板化段落。', '长回答、报告段落和工具生成文本。', '不判断必要的术语重复。', 'numeric', 'Python', [actualOutput], [
    { condition: '无重复段落', output: '1.0' },
    { condition: '出现重复或循环内容', output: '按非重复内容占比计分' },
  ], `{\n  "check": "completed",\n  "value": 0.78,\n  "diagnostics": [{\n    "code": "DUPLICATE_BLOCK",\n    "location": { "start_line": 9, "end_line": 12 },\n    "matches": 3\n  }],\n  "observations": { "duplicate_ratio": 0.22 }\n}`, 'blocks = split_blocks(ctx.actual_output.text)\\nunique = deduplicate_by_similarity(blocks)\\nreturn EvalResult.ratio(len(unique), len(blocks))', 'Python 标准库', 41),
  codeEvaluator('code-tool-arguments', '工具参数 Schema 校验', '工具与轨迹', '检查每次工具调用的参数结构和类型。', 'Trace 中的工具名、参数、必填项和枚举值。', '不判断工具是否适合当前任务。', 'pass_fail', 'Python', [traceInput, { name: 'tool_schemas', semantic: 'Custom', required: true }], [
    { condition: '所有工具调用符合参数 Schema', output: '通过' },
    { condition: '工具名或参数不符合定义', output: '不通过，并定位调用序号' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "TOOL_ARG_TYPE_MISMATCH",\n    "call_index": 2,\n    "tool": "query_order",\n    "path": "$.order_id",\n    "expected": "string",\n    "actual": "number"\n  }]\n}`, 'errors = validate_tool_calls(ctx.trace.tool_calls, ctx.config.tool_schemas)\\nreturn EvalResult.from_errors(errors)', 'Python 标准库 + jsonschema', 52),
  codeEvaluator('code-tool-sequence', '工具调用顺序校验', '工具与轨迹', '按允许状态机检查工具调用先后关系。', '查询、确认、写入等有依赖顺序的工具链。', '不评价未定义的跨工具语义关系。', 'pass_fail', 'Python', [traceInput, { name: 'workflow', semantic: 'Custom', required: true }], [
    { condition: '调用序列符合状态机', output: '通过' },
    { condition: '跳步、逆序或调用未授权工具', output: '不通过，并返回违规边' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "INVALID_TOOL_TRANSITION",\n    "from": "submit_refund",\n    "to": "query_order",\n    "allowed": ["finish"]\n  }]\n}`, 'path = [call.name for call in ctx.trace.tool_calls]\\nreturn EvalResult.from_errors(check_workflow(path, ctx.config.workflow))', 'Python 标准库', 36),
  codeEvaluator('code-sql-syntax', 'SQL 语法校验', '代码与性能', '解析 SQL 并检查语法与危险语句。', '生成 SQL、查询片段和只读数据提取语句。', '不执行 SQL，也不判断查询结果是否正确。', 'pass_fail', 'Python', [actualOutput, { name: 'dialect', semantic: 'Custom', required: true }], [
    { condition: '语法有效且不含禁用语句', output: '通过' },
    { condition: '解析失败或包含写操作', output: '不通过，并返回语句位置' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "SQL_WRITE_STATEMENT",\n    "statement": "UPDATE",\n    "location": { "line": 1, "column": 1 }\n  }]\n}`, 'errors = parse_sql(ctx.actual_output.sql, ctx.config.dialect)\\nreturn EvalResult.from_errors(errors)', 'Python 标准库 + sqlglot', 29),
  codeEvaluator('code-latency-budget', '响应时延阈值', '代码与性能', '检查端到端或单节点耗时是否超阈值。', 'Trace 时延、工具耗时和流式首字耗时。', '不解释超时原因。', 'pass_fail', '内置规则', [traceInput, { name: 'thresholds', semantic: 'Custom', required: true }], [
    { condition: '所有耗时指标未超阈值', output: '通过' },
    { condition: '任一指标超阈值', output: '不通过，并返回预算差值' },
  ], `{\n  "check": "failed",\n  "diagnostics": [{\n    "code": "LATENCY_BUDGET_EXCEEDED",\n    "metric": "tool.query_order.duration_ms",\n    "expected": "<= 3000",\n    "actual": 4280,\n    "over_by_ms": 1280\n  }]\n}`, 'timing = collect_timing(ctx.trace)\\nreturn EvalResult.within_limits(timing, ctx.config.thresholds)', '内置计时器', 44),
);

evaluators.push({
  id: 'human-service-review',
  name: '客服专家评估',
  kind: '人工评估',
  mode: 'preset',
  version: '0.1.0',
  versions: ['0.1.0'],
  description: '由客服专家对服务完整性和转人工策略进行人工标注。',
  purpose: '收集人工标签、分数和判断原因。',
  category: '人工评估',
  scoreType: 'numeric',
  model: '人工评估',
  prompt: '由专家根据服务标准进行人工评分并填写原因。',
  variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: false }],
  creator: '系统',
  updatedAt: '2026-08-25 17:10',
  runCount: 18,
  passThreshold: 0.75,
});

export const humanLabels: HumanLabelDefinition[] = [
  { id: 'HUMAN-QUALITY', name: '回答质量', description: '按 0-1 分评估回答是否完整、准确、可执行。', scoreType: 'numeric', scoreMin: 0, scoreMax: 1, passThreshold: 0.7 },
  { id: 'HUMAN-RISK', name: '风险判断', description: '判断回答是否存在误导、越权或遗漏风险。', scoreType: 'pass_fail' },
  { id: 'HUMAN-SERVICE', name: '服务体验', description: '按 0-1 分评估语气、清晰度和服务动作。', scoreType: 'numeric', scoreMin: 0, scoreMax: 1, passThreshold: 0.8 },
];

export const agentSkillLibrary: AgentSkillBinding[] = [
  {
    id: 'trace-span-retrieve',
    name: 'Trace Span Retrieve',
    description: '从截断或压缩的 Agent Trace 中精确恢复关键 Span、工具参数和执行结果。',
    kind: '评测工作流',
    source: '平台内置',
    scriptCount: 2,
    enabled: true,
  },
  {
    id: 'business-rule-check',
    name: '业务规则核验',
    description: '按领域规则、阈值和例外条件拆分检查项，并输出可定位的证据。',
    kind: '业务规则',
    source: '平台内置',
    scriptCount: 3,
    enabled: true,
  },
  {
    id: 'json-evidence-pack',
    name: '证据打包脚本',
    description: '把输入、输出、Trace 节点和外部查询结果整理成结构化证据包。',
    kind: '校验脚本',
    source: '平台内置',
    scriptCount: 1,
    enabled: true,
  },
  {
    id: 'metric-recalculate',
    name: '指标重算脚本',
    description: '重新计算金额、时延、覆盖率和业务口径，避免依赖 Agent 自述。',
    kind: '校验脚本',
    source: '平台内置',
    scriptCount: 4,
    enabled: true,
  },
];

export const agentMcpLibrary: AgentMcpConnection[] = [
  {
    id: 'order-service',
    name: '订单查询服务',
    description: '读取订单、退款和物流终态，用于核验 Agent 是否真实完成业务动作。',
    transport: 'HTTP',
    endpoint: 'https://mcp.internal.example/orders',
    status: '已连接',
    tools: ['get_order', 'get_refund_status', 'get_shipment'],
  },
  {
    id: 'policy-service',
    name: '售后政策知识库',
    description: '查询退款、退货和例外类目的权威业务规则与版本。',
    transport: 'SSE',
    endpoint: 'https://mcp.internal.example/after-sales-policy',
    status: '已连接',
    tools: ['search_policy', 'get_policy_clause'],
  },
  {
    id: 'ticket-service',
    name: '工单状态服务',
    description: '核对投诉、人工接管和升级工单的实际处理状态。',
    transport: 'HTTP',
    endpoint: 'https://mcp.internal.example/tickets',
    status: '待验证',
    tools: ['get_ticket', 'list_handoffs'],
  },
];

const skillRef = (id: string): AgentSkillBinding => structuredClone(agentSkillLibrary.find((item) => item.id === id) ?? agentSkillLibrary[0]);
const mcpRef = (id: string): AgentMcpConnection => structuredClone(agentMcpLibrary.find((item) => item.id === id) ?? agentMcpLibrary[0]);

export const agentEvaluators: Evaluator[] = [
  {
    id: 'agent-trace-audit',
    name: 'Trace 证据核查',
    kind: 'Agent 评估器',
    mode: 'preset',
    version: '0.1.0',
    versions: ['0.1.0'],
    description: '通过评测工作流恢复关键 Trace、调用脚本核对证据，再判断执行过程是否真实有效。',
    purpose: '解决长 Trace 截断、关键证据分散和 Agent 自述不可信的问题。',
    category: '过程核查',
    scoreType: 'numeric',
    model: 'Doubao-Seed-1.6',
    prompt: '# 评估目标\n\n核查 Agent 是否真实完成关键工具动作，并用恢复后的 Trace 证据支持结论。\n\n# 输入\n\n{{Input}}\n{{Agent Output}}\n{{Trace}}\n\n# 工作流\n\n1. 使用 Trace Span Retrieve 恢复关键节点。\n2. 使用证据打包脚本核对工具调用与最终输出。\n3. 返回 0 到 1 的 score、reason 和 evidence_refs。\n\n只返回 JSON。',
    variables: [
      { name: 'Input', semantic: 'Input', required: true },
      { name: 'Agent Output', semantic: 'Agent Output', required: true },
      { name: 'Trace', semantic: 'Trace', required: true },
    ],
    skills: [skillRef('trace-span-retrieve'), skillRef('json-evidence-pack')],
    mcpConnections: [],
    creator: '系统',
    updatedAt: '2026-10-18 10:20',
    runCount: 36,
    passThreshold: 0.8,
  },
  {
    id: 'agent-business-outcome',
    name: '业务终态核验',
    kind: 'Agent 评估器',
    mode: 'preset',
    version: '0.1.1',
    versions: ['0.1.0', '0.1.1'],
    description: '调用业务 MCP 查询订单或工单终态，不把 Agent 的“已完成”表述直接当作成功。',
    purpose: '核验发信、建单、退款和工单升级等外部副作用是否真实发生。',
    category: '业务结果',
    scoreType: 'pass_fail',
    model: 'Doubao-Seed-1.6-flash',
    prompt: '# 评估目标\n\n核验当前 Case 对应的业务终态是否满足成功条件。\n\n# 输入\n\n{{Input}}\n{{Agent Output}}\n{{Trace}}\n\n# 工作流\n\n1. 从 Trace 提取业务对象和声明结果。\n2. 通过订单查询服务读取权威终态。\n3. 返回 result、reason 和 evidence_refs。\n\n只返回 JSON。',
    variables: [
      { name: 'Input', semantic: 'Input', required: true },
      { name: 'Agent Output', semantic: 'Agent Output', required: true },
      { name: 'Trace', semantic: 'Trace', required: true },
    ],
    skills: [skillRef('business-rule-check')],
    mcpConnections: [mcpRef('order-service')],
    creator: '系统',
    updatedAt: '2026-10-18 10:40',
    runCount: 24,
  },
  {
    id: 'agent-refund-policy',
    name: '退款流程合规',
    kind: 'Agent 评估器',
    mode: 'custom',
    version: '0.2.0',
    versions: ['0.1.0', '0.2.0'],
    description: '结合售后政策 MCP 与金额重算脚本，检查退款路径、运费责任和人工升级边界。',
    purpose: '验证退款客服是否按最新政策和真实订单状态处理例外场景。',
    category: '业务专项',
    scoreType: 'pass_fail',
    model: 'Doubao-Seed-1.6',
    prompt: '# 评估目标\n\n检查退款回复是否同时满足业务政策、订单状态和用户确认要求。\n\n# 输入\n\n{{Input}}\n{{Expected Output}}\n{{Agent Output}}\n{{Trace}}\n\n# 工作流\n\n1. 使用售后政策知识库查询适用条款。\n2. 使用指标重算脚本复算退款金额与运费。\n3. 返回 result、reason 和 evidence_refs。\n\n只返回 JSON。',
    variables: [
      { name: 'Input', semantic: 'Input', required: true },
      { name: 'Expected Output', semantic: 'Expected Output', required: true },
      { name: 'Agent Output', semantic: 'Agent Output', required: true },
      { name: 'Trace', semantic: 'Trace', required: true },
    ],
    skills: [skillRef('business-rule-check'), skillRef('metric-recalculate')],
    mcpConnections: [mcpRef('policy-service'), mcpRef('ticket-service')],
    creator: '王子磊',
    updatedAt: '2026-10-19 16:35',
    runCount: 12,
  },
];


evaluators.push(...agentEvaluators, ...demoEvaluators, ...queryAgentEvaluators, ...financialComplianceEvaluators);

const queryAgentSeedEvaluators = [...QUERY_AGENT_CORE_EVALUATOR_IDS, 'tool_trace', 'trace_structure', 'answer_grounded', 'semantic_intent', 'root_cause', 'trace_faithfulness']
  .map((id) => queryAgentEvaluators.find((evaluator) => evaluator.id === id))
  .filter((evaluator): evaluator is Evaluator => Boolean(evaluator));
const queryAgentSeedResults = createQueryAgentResults(queryAgentSeedEvaluators);

const datasets: Dataset[] = [
  demoDataset,
  financialComplianceDataset,
  queryAgentDataset,
  {
    id: 'DS-53346',
    name: '退款问答评测集',
    description: '覆盖退款政策、申请流程和到账时间，包含真实回流问题。',
    tags: ['售后', '回归', '验证集', 'Badcase'],
    status: '已提交',
    source: '用户上传',
    createdAt: '2026-08-22 10:18',
    updatedAt: '2026-08-25 17:42',
    createdBy: '王子磊',
    draftVersionId: 'refund-draft',
    fields: [
      field('f-input', '用户问题', 'Input', '提供给 Agent 的完整用户输入。', true),
      field('f-expected', '验收要点', 'Expected Output', '用于判断回答是否覆盖明确要求。'),
      field('f-actual', 'Agent 回答', 'Agent Output', '系统运行后写入的最终回答。'),
      field('f-trace', '执行轨迹', 'Trace', '系统固定保存的完整 Trace。'),
      field('f-userFeedback', '用户反馈', 'User Feedback', '来自原始对话的点赞、点踩和文字反馈。'),
      field('f-order', '订单号', 'Custom', '用于推荐绑定到订单查询相关评估器。'),
    ],
    cases: [
      { id: 'CASE-HIS-024', values: { 'f-input': refundResults[0].input, 'f-expected': refundResults[0].expectedOutput ?? '', 'f-actual': refundResults[0].agentOutput, 'f-trace': 'trace://CASE-HIS-024', 'f-userFeedback': refundResults[0].userFeedback ?? '', 'f-order': 'OD202608180042' }, source: '历史对话回流', createdAt: '2026-08-24', hasFile: false },
      { id: 'CASE-UP-018', values: { 'f-input': refundResults[1].input, 'f-expected': refundResults[1].expectedOutput ?? '', 'f-actual': refundResults[1].agentOutput, 'f-trace': 'trace://CASE-UP-018', 'f-order': 'OD202608180068' }, source: '用户上传', createdAt: '2026-08-23', hasFile: false },
      { id: 'CASE-GEN-011', values: { 'f-input': refundResults[2].input, 'f-expected': refundResults[2].expectedOutput ?? '', 'f-actual': '', 'f-trace': 'trace://CASE-GEN-011' }, source: '智能生成', createdAt: '2026-08-23', hasFile: false },
      { id: 'CASE-UP-019', values: { 'f-input': refundResults[3].input, 'f-expected': refundResults[3].expectedOutput ?? '', 'f-actual': refundResults[3].agentOutput, 'f-trace': 'trace://CASE-UP-019', 'f-order': 'OD202608180077' }, source: '用户上传', createdAt: '2026-08-22', hasFile: false },
    ],
    versions: [
      { id: 'refund-v2', label: 'V2', status: '已提交', caseCount: 4, createdAt: '2026-08-25 17:42', createdBy: '王子磊', note: '追加 1 条跨境退款失败案例。' },
      { id: 'refund-v1', label: 'V1', status: '已提交', caseCount: 3, createdAt: '2026-08-22 10:18', createdBy: '王子磊', note: '初始上传版本。' },
      { id: 'refund-draft', label: '草稿', status: '草稿', caseCount: 4, createdAt: '2026-08-25 18:06', createdBy: '王子磊', note: '当前编辑中的草稿。' },
    ],
  },
  {
    id: 'DS-24610',
    name: '招标报告评测集',
    description: '验证文件分析、评分项覆盖和生成文件交付质量。',
    tags: ['文件分析', '生成质量', '回归集'],
    status: '已提交',
    source: '用户上传',
    createdAt: '2026-08-24 15:30',
    updatedAt: '2026-08-24 15:30',
    createdBy: '演示账户',
    draftVersionId: '',
    fields: [
      field('t-input', '任务说明', 'Input', '提供给 Agent 的完整用户输入。', true),
      field('t-file', '招标文件', 'File', '单独维护的文件资源字段。'),
      field('t-expected', '交付标准', 'Expected Output', '描述报告覆盖项和文件要求。'),
      field('t-actual', '实际回答', 'Agent Output', 'Agent 的最终回答。'),
      field('t-trace', '完整 Trace', 'Trace', '系统保存的完整执行轨迹。'),
    ],
    cases: [{ id: 'CASE-FILE-001', values: { 't-input': tenderResults[0].input, 't-file': '招标文件-示例.pdf · 2 个', 't-expected': tenderResults[0].expectedOutput ?? '', 't-actual': tenderResults[0].agentOutput, 't-trace': 'trace://CASE-FILE-001' }, source: '用户上传', createdAt: '2026-08-20', hasFile: true }, { id: 'CASE-FILE-002', values: { 't-input': '请读取这份空白 PDF 并输出结论。', 't-file': '空白附件.pdf · 可访问但内容为空', 't-expected': '识别文件为空并说明无法分析。', 't-actual': '文件可以打开，但没有可解析内容。', 't-trace': 'trace://CASE-FILE-002' }, source: '用户上传', createdAt: '2026-08-20', hasFile: true }, { id: 'CASE-FILE-003', values: { 't-input': '请分析这份外部链接文件。', 't-file': 'https://files.example.com/missing.pdf · 无法访问', 't-expected': '说明文件不可访问，并请求重新上传。', 't-actual': '', 't-trace': 'trace://CASE-FILE-003' }, source: '用户上传', createdAt: '2026-08-20', hasFile: true }, { id: 'CASE-FILE-004', values: { 't-input': '请分析附件并输出评分报告。', 't-expected': '完成文件分析。', 't-actual': '', 't-trace': 'trace://CASE-FILE-004' }, source: '用户上传', createdAt: '2026-08-20', hasFile: false }],
    versions: [{ id: 'tender-v1', label: 'V1', status: '已提交', caseCount: 1, createdAt: '2026-08-24 15:30', createdBy: '演示账户', note: '验证文件交付质量的首个版本。' }],
  },
];

datasets.forEach((dataset) => {
  dataset.versions = dataset.versions.map((version) => ({
    ...version,
    data: { fields: structuredClone(dataset.fields), cases: structuredClone(dataset.cases.slice(0, version.caseCount)) },
  }));
});

const task = (input: Omit<EvaluationTask, 'totalCases' | 'executableCases' | 'completedCases' | 'failedCases'> & Pick<EvaluationTask, 'totalCases' | 'executableCases' | 'completedCases' | 'failedCases'>): EvaluationTask => input;

const tasks: EvaluationTask[] = [
  ...demoTasks,
  ...financialComplianceTasks,
    task({ id: 'TASK-QUERY-20261016-001', name: '网点与订单问数综合回归', description: '验证 SQL 编写 Skill、本体查询 MCP、只读数据库查询 MCP、结果一致性和异常边界；保留 SQL、查询结果与消息级 Trace。', agent: '问数 Agent', agentVersion: QUERY_AGENT_AGENT_VERSION, datasetId: QUERY_AGENT_DATASET_ID, datasetVersion: '验证集 · 45 条', evaluatorIds: queryAgentSeedEvaluators.map((evaluator) => evaluator.id), status: '部分失败', tone: 'warning', createdBy: '演示账户', createdAt: '2026-10-16 18:02', updatedAt: '2026-10-19 03:31', totalCases: queryAgentSeedResults.length, executableCases: queryAgentSeedResults.length, completedCases: queryAgentSeedResults.length, failedCases: queryAgentSeedResults.filter((item) => ['不通过', '执行失败', '证据不足'].includes(item.status)).length, results: queryAgentSeedResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-AUTO-20261008-001', name: '退款会话质量监测', description: '监测退款会话的回答与执行轨迹。', taskType: '自动化', automation: { objectType: '对话', collectStartAt: '2026-10-08 09:00', collectEndAt: '2026-10-15 09:00', sessionIdleMinutes: 30, filterMode: '全部满足', filters: [{ id: 'seed-filter-1', field: 'Input', operator: '包含', value: '退款' }], sampleRatio: 20, totalDataLimit: 500, repeat: '每天', candidateCount: 21, sampledCount: 8, evaluatedCount: 4 }, agent: '退款客服助手', agentVersion: 'V4', datasetId: '', datasetVersion: '动态采集', evaluatorIds: ['P0-07', 'P0-12'], status: '运行中', tone: 'info', createdBy: '演示账户', createdAt: '2026-10-08 09:00', updatedAt: '2026-10-08 14:20', totalCases: automationResults.length, executableCases: automationResults.length, completedCases: automationResults.length, failedCases: 0, results: automationResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-AUTO-20261008-002', name: '工具调用稳定性监测', description: '监测订单查询工具的执行质量。', taskType: '自动化', automation: { objectType: 'Trace', collectStartAt: '2026-10-08 10:00', collectEndAt: '2026-10-18 10:00', sessionIdleMinutes: 30, filterMode: '任一满足', filters: [{ id: 'seed-filter-2', field: 'Trace', operator: '包含', value: '订单查询' }], sampleRatio: 50, totalDataLimit: 1000, repeat: '每天', candidateCount: 48, sampledCount: 18, evaluatedCount: 11 }, agent: '退款客服助手', agentVersion: 'V4', datasetId: '', datasetVersion: '动态采集', evaluatorIds: ['P0-11', 'P0-12'], status: '已暂停', tone: 'warning', createdBy: '演示账户', createdAt: '2026-10-08 10:00', updatedAt: '2026-10-09 09:20', totalCases: 2, executableCases: 2, completedCases: 2, failedCases: 0, results: automationResults.slice(0, 2), runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260922-001', name: '退款政策基线验证', description: '验证退款政策基线回答的完整性、检索证据和 Trace。', agent: '退款客服助手', agentVersion: 'V3', datasetId: 'DS-53346', datasetVersion: 'V2', evaluatorIds: ['P0-01', 'P0-02', 'P0-05', 'P0-12'], status: '已完成', tone: 'success', createdBy: '王子磊', createdAt: '2026-09-22 09:40', updatedAt: '2026-09-22 09:49', totalCases: 4, executableCases: 4, completedCases: 4, failedCases: 0, results: comparisonBaseResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260922-002', name: '退款政策补充信息验证', description: '验证补充退回方式、运费责任和异常兜底后的退款回答。', agent: '退款客服助手', agentVersion: 'V4', datasetId: 'DS-53346', datasetVersion: 'V2', evaluatorIds: ['P0-01', 'P0-02', 'P0-05', 'P0-12'], status: '已完成', tone: 'success', createdBy: '王子磊', createdAt: '2026-09-22 10:12', updatedAt: '2026-09-22 10:23', totalCases: 4, executableCases: 4, completedCases: 3, failedCases: 1, results: comparisonExperimentResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260825-001', name: '退款会话异常回流验证', description: '验证退款问答的任务完成、检索证据和完整 Trace。', agent: '退款客服助手', agentVersion: 'V3', datasetId: 'DS-53346', datasetVersion: 'V2', evaluatorIds: ['P0-01', 'P0-02', 'P0-03', 'P0-05', 'P0-07', 'P0-12', 'code-required-fields'], status: '部分失败', tone: 'warning', createdBy: '王子磊', createdAt: '2026-08-25 18:12', updatedAt: '2026-08-25 18:19', totalCases: 4, executableCases: 3, completedCases: 3, failedCases: 1, results: refundResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260823-003', name: '订单工具超时处理验证', description: '验证订单查询工具异常时的失败边界。', agent: '退款客服助手', agentVersion: 'V2', datasetId: 'DS-53346', datasetVersion: 'V1', evaluatorIds: ['P0-01', 'P0-10', 'P0-12'], status: '失败', tone: 'danger', createdBy: '王子磊', createdAt: '2026-08-23 11:16', updatedAt: '2026-08-23 11:18', totalCases: 1, executableCases: 1, completedCases: 1, failedCases: 1, results: failureResults, runtime: { concurrency: 1, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260824-008', name: '招标文件交付完整性验证', description: '验证文件分析和最终交付文件的完整性。', agentType: '外部', agent: '招标文件评估助手', agentVersion: 'V1', datasetId: 'DS-24610', datasetVersion: 'V1', evaluatorIds: ['P0-01', 'P0-04', 'P0-08', 'P0-12'], status: '已完成', tone: 'success', createdBy: '演示账户', createdAt: '2026-08-24 15:34', updatedAt: '2026-08-24 16:02', totalCases: 1, executableCases: 1, completedCases: 1, failedCases: 0, results: tenderResults, runtime: { concurrency: 1, timeout: 120, continueOnError: true } }),
];

tasks.forEach((item) => {
  item.results = structuredClone(item.results);
  item.evaluatorVersions = Object.fromEntries(item.evaluatorIds.map((id) => [id, evaluators.find((evaluator) => evaluator.id === id)?.version ?? '0.1.0']));
  item.evaluatorSnapshots = Object.fromEntries(item.evaluatorIds.flatMap((id) => {
    const evaluator = evaluators.find((entry) => entry.id === id);
    if (!evaluator) return [];
    return [[id, {
      evaluatorId: evaluator.id,
      name: evaluator.name,
      version: item.evaluatorVersions?.[id] ?? evaluator.version,
      purpose: evaluator.purpose,
      prompt: evaluator.prompt,
      variables: structuredClone(evaluator.variables),
      scoreType: evaluator.scoreType,
      passThreshold: evaluator.passThreshold,
    }]];
  }));
  item.results.forEach((caseResult) => {
    caseResult.currentAttemptId = caseResult.currentAttemptId ?? 'attempt-1';
    caseResult.evaluatorResults.forEach((evaluatorResult) => {
      evaluatorResult.evaluatorVersion = item.evaluatorVersions?.[evaluatorResult.evaluatorId] ?? evaluatorResult.evaluatorVersion ?? '0.1.0';
      evaluatorResult.attemptId = caseResult.currentAttemptId;
    });
  });
});

const seedCalibration = (taskId: string, caseId: string, evaluatorId: string, calibratedResult: number, reason: string) => {
  const targetTask = tasks.find((item) => item.id === taskId);
  const targetCase = targetTask?.results.find((item) => item.caseId === caseId);
  const targetResult = targetCase?.evaluatorResults.find((item) => item.evaluatorId === evaluatorId);
  if (!targetTask || !targetCase || !targetResult) return;
  const originalResult = targetResult.evaluationResult;
  const originalReason = targetResult.evaluationReason;
  const originalStatus = targetResult.evaluationStatus;
  const evaluator = evaluators.find((item) => item.id === evaluatorId);
  const status = calibratedResult >= (evaluator?.passThreshold ?? 0.7) ? '通过' : '不通过';
  targetResult.calibration = {
    taskId,
    caseId,
    evaluatorId,
    evaluatorVersion: targetTask.evaluatorVersions?.[evaluatorId] ?? targetResult.evaluatorVersion ?? '0.1.0',
    attemptId: targetResult.attemptId ?? 'attempt-1',
    originalResult,
    originalReason,
    originalStatus,
    result: calibratedResult,
    reason,
    status,
    updatedAt: '2026-10-08 14:10',
    updatedBy: '演示账户',
  };
  targetResult.evaluationResult = calibratedResult;
  targetResult.evaluationReason = reason;
  targetResult.evaluationStatus = status;
};

seedCalibration('TASK-20260922-001', 'CASE-HIS-024', 'P0-02', 0.5, '“未使用且不影响二次销售”已经表达商品完好条件，实际覆盖 2 个要点。');
seedCalibration('TASK-20260922-002', 'CASE-UP-018', 'P0-02', 1, '已覆盖审核后、3-5 个工作日、原路退回三个必选要点。');
seedCalibration('TASK-20260922-002', 'CASE-UP-018', 'P0-02', 1, '表达不同但语义完整，应按全部覆盖计算。');

const metricValue = (item?: EvaluatorResult): number | undefined => {
  if (!item || !['通过', '不通过'].includes(item.evaluationStatus)) return undefined;
  if (item.scoreType === 'numeric') return typeof item.evaluationResult === 'number' ? item.evaluationResult : undefined;
  return item.evaluationStatus === '通过' ? 1 : 0;
};

const average = (values: number[]): number | undefined => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const signed = (value: number, digits = 2): string => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

const durationSeconds = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)\s*(ms|s|min)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'ms' ? amount / 1000 : unit === 'min' ? amount * 60 : amount;
};

const formatSeconds = (value: number, metric: string): string => metric === '首字时延' ? `${Math.round(value * 1000)} ms` : `${value.toFixed(1)} s`;
const formatTokens = (value: number): string => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;

const runtimeValue = (item: CaseResult, metric: string): number | undefined => {
  if (!item.runtime) return undefined;
  if (metric === 'Agent 耗时') return durationSeconds(item.runtime.agentDuration);
  if (metric === '首字时延') return durationSeconds(item.runtime.firstTokenLatency);
  if (metric === 'Input Tokens') return item.runtime.inputTokens;
  if (metric === 'Output Tokens') return item.runtime.outputTokens;
  if (metric === 'Total Tokens') return item.runtime.totalTokens;
  if (metric === '评估器耗时') return durationSeconds(item.runtime.evaluatorDuration);
  return undefined;
};

export const createComparisonRecord = (
  controlTask: EvaluationTask,
  experimentTasks: EvaluationTask[],
  dataset: Dataset,
  evaluatorCatalog: Evaluator[],
  name?: string,
): ComparisonRecord => {
  const selectedTasks = [controlTask, ...experimentTasks];
  const taskResultMaps = selectedTasks.map((task) => new Map(task.results.map((item) => [item.caseId, item])));
  const datasetCases = new Map(dataset.cases.map((item) => [item.id, item]));
  const evaluatorById = new Map(evaluatorCatalog.map((item) => [item.id, item]));
  const sharedFields = dataset.fields
    .filter((item) => !['Agent Output', 'Trace', 'Agent Configuration'].includes(item.semantic))
    .map((item) => item.semantic === 'Custom' ? item.name : item.semantic);

  const commonCaseIds = controlTask.results
    .filter((item) => taskResultMaps.every((resultMap) => resultMap.has(item.caseId)))
    .map((item) => item.caseId);
  const rowsByCase = commonCaseIds.map((caseId) => Object.fromEntries(selectedTasks.map((task, index) => [task.id, taskResultMaps[index].get(caseId) as CaseResult])));
  const taskRefs: ComparisonTaskRef[] = selectedTasks.map((task, index) => ({
    taskId: task.id,
    name: task.name,
    label: `${task.name} · ${task.agentVersion}`,
    role: index === 0 ? '对照组' : '实验组',
    agent: task.agent,
    agentVersion: task.agentVersion,
    datasetVersion: task.datasetVersion,
    evaluatorIds: task.evaluatorIds,
  }));

  const caseRows: ComparisonCaseRow[] = rowsByCase.map((resultsByTask) => {
    const controlResult = resultsByTask[controlTask.id];
    const outputs = Object.fromEntries(selectedTasks.map((task) => {
      const item = resultsByTask[task.id];
      return [task.id, { taskId: task.id, output: item.agentOutput, evaluatorResults: item.evaluatorResults }];
    }));
    const outputValues = selectedTasks.map((task) => outputs[task.id].output.trim());
    const judgment: ComparisonCaseRow['judgment'] = outputValues.some((value) => !value)
      ? '无法比较'
      : outputValues.every((value) => value === outputValues[0]) ? '一致' : '有差异';
    const datasetCase = datasetCases.get(controlResult.caseId);
    const sharedValues = Object.fromEntries(dataset.fields
      .filter((item) => !['Agent Output', 'Trace', 'Agent Configuration'].includes(item.semantic))
      .map((item) => [item.semantic === 'Custom' ? item.name : item.semantic, item.semantic === 'Input' ? controlResult.input : item.semantic === 'Expected Output' ? controlResult.expectedOutput ?? '' : item.semantic === 'User Feedback' ? controlResult.userFeedback ?? '' : datasetCase?.values[item.id] ?? '未采集']));
    return {
      caseId: controlResult.caseId,
      sharedValues,
      outputs,
      judgment,
      reason: judgment === '有差异' ? '各任务的 Agent Output 存在内容差异。' : judgment === '一致' ? '各任务的 Agent Output 一致。' : '至少一个任务缺少有效 Agent Output。',
    };
  });

  const formatEvaluatorValue = (value: number | undefined, scoreType: ScoreType, passed = 0, valid = 0): string => {
    if (value === undefined) return '未采集';
    return scoreType === 'pass_fail' ? `${Math.round(value * 100)}% (${passed}/${valid})` : value.toFixed(2);
  };

  const evaluatorCell = (task: EvaluationTask, evaluatorId: string, scoreType: ScoreType, controlCell?: ComparisonMetricCell): ComparisonMetricCell => {
    if (!task.evaluatorIds.includes(evaluatorId)) {
      return { taskId: task.id, result: '未配置', coverage: `0/${rowsByCase.length}`, state: '未配置' };
    }
    const values: number[] = [];
    const invalidStatuses: string[] = [];
    let passed = 0;
    rowsByCase.forEach((resultsByTask) => {
      const evaluatorResult = resultsByTask[task.id].evaluatorResults.find((item) => item.evaluatorId === evaluatorId);
      const value = metricValue(evaluatorResult);
      if (value === undefined) {
        if (evaluatorResult?.evaluationStatus) invalidStatuses.push(evaluatorResult.evaluationStatus);
        return;
      }
      values.push(value);
      if (value === 1) passed += 1;
    });
    const value = average(values);
    const state: ComparisonMetricCell['state'] = task.id === controlTask.id ? '对照组' : value === undefined ? '无法比较' : '有效';
    const result = value === undefined ? invalidStatuses[0] ?? '未采集' : formatEvaluatorValue(value, scoreType, passed, values.length);
    const cell: ComparisonMetricCell = { taskId: task.id, result, value, coverage: `${values.length}/${rowsByCase.length}`, state };
    if (!controlCell || task.id === controlTask.id || value === undefined || controlCell.value === undefined) return cell;
    const delta = value - controlCell.value;
    return {
      ...cell,
      delta: scoreType === 'pass_fail' ? `${signed(delta * 100, 1)} pp` : signed(delta, 2),
      judgment: delta > 0.005 ? '改善' : delta < -0.005 ? '下降' : '无变化',
    };
  };

  const evaluatorIds = [...new Set(selectedTasks.flatMap((task) => task.evaluatorIds))];
  const evaluatorRows: ComparisonEvaluatorRow[] = evaluatorIds.map((evaluatorId) => {
    const evaluator = evaluatorById.get(evaluatorId);
    const scoreType = evaluator?.scoreType ?? 'numeric';
    const cells: Record<string, ComparisonMetricCell> = {};
    selectedTasks.forEach((task) => {
      const controlCell = cells[controlTask.id];
      cells[task.id] = evaluatorCell(task, evaluatorId, scoreType, controlCell);
    });
    return { metric: evaluator?.name ?? evaluatorId, evaluatorName: evaluator?.name ?? evaluatorId, evaluatorId, scoreType, cells };
  });

  const runtimeMetrics = ['Agent 耗时', '首字时延', 'Input Tokens', 'Output Tokens', 'Total Tokens', '评估器耗时'];
  const sameRuntimeSettings = selectedTasks.every((task) => JSON.stringify(task.runtime) === JSON.stringify(controlTask.runtime));
  const runtimeCell = (task: EvaluationTask, metric: string, controlCell?: ComparisonMetricCell): ComparisonMetricCell => {
    const values = rowsByCase.map((resultsByTask) => runtimeValue(resultsByTask[task.id], metric)).filter((item): item is number => item !== undefined);
    const value = average(values);
    const format = (item?: number) => item === undefined ? '未采集' : metric.includes('Tokens') ? formatTokens(item) : formatSeconds(item, metric);
    const state: ComparisonMetricCell['state'] = task.id === controlTask.id ? '对照组' : value === undefined ? '未采集' : '有效';
    const cell: ComparisonMetricCell = { taskId: task.id, result: format(value), value, coverage: `${values.length}/${rowsByCase.length}`, state };
    if (!controlCell || task.id === controlTask.id || value === undefined || controlCell.value === undefined) return cell;
    const delta = (value - controlCell.value) / (controlCell.value || 1);
    return {
      ...cell,
      delta: `${signed(delta * 100, 1)}%`,
      judgment: !sameRuntimeSettings ? '参考差异' : delta < -0.005 ? '改善' : delta > 0.005 ? '下降' : '无变化',
    };
  };
  const runtimeRows: ComparisonRuntimeRow[] = runtimeMetrics.map((metric) => {
    const cells: Record<string, ComparisonMetricCell> = {};
    selectedTasks.forEach((task) => {
      const controlCell = cells[controlTask.id];
      cells[task.id] = runtimeCell(task, metric, controlCell);
    });
    return { metric, cells };
  });

  const summary = { different: 0, same: 0, incomparable: 0 };
  caseRows.forEach((item) => {
    if (item.judgment === '有差异') summary.different += 1;
    else if (item.judgment === '一致') summary.same += 1;
    else summary.incomparable += 1;
  });

  return {
    id: `CMP-${selectedTasks.map((task) => task.id).join('-')}`,
    name: name ?? `${dataset.name}｜${selectedTasks.length} 个任务对比`,
    controlTaskId: controlTask.id,
    experimentTaskIds: experimentTasks.map((task) => task.id),
    taskRefs,
    dataset: dataset.name,
    datasetId: dataset.id,
    datasetVersion: [...new Set(selectedTasks.map((task) => task.datasetVersion))].join(' / '),
    status: '已完成',
    tone: 'success',
    totalCases: caseRows.length,
    comparableCases: caseRows.length - summary.incomparable,
    differentCases: summary.different,
    sameCases: summary.same,
    incomparableCases: summary.incomparable,
    createdAt: '2026-09-23 11:08',
    sharedFields,
    evaluatorRows,
    runtimeRows,
    caseRows,
  };
};

const beforeConfig: AgentConfigSnapshot = {
  systemPrompt: '你是退款客服助手。根据售后政策回答退款、退货和到账问题。',
  tools: [{ id: 'order-query', name: '订单查询', detail: '查询订单状态和售后进度' }],
  skills: [{ id: 'refund-policy', name: '售后政策', content: '说明 7 天无理由退货和退款时效。' }],
};

const afterConfig: AgentConfigSnapshot = {
  systemPrompt: '你是退款客服助手。根据售后政策回答退款、退货和到账问题。涉及退货条件时必须说明寄回方式、运费承担和转人工条件。',
  tools: [{ id: 'order-query', name: '订单查询', detail: '查询订单状态和售后进度' }, { id: 'shipping-policy', name: '运费政策', detail: '查询退货运费承担规则' }],
  skills: [{ id: 'refund-policy', name: '售后政策', content: '说明 7 天无理由退货、退款时效、寄回方式和运费承担。' }],
};

const optimizationResult = (selectedCaseCount: number, comparisonId?: string): OptimizationResult => ({
  status: '优化成功',
  selectedCaseCount,
  changeSummary: '针对退货条件说明不完整的问题，补充寄回方式、运费承担和转人工条件，并增加运费政策工具。',
  beforeConfig,
  afterConfig,
  changes: [
    { target: 'system_prompt', changeType: '修改', before: beforeConfig.systemPrompt, after: afterConfig.systemPrompt, reason: '补齐退货条件、寄回方式和运费承担。', caseIds: ['CASE-HIS-024'] },
    { target: 'tools', changeType: '新增', before: '订单查询', after: '订单查询、运费政策', reason: '支持回答运费承担问题。', caseIds: ['CASE-HIS-024'] },
    { target: 'skills', changeType: '修改', before: beforeConfig.skills[0].content ?? '', after: afterConfig.skills[0].content ?? '', reason: '将寄回方式和运费承担写入售后政策。', caseIds: ['CASE-HIS-024'] },
  ],
  suggestions: [
    { id: 'SUG-001', problem: '缺少订单号时仍尝试查询退款进度。', caseIds: ['CASE-GEN-011'], suggestion: '在工作流中增加订单号缺失识别，先追问订单号再调用订单查询。' },
    { id: 'SUG-002', problem: '跨境退款失败后没有明确转人工路径。', caseIds: ['CASE-UP-019'], suggestion: '补充跨境售后异常兜底策略，失败后返回人工处理入口。' },
  ],
  scoreRows: [
    { caseId: 'CASE-HIS-024', evaluatorName: '任务完成度', beforeResult: '不通过', afterResult: '通过', judgment: '改善', reason: '优化后覆盖寄回方式和运费承担。' },
    { caseId: 'CASE-HIS-024', evaluatorName: '参考答案遵从度', beforeResult: 0.25, afterResult: 0.9, judgment: '改善', reason: '验收要点覆盖数量提升。' },
    { caseId: 'CASE-UP-019', evaluatorName: '任务完成度', beforeResult: '执行失败', afterResult: '无法比较', judgment: '无法比较', reason: '优化后仍依赖订单服务，当前无有效运行结果。' },
  ],
  summary: { improved: 2, declined: 0, unchanged: 0, incomparable: 1 },
  comparisonId,
});

const experiments: OptimizeExperiment[] = [
  ...demoExperiments,
  { id: 'EXP-20260923-DIRECT', name: '退款政策说明补齐实验', sourceTaskId: 'TASK-20260922-001', agentType: '万智', agent: '退款客服助手', baseVersion: 'V3', candidateVersion: '优化后 Agent', datasetVersion: '退款问答评测集', followUpMode: '直接实验对比', status: '已完成', tone: 'success', createdAt: '2026-09-23 11:42', selectedCaseIds: ['CASE-HIS-024', 'CASE-UP-019'], selectedCaseCount: 2, result: optimizationResult(2, 'CMP-TASK-20260922-001-TASK-20260922-002') },
];

const comparisonDataset = datasets.find((item) => item.id === 'DS-53346');
const findTask = (id: string) => tasks.find((item) => item.id === id);
const comparisonControlTask = findTask('TASK-20260922-001');
const comparisonExperimentATask = findTask('TASK-20260922-002');
const comparisons: ComparisonRecord[] = [...demoComparisons];
if (comparisonDataset && comparisonControlTask && comparisonExperimentATask) {
  comparisons.push(createComparisonRecord(comparisonControlTask, [comparisonExperimentATask], comparisonDataset, evaluators, '退款政策补充信息对比'));
}

export const mockEvaluationState: EvaluationState = {
  agents,
  datasets,
  evaluators,
  humanLabels,
  tasks,
  experiments,
  comparisons,
  evaluatorOptimizations,
};

export const cloneEvaluationState = (): EvaluationState => structuredClone(mockEvaluationState);

export const statusTone = (status: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' => {
  if (['已完成', '通过', '已提交', '已保存新版本', '已生成版本', '符合人工校准'].includes(status)) return 'success';
  if (['待启动', '运行中', '分析中', '待继续实验', '复测评测中', '待查看实验对比', '待重新评测', '待分析', '待确认', '验证中', '结果一致'].includes(status)) return 'info';
  if (['已暂停', '部分失败', '无法执行', '证据不足', '草稿', '待人工评估', '新增影响'].includes(status)) return 'warning';
  if (['失败', '不通过', '执行失败'].includes(status)) return 'danger';
  return 'neutral';
};

export const getTaskResults = (task: EvaluationTask): CaseResult[] => task.results;

export const getDatasetById = (state: EvaluationState, id: string): Dataset | undefined => state.datasets.find((dataset) => dataset.id === id);

export const getEvaluatorById = (state: EvaluationState, id: string): Evaluator | undefined => state.evaluators.find((evaluator) => evaluator.id === id);
