import type {
  AgentOption,
  AgentConfigSnapshot,
  CaseResult,
  ComparisonRecord,
  Dataset,
  EvaluationState,
  EvaluationTask,
  Evaluator,
  EvaluatorResult,
  FieldDefinition,
  HistoryConversation,
  HistoryTraceRecord,
  OptimizeExperiment,
  OptimizationResult,
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
  { id: 'f3', type: 'agent', name: '生成最终回答', status: '跳过', duration: '—', detail: '依赖的订单信息不可用，未生成有效回答。' },
]);

const historyTrace = trace([
  { id: 'h1', type: 'system', name: '历史会话回流', status: '成功', duration: '—', detail: '沿用原始会话中的 Agent 回复和 Trace，不重新运行 Agent。' },
  { id: 'h2', type: 'retrieval', name: '历史 Trace · 知识库检索', status: '成功', duration: '1.1 s', detail: '原始会话命中售后政策与退款时效知识片段。' },
  { id: 'h3', type: 'agent', name: '原始最终回答', status: '成功', duration: '2.3 s', detail: '来自 2026-08-19 16:02 的真实对话回流记录。' },
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
  scoreType,
  evaluationResult: scoreType === 'numeric' ? (score ?? 0) : status === '通过' ? '通过' : status,
  evaluationReason: reason,
  evaluationStatus: status,
  traceRefs: evidenceRefs,
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

const withRuntime = (item: unknown): CaseResult => { const value = item as CaseResult & { duration?: string }; const badcase = ['CASE-HIS-024', 'CASE-UP-019', 'CASE-GEN-011', 'CASE-FILE-002', 'CASE-FAIL-001', 'CASE-HISTORY-006'].includes(value.caseId); return { ...value, caseMark: value.caseMark ?? (badcase ? 'Badcase' : undefined), runtime: value.runtime ?? runtime(value.status, value.duration ?? '—') }; };

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
    ],
  },
  {
    caseId: 'CASE-UP-018',
    status: '通过',
    duration: '8.4 s',
    input: '退款申请提交后多久能到账？',
    expectedOutput: '说明审核通过后的到账时效和原路退回规则。',
    agentOutput: '退款审核通过后，通常会在 3—5 个工作日内原路退回；具体到账时间以银行或支付渠道处理为准。',
    agentConfiguration: '退款客服助手 V3 · 知识库：售后政策 · 工具：订单查询',
    trace: baseTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '通过', '直接回答到账时间，并补充了渠道差异。', ['Agent Output 覆盖时效和原路退回'], ['t4'], 1),
      result('P0-02', '参考答案遵从度', 'numeric', '通过', '覆盖审核通过、3—5 个工作日和原路退回三个要点。', ['Expected Output 要点全部出现'], ['t4'], 0.98),
      result('P0-03', '指令遵循', 'pass_fail', '通过', '没有承诺超出政策边界的确定性时间。', ['“通常”“以渠道处理为准”'], ['t4'], 1),
      result('P0-05', '检索相关性', 'numeric', '通过', '检索内容集中于退款时效。', ['命中退款时效片段'], ['t2'], 0.97),
      result('P0-07', '回答忠实度', 'numeric', '通过', '回答中的时效表述被知识库片段完整支持。', ['售后政策片段 #refund-05'], ['t2', 't4'], 0.98),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '通过', '问题简单，检索一次后直接回答，没有多余调用。', ['一步检索后生成回答'], ['t1', 't2', 't4'], 0.95),
    ],
  },
  {
    caseId: 'CASE-GEN-011',
    status: '证据不足',
    duration: '—',
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

const historyResults: CaseResult[] = [
  {
    caseId: 'CASE-HISTORY-006',
    status: '待人工评估',
    duration: '历史记录',
    input: '我已经提交退款申请，为什么还没有到账？',
    expectedOutput: '说明审核状态、到账时效，并在无法查询时引导补充订单号。',
    agentOutput: '退款申请一般会在审核通过后的 3—5 个工作日内原路退回，请耐心等待。',
    userFeedback: '用户点踩：没有先核实订单号和当前审核状态。',
    humanEvaluation: { humanLabel: '待标注', humanReason: '回流记录缺少可确认的订单状态，需要专家判断。', updatedAt: '2026-08-25 20:10', updatedBy: '演示账户' },
    agentConfiguration: '退款客服助手 V2 · 历史会话回流 · 原始 Trace 已保留',
    trace: historyTrace,
    evaluatorResults: [
      result('P0-01', '任务完成度', 'pass_fail', '待人工评估', '回流记录缺少可确认的订单状态，需要人工结合用户反馈判断。', ['User Feedback 指向“未核实状态”'], ['h1', 'h3']),
      result('P0-02', '参考答案遵从度', 'numeric', '不通过', '没有说明审核状态，也没有询问订单号。', ['Expected Output 要求先核实状态'], ['h3'], 0.42),
      result('P0-03', '指令遵循', 'pass_fail', '通过', '回复语气和退款时效说明符合配置，但信息收集不充分。', ['Agent Configuration', 'Agent Output'], ['h3'], 1),
      result('P0-05', '检索相关性', 'numeric', '通过', '原始检索片段与退款时效有关。', ['历史 Trace 命中退款时效片段'], ['h2'], 0.9),
      result('P0-07', '回答忠实度', 'numeric', '通过', '3—5 个工作日的表述被原始检索片段支持。', ['历史知识片段 #refund-05'], ['h2', 'h3'], 0.94),
      result('P0-12', 'Agent 轨迹质量', 'numeric', '不通过', '历史路径直接检索并回答，没有核实订单状态的动作。', ['缺少订单查询节点'], ['h1', 'h2', 'h3'], 0.61),
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
  { id: 'agent-refund', name: '退款客服助手', versions: ['V3', 'V2'], description: '处理退款政策、申请进度和售后咨询。' },
  { id: 'agent-tender', name: '招标文件评估助手', versions: ['V1'], description: '分析招标文件并生成结构化评分报告。' },
  { id: 'agent-research', name: '网页研究助手', versions: ['V2', 'V1'], description: '基于网页检索完成带来源的研究任务。' },
];

const replayTrace = (id: string, name: string, summary: string, input: string, agentOutput: string, userFeedback: string, occurredAt: string): HistoryTraceRecord => ({ id, name, summary, input, agentOutput, userFeedback, occurredAt });

const historyConversation = (id: string, title: string, occurredAt: string, agentId: string, agentVersion: string, traces: HistoryTraceRecord[]): HistoryConversation => ({ id, title, occurredAt, agentId, agentVersion, traces });

export const historyConversations: HistoryConversation[] = [
  historyConversation('SESSION-20260827-001', '商品签收 3 天后不想要了，还能退吗？', '2026-08-27 09:18', 'agent-refund', 'V3', [
    replayTrace('TRACE-27001-A', '第 1 轮', '询问 7 天无理由退货条件', '商品签收 3 天后不想要了，还能退吗？', '商品未使用且不影响二次销售时，可申请退货。', '用户点踩：没有说明寄回方式和运费承担。', '2026-08-27 09:18'),
    replayTrace('TRACE-27001-B', '第 2 轮', '补充订单号后追问运费', '订单号 OD202608180042，运费谁承担？', '退货运费一般由买家承担，质量问题除外。', '', '2026-08-27 09:22'),
  ]),
  historyConversation('SESSION-20260827-002', '退款申请提交后多久能到账？', '2026-08-27 11:06', 'agent-refund', 'V3', [
    replayTrace('TRACE-27002-A', '第 1 轮', '查询退款到账时效', '退款申请提交后多久能到账？', '审核通过后通常 3—5 个工作日原路退回。', '', '2026-08-27 11:06'),
  ]),
  historyConversation('SESSION-20260826-003', '我已经提交退款申请，为什么还没有到账？', '2026-08-26 16:02', 'agent-refund', 'V3', [
    replayTrace('TRACE-26003-A', '第 1 轮', '未核实订单状态直接回复时效', '我已经提交退款申请，为什么还没有到账？', '退款申请一般会在审核通过后的 3—5 个工作日内原路退回。', '用户点踩：没有先核实订单号和当前审核状态。', '2026-08-26 16:02'),
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
});

evaluators.push({
  id: 'code-schema-check',
  name: '交付文件结构校验',
  kind: '代码评估',
  mode: 'preset',
  version: '0.1.0',
  versions: ['0.1.0'],
  description: '使用规则检查交付文件是否存在、可读取，并覆盖必需工作表。',
  purpose: '验证文件交付的结构和可读性。',
  category: '代码评估',
  scoreType: 'pass_fail',
  model: '规则执行器',
  prompt: '按文件交付规则执行结构校验。',
  variables: [{ name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }],
  creator: '系统',
  updatedAt: '2026-08-24 16:10',
  runCount: 36,
});

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
});


const datasets: Dataset[] = [
  {
    id: 'DS-53346',
    name: '退款问答评测集',
    description: '覆盖退款政策、申请流程和到账时间，包含真实回流问题。',
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
  {
    id: 'DS-11490',
    name: '历史会话回流集',
    description: '从真实对话中筛选有反馈的会话，保留原始回复与 Trace。',
    status: '草稿',
    source: '历史对话回流',
    createdAt: '2026-08-25 11:06',
    updatedAt: '2026-08-25 11:06',
    createdBy: '王子磊',
    draftVersionId: 'history-draft',
    fields: [
      field('h-input', '用户消息', 'Input', '回流会话中的用户输入。', true),
      field('h-actual', '原始回答', 'Agent Output', '沿用的原始 Agent 回复。'),
      field('h-trace', '原始 Trace', 'Trace', '不重新运行 Agent，保留原始 Trace。'),
      field('h-userFeedback', '用户反馈', 'User Feedback', '点赞、点踩与文字反馈。'),
    ],
    cases: [{ id: 'CASE-HISTORY-006', values: { 'h-input': historyResults[0].input, 'h-actual': historyResults[0].agentOutput, 'h-trace': 'trace://CASE-HISTORY-006', 'h-userFeedback': historyResults[0].userFeedback ?? '' }, source: '历史对话回流', createdAt: '2026-08-19', hasFile: false }],
    versions: [{ id: 'history-draft', label: '草稿', status: '草稿', caseCount: 1, createdAt: '2026-08-25 11:06', createdBy: '王子磊', note: '已选 1 条会话，待继续整理。' }],
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
  task({ id: 'TASK-20260825-001', name: '退款客服助手 V3｜回流问题评测', description: '验证退款问答的任务完成、检索证据和完整 Trace。', agent: '退款客服助手', agentVersion: 'V3', datasetId: 'DS-53346', datasetVersion: 'V2', evaluatorIds: ['P0-01', 'P0-02', 'P0-03', 'P0-05', 'P0-07', 'P0-12'], status: '部分失败', tone: 'warning', createdBy: '王子磊', createdAt: '2026-08-25 18:12', updatedAt: '2026-08-25 18:19', totalCases: 4, executableCases: 3, completedCases: 3, failedCases: 1, results: refundResults, runtime: { concurrency: 2, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260823-003', name: '退款客服助手 V2｜工具稳定性检查', description: '验证订单查询工具异常时的失败边界。', agent: '退款客服助手', agentVersion: 'V2', datasetId: 'DS-53346', datasetVersion: 'V1', evaluatorIds: ['P0-01', 'P0-10', 'P0-12'], status: '失败', tone: 'danger', createdBy: '王子磊', createdAt: '2026-08-23 11:16', updatedAt: '2026-08-23 11:18', totalCases: 1, executableCases: 1, completedCases: 1, failedCases: 1, results: failureResults, runtime: { concurrency: 1, timeout: 60, continueOnError: true } }),
  task({ id: 'TASK-20260824-008', name: '招标文件覆盖评测', description: '验证文件分析和最终交付文件的完整性。', agent: '招标文件评估助手', agentVersion: 'V1', datasetId: 'DS-24610', datasetVersion: 'V1', evaluatorIds: ['P0-01', 'P0-04', 'P0-08', 'P0-12'], status: '已完成', tone: 'success', createdBy: '演示账户', createdAt: '2026-08-24 15:34', updatedAt: '2026-08-24 16:02', totalCases: 1, executableCases: 1, completedCases: 1, failedCases: 0, results: tenderResults, runtime: { concurrency: 1, timeout: 120, continueOnError: true } }),
  task({ id: 'TASK-20260825-004', name: '退款问答回归检查', description: '基于历史对话回流验证退款回复的完整性。', agent: '退款客服助手', agentVersion: 'V2', datasetId: 'DS-11490', datasetVersion: '草稿', evaluatorIds: ['P0-01', 'P0-02', 'P0-03', 'P0-05', 'P0-07', 'P0-12'], status: '运行中', tone: 'info', createdBy: '王子磊', createdAt: '2026-08-25 19:42', updatedAt: '2026-08-25 19:44', totalCases: 1, executableCases: 1, completedCases: 0, failedCases: 0, results: historyResults, runtime: { concurrency: 1, timeout: 60, continueOnError: true } }),
];

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

const optimizationResult = (selectedCaseCount: number): OptimizationResult => ({
  status: '优化成功',
  selectedCaseCount,
  changeSummary: '针对退货条件说明不完整的问题，补充寄回方式、运费承担和转人工条件，并增加运费政策工具。',
  beforeConfig,
  afterConfig,
  changes: [
    { target: 'system_prompt', changeType: '修改', before: beforeConfig.systemPrompt, after: afterConfig.systemPrompt, reason: '补齐 Badcase 中缺失的退货条件。' },
    { target: 'tools', changeType: '新增', before: '订单查询', after: '订单查询、运费政策', reason: '支持回答运费承担问题。' },
    { target: 'skills', changeType: '修改', before: beforeConfig.skills[0].content ?? '', after: afterConfig.skills[0].content ?? '', reason: '将寄回方式和运费承担写入售后政策。' },
  ],
  scoreRows: [
    { caseId: 'CASE-HIS-024', evaluatorName: '任务完成度', beforeResult: '不通过', afterResult: '通过', judgment: '改善', reason: '优化后覆盖寄回方式和运费承担。' },
    { caseId: 'CASE-HIS-024', evaluatorName: '参考答案遵从度', beforeResult: 0.25, afterResult: 0.9, judgment: '改善', reason: '验收要点覆盖数量提升。' },
    { caseId: 'CASE-UP-019', evaluatorName: '任务完成度', beforeResult: '执行失败', afterResult: '无法比较', judgment: '无法比较', reason: '优化后仍依赖订单服务，当前无有效运行结果。' },
  ],
  summary: { improved: 2, declined: 0, unchanged: 0, incomparable: 1 },
});

const experiments: OptimizeExperiment[] = [
  { id: 'EXP-20260825-01', name: '退款客服助手 V3｜补齐退货政策说明', sourceTaskId: 'TASK-20260825-001', agent: '退款客服助手', baseVersion: 'V3', candidateVersion: '新建 Agent（待确认）', datasetVersion: '退款问答评测集 V2', status: '已完成', tone: 'success', createdAt: '2026-08-25 18:36', selectedCaseIds: ['CASE-HIS-024', 'CASE-UP-019'], selectedCaseCount: 2, result: optimizationResult(2) },
  { id: 'EXP-20260824-02', name: '招标文件评估助手 V1｜文件交付优化', sourceTaskId: 'TASK-20260824-008', agent: '招标文件评估助手', baseVersion: 'V1', candidateVersion: '新建 Agent（待确认）', datasetVersion: '招标报告评测集 V1', status: '优化中', tone: 'info', createdAt: '2026-08-24 17:20', selectedCaseIds: ['CASE-FILE-001'], selectedCaseCount: 1, result: { ...optimizationResult(1), status: '无有效修改', changeSummary: '当前输入不足以确认文件交付问题，不生成无依据修改。', changes: [], scoreRows: [], summary: { improved: 0, declined: 0, unchanged: 0, incomparable: 1 } } },
];

const comparisons: ComparisonRecord[] = [
  {
    id: 'CMP-20260825-01',
    name: '退款客服助手 V3 优化前后',
    baseLabel: '退款客服助手 V3',
    candidateLabel: '新建 Agent（优化配置）',
    dataset: '退款问答评测集 V2',
    status: '已完成',
    tone: 'success',
    comparableCases: 3,
    improvedCases: 2,
    declinedCases: 0,
    unchangedCases: 0,
    incomparableCases: 1,
    createdAt: '2026-08-25 19:02',
    evaluatorRows: [
      { evaluatorName: '任务完成度', beforeResult: '1 / 3 通过', afterResult: '2 / 3 通过', judgment: '改善' },
      { evaluatorName: '参考答案遵从度', beforeResult: 0.48, afterResult: 0.82, judgment: '改善' },
      { evaluatorName: 'Agent 轨迹质量', beforeResult: 0.73, afterResult: 0.73, judgment: '无变化' },
    ],
    caseRows: [
      { caseId: 'CASE-HIS-024', beforeResult: '不通过', afterResult: '通过', judgment: '改善', reason: '补充寄回方式和运费承担。' },
      { caseId: 'CASE-UP-018', beforeResult: '通过', afterResult: '通过', judgment: '无变化', reason: '原有回答已覆盖到账时效。' },
      { caseId: 'CASE-UP-019', beforeResult: '执行失败', afterResult: '无法比较', judgment: '无法比较', reason: '优化后没有可比较的有效结果。' },
    ],
  },
  {
    id: 'CMP-20260824-02',
    name: '招标文件 V1 文件交付对比',
    baseLabel: '招标文件评估助手 V1',
    candidateLabel: '新建 Agent（优化配置）',
    dataset: '招标报告评测集 V1',
    status: '待分析',
    tone: 'info',
    comparableCases: 1,
    improvedCases: 0,
    declinedCases: 0,
    unchangedCases: 1,
    incomparableCases: 0,
    createdAt: '2026-08-24 18:06',
    evaluatorRows: [{ evaluatorName: '文件交付质量', beforeResult: 0.94, afterResult: 0.94, judgment: '无变化' }],
    caseRows: [{ caseId: 'CASE-FILE-001', beforeResult: '通过', afterResult: '通过', judgment: '无变化', reason: '文件结构和交付说明未发生变化。' }],
  },
];

export const mockEvaluationState: EvaluationState = { agents, datasets, evaluators, tasks, experiments, comparisons };

export const cloneEvaluationState = (): EvaluationState => structuredClone(mockEvaluationState);

export const statusTone = (status: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' => {
  if (status === '已完成' || status === '通过' || status === '已提交') return 'success';
  if (status === '运行中' || status === '待重新评测' || status === '待分析') return 'info';
  if (status === '部分失败' || status === '无法执行' || status === '证据不足' || status === '草稿' || status === '待人工评估') return 'warning';
  if (status === '失败' || status === '不通过' || status === '执行失败') return 'danger';
  return 'neutral';
};

export const getTaskResults = (task: EvaluationTask): CaseResult[] => task.results;

export const getDatasetById = (state: EvaluationState, id: string): Dataset | undefined => state.datasets.find((dataset) => dataset.id === id);

export const getEvaluatorById = (state: EvaluationState, id: string): Evaluator | undefined => state.evaluators.find((evaluator) => evaluator.id === id);
