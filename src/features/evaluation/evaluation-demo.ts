import type {
  AgentConfigSnapshot,
  CaseResult,
  ComparisonCaseRow,
  ComparisonEvaluatorRow,
  ComparisonMetricCell,
  ComparisonRecord,
  ComparisonRuntimeRow,
  ComparisonTaskRef,
  Dataset,
  EvaluationTask,
  Evaluator,
  EvaluatorResult,
  OptimizationAttributionTag,
  OptimizationReportAction,
  OptimizationResult,
  OptimizationSuggestion,
  OptimizeExperiment,
  ScoreComparisonRow,
  TraceEvent,
} from './evaluation.types';

const demoField = (id: string, name: string, semantic: Dataset['fields'][number]['semantic'], description: string, required = false) => ({ id, name, semantic, description, required });

const demoTrace = (caseId: string, failedNode?: string): TraceEvent[] => [
  { id: `${caseId}-t1`, type: 'system', name: '解析售后意图与订单上下文', status: '成功', duration: '22 ms', detail: `识别 Case ${caseId} 的退款、退货或售后咨询意图。`, input: '用户问题和订单上下文', output: '已生成售后处理计划。' },
  { id: `${caseId}-t2`, type: 'retrieval', name: '售后政策知识库检索', status: '成功', duration: '410 ms', detail: '命中 7 天无理由、质量问题、退款时效和退货运费政策片段。', input: '售后场景关键词', output: '返回 6 条政策片段。' },
  { id: `${caseId}-t3`, type: 'tool', name: '订单查询', status: failedNode === 'order' ? '失败' : '成功', duration: failedNode === 'order' ? '3.8 s' : '360 ms', detail: failedNode === 'order' ? '订单服务超时，未返回订单状态。' : '返回订单状态、商品状态和售后阶段。', input: '订单号', output: failedNode === 'order' ? '无有效订单信息' : '订单状态和售后阶段', error: failedNode === 'order' ? 'ORDER_SERVICE_TIMEOUT' : undefined },
  { id: `${caseId}-t4`, type: 'agent', name: '生成售后回答', status: failedNode === 'answer' ? '失败' : '成功', duration: '1.6 s', detail: failedNode === 'answer' ? '生成的回答遗漏了用户决策所需条件。' : '根据政策片段和订单状态生成回答。', input: '政策片段、订单状态、用户问题', output: '最终回答' },
];

type DemoEvalSpec = {
  id: string;
  name: string;
  type: 'pass_fail' | 'numeric';
  status: '通过' | '不通过';
  score?: number;
  reason: string;
};

type DemoCaseDefinition = {
  id: string;
  cohort: '验证集' | '回归集';
  input: string;
  expected: string;
  order: string;
  product: string;
  stage: string;
  feedback: string;
  beforeOutput: string;
  afterOutput: string;
  before: DemoEvalSpec[];
  after: DemoEvalSpec[];
  failedNode?: 'order' | 'answer';
  comparisonReason: string;
};

const evalSpec = (id: string, name: string, type: 'pass_fail' | 'numeric', status: '通过' | '不通过', reason: string, score?: number): DemoEvalSpec => ({ id, name, type, status, reason, score });

const demoCaseDefinitions: DemoCaseDefinition[] = [
  {
    id: 'CASE-RF-001', cohort: '验证集', input: '商品签收 3 天后不想要了，还能退吗？请告诉我完整流程。', expected: '说明 7 天无理由退货适用条件、商品完好要求、寄回方式、运费承担和不能退货时的处理路径。', order: 'OD202609180042', product: '已签收 3 天，商品完好', stage: '售后咨询', feedback: '用户点踩：回答没有说明寄回方式和运费承担。',
    beforeOutput: '商品未使用且不影响二次销售时，可以申请 7 天无理由退货。',
    afterOutput: '可以申请 7 天无理由退货，但需要同时满足签收后 7 天内、商品完好且不影响二次销售。请在售后页选择“退货退款”，按页面地址寄回；无质量问题时退货运费由买家承担，质量问题由商家承担。若商品已拆封且属于例外类目，请转人工确认。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '回答只说明“可以退货”，没有给出用户实际办理所需的寄回方式、运费承担和例外处理。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', 'Expected Output 要求 5 个决策要点，Agent Output 只覆盖商品完好条件。', 0.35), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '回答语气克制，没有承诺超出政策的确定性结果。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '商品完好条件可被售后政策片段直接支持。', 0.91), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '遗漏例外类目和转人工边界，可能导致用户错误寄回。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖适用条件、寄回方式、运费承担、例外类目和转人工路径。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 的 5 个决策要点全部覆盖。', 0.96), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '回答顺序符合“结论—条件—动作—例外”的售后解释要求。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '寄回方式、运费承担和例外类目均可被售后政策 Skill 支持。', 0.95), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '明确例外类目需要转人工，避免用户误寄。')],
    comparisonReason: '配置优化补齐退货条件、寄回方式、运费承担和例外类目转人工规则。',
  },
  {
    id: 'CASE-RF-002', cohort: '验证集', input: '订单号缺失，帮我查询退款进度。', expected: '先询问订单号，不在订单号缺失时调用订单查询；说明需要的信息和下一步动作。', order: '未提供', product: '未知', stage: '退款进度查询', feedback: '用户点踩：没有订单号也直接查了订单。',
    beforeOutput: '正在为您查询退款进度，请稍等。退款申请通常会在 3-5 个工作日内到账。',
    afterOutput: '查询退款进度需要订单号。请提供订单号，我会核对订单状态和售后进度；如果暂时找不到订单号，可以先提供支付时间或商品名称，转人工协助定位。',
    failedNode: 'order',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '没有完成“先收集订单号再查询”的必要动作。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', 'Expected Output 明确要求先追问订单号，Agent Output 直接给出到账时效。', 0.2), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '不通过', '订单号缺失时仍调用订单查询工具。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '不通过', '在订单查询未返回有效结果时编造了退款进度和到账时效。', 0.18), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '未核对订单身份即输出退款进度，存在错误披露风险。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '先收集订单号，再说明查询所需信息和替代定位方式。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', '覆盖订单号要求、不可直接查询和人工协助路径。', 0.93), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '订单号为空时不调用订单查询工具。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '没有对未查询到的退款进度做事实断言。', 0.97), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '增加身份核对和人工协助路径，避免错误披露。')],
    comparisonReason: '系统提示词增加订单号前置检查，订单查询工具增加空值调用约束。',
  },
  {
    id: 'CASE-RF-003', cohort: '验证集', input: '跨境订单被海关扣留，还能退款吗？', expected: '先说明跨境售后特殊性，核实订单状态和海关节点；无法线上判断时给人工处理入口，不承诺退款成功。', order: 'OD202609180077', product: '跨境订单，海关扣留', stage: '异常售后', feedback: '用户点踩：只说稍后重试，没有给人工入口。',
    beforeOutput: '订单查询暂时不可用，请稍后重试。',
    afterOutput: '跨境订单被海关扣留时，需要先核实订单状态、物流节点和商家售后政策。请提供订单号和扣留通知截图；我不会直接承诺退款成功。若无法在线判断，转人工售后处理。',
    failedNode: 'order',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '只返回工具失败提示，没有回答跨境退款问题。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', 'Expected Output 要求核实状态、说明特殊性和人工路径，均未覆盖。', 0.12), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '不通过', '把工具异常当成最终回答，没有执行异常兜底策略。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '“暂时不可用”与工具返回一致，但没有扩展为错误结论。', 0.82), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '没有提示跨境售后不可直接承诺退款，也没有人工升级。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖跨境特殊性、核实材料、不可承诺和人工入口。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 的四个要点全部覆盖。', 0.94), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '订单查询失败后使用异常兜底并转人工。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '对海关扣留和退款结果保持条件化表述。', 0.93), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '明确不承诺退款成功并提供人工升级。')],
    comparisonReason: '工具异常不再作为最终回答；增加跨境售后核实材料、条件化承诺和人工升级。',
  },
  {
    id: 'CASE-RF-004', cohort: '验证集', input: '商品有质量问题，退货运费谁承担？', expected: '区分质量问题和无理由退货，说明质量问题运费由商家承担、需要的凭证和争议处理方式。', order: 'OD202609180112', product: '质量问题，已拍照', stage: '退货申请', feedback: '用户反馈：希望知道要提供什么凭证。',
    beforeOutput: '退货运费一般由买家承担，质量问题除外。',
    afterOutput: '质量问题退货的运费由商家承担。请在售后申请中上传商品问题照片或视频、外包装和订单信息；如商家拒绝承担，可申请平台介入。无理由退货仍按买家承担运费处理。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '只给原则，没有说明凭证和争议处理。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', '缺少凭证要求和平台介入路径。', 0.5), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '没有混淆质量问题和无理由退货的运费规则。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '质量问题运费由商家承担的表述符合政策。', 0.89), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '没有提醒凭证不足可能影响售后审核。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖责任主体、凭证和平台介入。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 的三个要点全部覆盖。', 0.95), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '清晰区分质量问题和无理由退货。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '责任主体和凭证要求均有政策依据。', 0.96), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '提示凭证和争议处理边界。')],
    comparisonReason: '售后政策 Skill 补充质量问题凭证和平台介入规则。',
  },
  {
    id: 'CASE-RF-005', cohort: '验证集', input: '一个订单有三件商品，我只想退其中一件，可以吗？', expected: '说明部分退货支持条件、按商品申请、退款金额计算和多件商品物流要求。', order: 'OD202609180155', product: '订单包含 3 件商品', stage: '部分退货', feedback: '用户点踩：没有说明退款金额怎么算。',
    beforeOutput: '支持按商品申请部分退货。',
    afterOutput: '可以按商品申请部分退货。请只选择需要退回的商品，退款金额按实际退回商品金额计算；优惠券、满减和运费按平台拆分规则处理。三件商品如需一起寄回，请在同一个包裹备注订单号。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '没有说明退款金额和寄回要求。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', 'Expected Output 要求四项，当前只覆盖支持部分退货。', 0.3), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '没有将部分退货误判为不支持。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '“支持按商品申请”符合订单售后能力。', 0.88), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '没有说明优惠拆分，可能导致退款预期偏差。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖支持条件、金额计算、物流要求。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 的四个要点全部覆盖。', 0.92), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '按商品维度组织回答。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '退款拆分规则表述保持条件化。', 0.91), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '提醒优惠拆分和包裹备注要求。')],
    comparisonReason: 'Skill 内容补充部分退货金额拆分、优惠处理和包裹要求。',
  },
  {
    id: 'CASE-RF-006', cohort: '验证集', input: '退款被拒后还能再申请吗？需要补充什么？', expected: '说明可以补充凭证后再次申请、被拒原因核对、可补充材料和平台申诉路径。', order: 'OD202609180188', product: '退款被拒', stage: '售后复议', feedback: '用户反馈：想知道具体补什么材料。',
    beforeOutput: '可以补充凭证后再次提交售后申请。',
    afterOutput: '可以再次申请，但请先查看拒绝原因并补齐材料：质量问题需照片/视频和外包装，物流问题需物流截图，金额争议需支付凭证。补齐后重新提交；如仍被拒，可申请平台介入。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '不通过', '没有回答“需要补充什么”。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '不通过', 'Expected Output 要求拒绝原因、材料和申诉路径。', 0.4), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '没有给出错误的不可再申请结论。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '可以补充凭证后再申请符合售后规则。', 0.87), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '不通过', '没有提醒先核对拒绝原因，容易重复提交无效材料。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖拒绝原因、材料清单、重新提交和平台介入。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 的四个要点全部覆盖。', 0.94), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '按复议流程组织回答。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '材料清单来自售后复议规则。', 0.94), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '提醒先核对拒绝原因，减少重复无效申请。')],
    comparisonReason: '售后政策 Skill 增加复议材料清单和平台申诉路径。',
  },
  {
    id: 'CASE-RF-007', cohort: '回归集', input: '退款申请提交后多久能到账？', expected: '说明审核通过后的到账时效、原路退回和渠道差异。', order: 'OD202609180214', product: '退款审核通过', stage: '退款到账', feedback: '用户点赞：解释清楚。',
    beforeOutput: '退款审核通过后通常 3-5 个工作日内原路退回，具体到账时间以银行或支付渠道为准。',
    afterOutput: '退款审核通过后通常 3-5 个工作日内原路退回，具体到账时间以银行或支付渠道为准。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖审核通过、到账时效、原路退回和渠道差异。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.98), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '没有承诺确定到账日。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '退款时效被政策片段支持。', 0.98), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '使用“通常”和渠道例外说明。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖审核通过、到账时效、原路退回和渠道差异。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.98), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '没有承诺确定到账日。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '退款时效被政策片段支持。', 0.98), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '使用“通常”和渠道例外说明。')],
    comparisonReason: '回归结果保持一致，优化配置没有改变退款时效回答。',
  },
  {
    id: 'CASE-RF-008', cohort: '回归集', input: '货已经寄回，怎么查看退货物流？', expected: '说明售后详情页查看入口、物流节点含义和物流长时间不更新时的处理。', order: 'OD202609180231', product: '已寄回', stage: '退货物流', feedback: '',
    beforeOutput: '可以在售后详情页查看退货物流进度。若物流两天没有更新，可能存在中转延迟，建议再等待 24 小时。',
    afterOutput: '可以在售后详情页查看退货物流进度。若物流两天没有更新，可能存在中转延迟，建议再等待 24 小时；超过 72 小时可联系承运商或平台客服。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖入口和物流延迟处理。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', '覆盖查看入口和异常处理。', 0.9), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '回答简洁且可执行。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '售后详情页和中转延迟均有政策支持。', 0.93), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '没有承诺物流恢复时间。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖入口、延迟判断和升级路径。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', '覆盖查看入口、异常处理和升级路径。', 0.94), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '保持原回答结构。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '升级路径来自物流异常规则。', 0.94), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '没有承诺物流恢复时间。')],
    comparisonReason: '回归结果未退化，新增的异常升级信息不改变原结论。',
  },
  {
    id: 'CASE-RF-009', cohort: '回归集', input: '如何取消已经提交的退货申请？', expected: '说明撤销入口、撤销后是否可以重新申请和是否占用申请次数。', order: 'OD202609180266', product: '退货申请已提交', stage: '撤销售后', feedback: '用户点赞。',
    beforeOutput: '在售后详情中选择撤销申请即可。撤销后可以再次申请，不占用后续申请次数。',
    afterOutput: '在售后详情中选择撤销申请即可。撤销后可以再次申请，不占用后续申请次数。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖撤销入口、再次申请和次数规则。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.97), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '操作步骤清楚。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '次数规则有售后流程支持。', 0.97), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '没有误导用户操作。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖撤销入口、再次申请和次数规则。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.97), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '操作步骤清楚。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '次数规则有售后流程支持。', 0.97), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '没有误导用户操作。')],
    comparisonReason: '回归结果保持一致，没有产生配置副作用。',
  },
  {
    id: 'CASE-RF-010', cohort: '回归集', input: '七天无理由包含拆封商品吗？', expected: '说明拆封商品是否可退取决于是否影响二次销售，并列明例外类目和转人工条件。', order: 'OD202609180299', product: '拆封商品', stage: '无理由退货', feedback: '用户点踩：没有说明例外类目。',
    beforeOutput: '不影响二次销售的拆封商品通常仍可申请七天无理由退货；食品、个人护理等例外类目以商品详情页和平台规则为准，无法确认时转人工。',
    afterOutput: '不影响二次销售的拆封商品通常仍可申请七天无理由退货；食品、个人护理等例外类目以商品详情页和平台规则为准，无法确认时转人工。',
    before: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖拆封条件、例外类目和转人工。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.93), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '保持条件化表述。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '例外类目来自商品详情和平台规则。', 0.93), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '提示例外类目和人工确认。')],
    after: [evalSpec('EVAL-COMPLETE', '任务完成度', 'pass_fail', '通过', '覆盖拆封条件、例外类目和转人工。'), evalSpec('EVAL-COVERAGE', '验收要点覆盖', 'numeric', '通过', 'Expected Output 三个要点全部覆盖。', 0.93), evalSpec('EVAL-INSTRUCTION', '指令遵循', 'pass_fail', '通过', '保持条件化表述。'), evalSpec('EVAL-FAITHFUL', '回答忠实度', 'numeric', '通过', '例外类目来自商品详情和平台规则。', 0.93), evalSpec('EVAL-RISK', '风险控制', 'pass_fail', '通过', '提示例外类目和人工确认。')],
    comparisonReason: '回归结果保持一致，例外类目和人工确认边界未退化。',
  },
];

const demoRuntime = (status: CaseResult['status'], index: number): NonNullable<CaseResult['runtime']> => ({
  runStatus: status,
  agentDuration: `${(5.8 + index * 0.37).toFixed(1)} s`,
  firstTokenLatency: `${520 + index * 23} ms`,
  inputTokens: 1880 + index * 74,
  outputTokens: 410 + index * 18,
  totalTokens: 2290 + index * 92,
  evaluatorDuration: `${(2.2 + index * 0.08).toFixed(1)} s`,
});

const makeDemoResult = (definition: DemoCaseDefinition, mode: 'before' | 'after', runtimeIndex: number): CaseResult => {
  const specs = mode === 'before' ? definition.before : definition.after;
  const evaluatorResults: EvaluatorResult[] = specs.map((item) => ({
    evaluatorId: item.id,
    evaluatorName: item.name,
    scoreType: item.type,
    evaluationResult: item.type === 'numeric' ? (item.score ?? (item.status === '通过' ? 0.9 : 0.4)) : item.status,
    evaluationReason: item.reason,
    evaluationStatus: item.status,
    traceRefs: [`${definition.id}-${mode}-t2`, `${definition.id}-${mode}-t4`],
  }));
  const passed = specs.every((item) => item.status === '通过');
  return {
    caseId: definition.id,
    status: passed ? '通过' : '不通过',
    caseMark: definition.cohort === '验证集' ? 'Badcase' : 'Goodcase',
    input: definition.input,
    expectedOutput: definition.expected,
    agentOutput: mode === 'before' ? definition.beforeOutput : definition.afterOutput,
    userFeedback: definition.feedback,
    agentConfiguration: mode === 'before'
      ? '退款客服助手 V3 · system_prompt v3 · tools: 订单查询 · skills: 售后政策'
      : '退款客服助手优化候选 · system_prompt v4 · tools: 订单查询、运费政策 · skills: 售后政策、跨境售后',
    trace: demoTrace(`${definition.id}-${mode}`, mode === 'before' ? definition.failedNode : undefined),
    evaluatorResults,
    humanEvaluation: definition.feedback ? { humanLabel: definition.cohort === '验证集' ? '回答质量' : '服务体验', humanScore: mode === 'before' ? 0.62 : 0.9, humanReason: definition.feedback || '回归 Case 保持原有服务质量。', updatedAt: '2026-09-24 09:42', updatedBy: '客服质检员' } : undefined,
    runtime: demoRuntime(passed ? '通过' : '不通过', runtimeIndex),
  };
};

export const demoBeforeResults: CaseResult[] = demoCaseDefinitions.map((item, index) => makeDemoResult(item, 'before', index));
export const demoAfterResults: CaseResult[] = demoCaseDefinitions.map((item, index) => makeDemoResult(item, 'after', index + 1));

const evaluatorPrompts: Record<string, string> = {
  'EVAL-COMPLETE': `# 评估目标\n判断 Agent 是否完成用户提出的售后任务。\n# 判断标准\n1. 直接回答用户的核心问题。\n2. 给出可执行的下一步动作。\n3. 覆盖用户做决定所需的条件、例外和边界。\n# 输出\n返回 result（通过或不通过）和 reason。reason 必须指出遗漏的具体事实，并引用 Agent Output 中的位置或 Trace 节点名称。`,
  'EVAL-COVERAGE': `# 评估目标\n判断 Agent Output 是否覆盖 Expected Output 中的验收要点。\n# 评分规则\n逐条匹配验收要点，按覆盖比例输出 0 到 1 分。部分覆盖不得判为完全通过。\n# 输出\n返回 score 和 reason。reason 必须列出已覆盖、未覆盖的验收要点及其在回答中的位置。`,
  'EVAL-INSTRUCTION': `# 评估目标\n判断 Agent 是否遵守系统提示词、工具约束、Skill 规则和用户要求。\n# 重点检查\n前置信息收集、工具调用条件、异常兜底、回答顺序、承诺边界。\n# 输出\n返回 result 和 reason。reason 需要指出违反的具体配置位置或 Trace 节点。`,
  'EVAL-FAITHFUL': `# 评估目标\n判断回答中的事实和结论是否得到售后政策、订单信息或工具结果支持。\n# 评分规则\n存在无依据的政策承诺、金额、时效或订单事实时不得通过。0.85 为通过阈值。\n# 输出\n返回 score 和 reason。reason 需要给出支持或冲突的证据来源。`,
  'EVAL-RISK': `# 评估目标\n判断回答是否遗漏可能造成错误退货、错误退款或信息泄露的风险提示。\n# 重点检查\n例外类目、身份核对、金额争议、跨境异常、凭证不足、人工升级。\n# 输出\n返回 result 和 reason。reason 需要说明风险行为和可能后果。`,
};

export const demoEvaluators: Evaluator[] = [
  { id: 'EVAL-COMPLETE', name: '任务完成度', kind: '模型评估器', mode: 'preset', version: '0.2.0', versions: ['0.1.0', '0.2.0'], description: '判断售后回答是否覆盖用户完成任务所需的信息和下一步动作。', purpose: '检查用户任务是否真正完成。', category: '结果质量', scoreType: 'pass_fail', model: 'Doubao-Seed-1.6', prompt: evaluatorPrompts['EVAL-COMPLETE'], variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: false }], creator: '系统', updatedAt: '2026-09-24 09:00', runCount: 218 },
  { id: 'EVAL-COVERAGE', name: '验收要点覆盖', kind: '模型评估器', mode: 'preset', version: '0.2.0', versions: ['0.1.0', '0.2.0'], description: '按 Expected Output 验收要点计算回答覆盖率，适合判断流程型售后问题。', purpose: '量化回答是否覆盖全部验收要点。', category: '结果质量', scoreType: 'numeric', model: 'Doubao-Seed-1.6', prompt: evaluatorPrompts['EVAL-COVERAGE'], variables: [{ name: 'Expected Output', semantic: 'Expected Output', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }], creator: '系统', updatedAt: '2026-09-24 09:00', runCount: 218, passThreshold: 0.8 },
  { id: 'EVAL-INSTRUCTION', name: '指令遵循', kind: '模型评估器', mode: 'preset', version: '0.2.0', versions: ['0.1.0', '0.2.0'], description: '检查回答是否遵守售后流程、工具前置条件和异常兜底要求。', purpose: '验证 Agent 是否按照配置执行。', category: '过程质量', scoreType: 'pass_fail', model: 'Doubao-Seed-1.6-flash', prompt: evaluatorPrompts['EVAL-INSTRUCTION'], variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Configuration', semantic: 'Agent Configuration', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }], creator: '系统', updatedAt: '2026-09-24 09:00', runCount: 218 },
  { id: 'EVAL-FAITHFUL', name: '回答忠实度', kind: '模型评估器', mode: 'preset', version: '0.2.0', versions: ['0.1.0', '0.2.0'], description: '检查政策、订单和工具事实是否被正确引用，防止编造时效、金额和退款结果。', purpose: '验证回答是否有证据支持。', category: '知识与证据', scoreType: 'numeric', model: 'Doubao-Seed-1.6', prompt: evaluatorPrompts['EVAL-FAITHFUL'], variables: [{ name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: true }, { name: 'Expected Output', semantic: 'Expected Output', required: false }], creator: '系统', updatedAt: '2026-09-24 09:00', runCount: 218, passThreshold: 0.85 },
  { id: 'EVAL-RISK', name: '风险控制', kind: '模型评估器', mode: 'preset', version: '0.2.0', versions: ['0.1.0', '0.2.0'], description: '检查售后回答是否覆盖例外类目、身份核对、金额争议和人工升级边界。', purpose: '避免回答导致用户错误操作或错误承诺。', category: '风险与边界', scoreType: 'pass_fail', model: 'Doubao-Seed-1.6', prompt: evaluatorPrompts['EVAL-RISK'], variables: [{ name: 'Input', semantic: 'Input', required: true }, { name: 'Agent Output', semantic: 'Agent Output', required: true }, { name: 'Trace', semantic: 'Trace', required: false }, { name: 'User Feedback', semantic: 'User Feedback', required: false }], creator: '系统', updatedAt: '2026-09-24 09:00', runCount: 218 },
];

const demoFields = [
  demoField('d-input', '用户问题', 'Input', '提供给 Agent 的完整用户输入。', true),
  demoField('d-expected', '验收要点', 'Expected Output', '按用户决策所需信息定义回答验收标准。'),
  demoField('d-actual', 'Agent 回答', 'Agent Output', '候选 Agent 运行后的最终回答。'),
  demoField('d-trace', '执行轨迹', 'Trace', '运行时保存的完整 Trace，用于任务明细下钻。'),
  demoField('d-order', '订单号', 'Custom', '订单查询和售后定位所需字段。'),
  demoField('d-product', '商品状态', 'Custom', '签收、拆封、质量、物流等商品上下文。'),
  demoField('d-stage', '售后阶段', 'Custom', '咨询、申请、复议、物流、到账等流程阶段。'),
  demoField('d-feedback', '用户反馈', 'User Feedback', '历史对话中的点赞、点踩和文字反馈。'),
];

export const demoDataset: Dataset = {
  id: 'DS-OPT-REFUND-10',
  name: '售后退款优化验证集',
  description: '覆盖退款条件、订单前置校验、跨境异常、运费责任、部分退货和售后复议，包含 6 条验证集 Badcase 与 4 条回归集 Case。',
  tags: ['售后', 'Badcase'],
  status: '已提交',
  source: '历史对话回流',
  createdAt: '2026-09-24 09:18',
  updatedAt: '2026-09-24 09:36',
  createdBy: '客服质检组',
  draftVersionId: '',
  fields: demoFields,
  cases: demoCaseDefinitions.map((item) => ({
    id: item.id,
    values: {
      'd-input': item.input,
      'd-expected': item.expected,
      'd-actual': item.beforeOutput,
      'd-trace': `trace://${item.id}`,
      'd-order': item.order,
      'd-product': item.product,
      'd-stage': item.stage,
      'd-feedback': item.feedback,
    },
    source: item.cohort === '验证集' ? '历史对话回流' : '用户上传',
    createdAt: '2026-09-24',
    hasFile: false,
  })),
  versions: [{
    id: 'DS-OPT-REFUND-10-V1',
    label: 'V1',
    status: '已提交',
    caseCount: 10,
    createdAt: '2026-09-24 09:36',
    createdBy: '客服质检组',
    note: '6 条 Badcase 作为验证集，4 条已通过 Case 作为回归集。',
  }],
};

const demoBeforeConfig: AgentConfigSnapshot = {
  systemPrompt: `# 角色\n你是某电商平台的售后客服助手，负责回答退款、退货、物流和售后进度问题。\n\n# 回答要求\n1. 根据售后政策回答，不承诺平台规则之外的结果。\n2. 涉及订单状态时调用订单查询工具。\n3. 使用简洁、礼貌的中文回答。\n\n# 可用资源\n- 售后政策 Skill：7 天无理由退货、质量问题、退款时效。\n- 订单查询工具：查询订单状态和售后进度。`,
  tools: [
    { id: 'order-query', name: '订单查询', detail: '用途：查询订单状态和售后进度。\n输入：订单号。\n返回：订单状态、商品状态、售后阶段。\n当前约束：未定义订单号为空、工具超时和跨境订单异常时的处理方式。' },
  ],
  skills: [
    { id: 'refund-policy', name: '售后政策', content: '7 天无理由退货：签收后 7 天内、商品完好且不影响二次销售时可申请。\n退款时效：审核通过后通常 3-5 个工作日原路退回。\n质量问题：质量问题退货运费由商家承担。' },
  ],
};

const demoAfterConfig: AgentConfigSnapshot = {
  systemPrompt: `# 角色\n你是某电商平台的售后客服助手，负责回答退款、退货、物流和售后进度问题。\n\n# 处理顺序\n1. 先识别用户问题属于政策咨询、订单进度、异常售后还是金额争议。\n2. 涉及订单状态、退款进度或个性化金额时，必须先确认订单号；订单号缺失时先追问，不调用订单查询工具。\n3. 回答按“结论 → 适用条件 → 操作步骤 → 例外与人工入口”组织。\n\n# 回答边界\n1. 退货条件必须同时说明适用条件、寄回方式、运费承担和例外类目。\n2. 质量问题、无理由退货、跨境异常、金额争议分别使用对应规则，不混用结论。\n3. 工具失败时说明失败原因、替代路径和人工入口，不编造订单状态、退款进度、金额或到账时效。\n4. 涉及海关扣留、平台介入、退款拒绝或争议金额时，不承诺结果，说明所需凭证和人工处理方式。\n\n# 可用资源\n- 售后政策 Skill：7 天无理由、质量问题、退款时效、退货运费、复议和例外类目。\n- 订单查询工具：仅在订单号完整时调用。\n- 运费政策工具：查询质量问题和无理由退货的运费责任。`,
  tools: [
    { id: 'order-query', name: '订单查询', detail: '用途：查询订单状态、商品状态、售后阶段和退款进度。\n输入：完整订单号。\n前置条件：订单号不得为空；缺失时先追问订单号或支付凭证。\n失败处理：工具超时、订单不存在或跨境节点异常时，输出异常说明和人工入口，不推断订单事实。' },
    { id: 'shipping-policy', name: '运费政策', detail: '用途：查询质量问题、无理由退货、部分退货和跨境异常场景的运费责任。\n输入：售后场景、商品状态、是否质量问题。\n返回：责任主体、凭证要求、平台介入条件。\n使用边界：不替代订单金额计算，金额争议需要支付凭证和人工复核。' },
  ],
  skills: [
    { id: 'refund-policy', name: '售后政策', content: `# 7 天无理由退货\n签收后 7 天内，商品完好且不影响二次销售时可申请。回答必须同时说明适用条件、寄回方式、运费承担和例外类目。\n\n# 质量问题\n质量问题退货运费由商家承担。要求用户提供问题照片或视频、外包装和订单信息；商家拒绝承担时可申请平台介入。\n\n# 退款时效\n审核通过后通常 3-5 个工作日内原路退回，具体到账时间以银行或支付渠道处理为准。\n\n# 部分退货\n支持按商品申请。退款金额按实际退回商品金额计算，优惠券、满减和运费按平台拆分规则处理。\n\n# 售后复议\n退款被拒后可先核对拒绝原因，再按问题类型补凭证重新申请；仍被拒绝时可申请平台介入。\n\n# 例外与升级\n拆封商品、食品、个人护理、跨境海关扣留、金额争议和权限问题需要按例外规则处理，无法线上判断时转人工。` },
    { id: 'cross-border', name: '跨境售后', content: '跨境订单被海关扣留时，先核实订单状态、物流节点和商家售后政策。需要用户提供订单号和扣留通知截图。不得承诺退款成功；无法在线判断时转人工售后。' },
  ],
};

const scoreRows: ScoreComparisonRow[] = demoCaseDefinitions.flatMap((definition) => definition.before.map((before, index) => {
  const after = definition.after[index];
  const judgment = before.status === after.status && before.score === after.score ? '无变化' : before.status === '不通过' && after.status === '通过' ? '改善' : before.status === '通过' && after.status === '不通过' ? '下降' : before.score !== undefined && after.score !== undefined && after.score > before.score ? '改善' : before.score !== undefined && after.score !== undefined && after.score < before.score ? '下降' : '无变化';
  return {
    caseId: definition.id,
    evaluatorName: before.name,
    beforeResult: before.type === 'numeric' ? (before.score ?? 0) : before.status,
    afterResult: after.type === 'numeric' ? (after.score ?? 0) : after.status,
    judgment,
    reason: `${before.reason} 优化后：${after.reason}`,
  };
}));

const demoSummary = {
  improved: scoreRows.filter((item) => item.judgment === '改善').length,
  declined: scoreRows.filter((item) => item.judgment === '下降').length,
  unchanged: scoreRows.filter((item) => item.judgment === '无变化').length,
  incomparable: scoreRows.filter((item) => item.judgment === '无法比较').length,
};

const demoSuggestions: OptimizationSuggestion[] = [
  {
    id: 'SUG-OPT-001',
    problem: '订单号缺失时仍调用订单查询，导致无法定位退款进度并产生编造时效风险。',
    caseIds: ['CASE-RF-002'],
    evaluatorIds: ['EVAL-INSTRUCTION', 'EVAL-FAITHFUL', 'EVAL-RISK'],
    evidence: 'CASE-RF-002 的 EVAL-INSTRUCTION 指出“订单号缺失时仍调用订单查询工具”；Trace 中订单查询节点返回 ORDER_SERVICE_TIMEOUT，但回答仍输出“3-5 个工作日到账”。',
    rootCause: '系统提示词只写“涉及订单状态时调用订单查询”，没有定义订单号前置校验和工具失败后的回答边界。',
    suggestion: '在 system_prompt 中增加“订单号缺失先追问，不调用订单查询”，并在 order-query 工具描述中增加空值和超时处理。',
    expectedEffect: 'EVAL-INSTRUCTION、EVAL-FAITHFUL、EVAL-RISK 从不通过转为通过。',
    handling: '已纳入配置修改',
  },
  {
    id: 'SUG-OPT-002',
    problem: '退货条件回答只覆盖“商品完好”，遗漏寄回方式、运费承担和例外类目。',
    caseIds: ['CASE-RF-001', 'CASE-RF-004', 'CASE-RF-005'],
    evaluatorIds: ['EVAL-COMPLETE', 'EVAL-COVERAGE', 'EVAL-RISK'],
    evidence: '三条 Case 的 EVAL-COVERAGE 分别为 0.35、0.50、0.30；评分原因都指出 Expected Output 中存在未覆盖的流程条件。',
    rootCause: '售后政策 Skill 只记录原则性规则，没有要求回答结构和必须输出的决策要点。',
    suggestion: '扩充售后政策 Skill，加入质量问题凭证、部分退货金额拆分、例外类目和平台介入规则；system_prompt 统一回答顺序。',
    expectedEffect: '验证集回答覆盖率提升，回归集不降低已有结论的忠实度。',
    handling: '已纳入配置修改',
  },
  {
    id: 'SUG-OPT-003',
    problem: '跨境海关扣留场景缺少人工升级和材料要求，线上无法可靠判断退款结果。',
    caseIds: ['CASE-RF-003'],
    evaluatorIds: ['EVAL-COMPLETE', 'EVAL-RISK'],
    evidence: 'CASE-RF-003 的 EVAL-COVERAGE 仅 0.12，评分原因指出缺少海关节点核实、扣留通知截图和人工入口。',
    rootCause: '问题依赖跨境物流节点、商家政策和平台规则，单靠 Agent 配置无法获得确定结果。',
    suggestion: '增加跨境售后 Skill 和人工升级话术，要求用户提供订单号、扣留通知截图；退款结果由人工复核。',
    expectedEffect: '降低错误承诺风险，但不能替代人工判断退款是否成立。',
    handling: '需人工处理',
    unfixableReason: '涉及外部海关状态、商家政策和平台权限，优化系统无法自行确认。',
  },
  {
    id: 'SUG-OPT-004',
    problem: '退款被拒后的复议材料没有按问题类型给出，用户无法准备有效证据。',
    caseIds: ['CASE-RF-006'],
    evaluatorIds: ['EVAL-COMPLETE', 'EVAL-COVERAGE', 'EVAL-RISK'],
    evidence: 'CASE-RF-006 的 EVAL-COVERAGE 为 0.40，评分原因指出缺少拒绝原因核对、材料清单和平台申诉路径。',
    rootCause: '售后政策 Skill 没有维护复议材料矩阵，优化系统只能给出泛化建议。',
    suggestion: '由售后运营补充质量问题、物流问题、金额争议的材料标准，并在 Skill 中固化。',
    expectedEffect: '提高复议一次提交的有效性，减少重复申请。',
    handling: '超出优化范围',
    unfixableReason: '材料标准属于业务知识维护，不能通过修改 Agent 配置凭空生成。',
  },
];

const demoAttributionTags: OptimizationAttributionTag[] = [
  { id: 'prompt-completion', category: 'Prompt', label: '任务完成条件不明确', count: 6 },
  { id: 'skill-flow', category: 'Skill', label: '关键流程与知识缺失', count: 5 },
  { id: 'model-instruction', category: '模型', label: '指令遵循失败', count: 2 },
  { id: 'prompt-constraint', category: 'Prompt', label: '回答约束缺失', count: 4 },
  { id: 'tool-result', category: '工具', label: '返回结果不符合定义', count: 2 },
  { id: 'skill-exception', category: 'Skill', label: '例外场景知识缺失', count: 3 },
  { id: 'model-external', category: '模型', label: '外部结果使用错误', count: 1 },
  { id: 'prompt-context', category: 'Prompt', label: '必要上下文缺失', count: 1 },
  { id: 'tool-params', category: '工具', label: '参数定义不完整', count: 1 },
  { id: 'model-context', category: '模型', label: '上下文信息遗漏', count: 1 },
];

const demoReportActions: OptimizationReportAction[] = [
  {
    id: 'ACT-OPT-001',
    priority: '优先处理',
    target: 'system_prompt',
    changeType: '修改',
    title: '补充回答结构与异常处理边界',
    summary: '要求回答固定按“结论—适用条件—操作步骤—例外与人工入口”组织；订单号缺失时先追问，工具失败时不得推断退款进度或到账时效。',
    reason: '6 条 Badcase 都存在缺少决策条件或异常边界的问题，其中 2 条同时出现工具失败后继续生成业务结论。',
    caseIds: ['CASE-RF-001', 'CASE-RF-002', 'CASE-RF-003', 'CASE-RF-004', 'CASE-RF-005', 'CASE-RF-006'],
    evaluatorIds: ['EVAL-COMPLETE', 'EVAL-COVERAGE', 'EVAL-INSTRUCTION', 'EVAL-FAITHFUL', 'EVAL-RISK'],
    tagIds: ['prompt-completion', 'model-instruction', 'prompt-constraint', 'model-external'],
    validation: '复用 6 条 Badcase，检查任务完成度、指令遵循、回答忠实度和风险控制是否达到对应阈值。',
  },
  {
    id: 'ACT-OPT-002',
    priority: '随后处理',
    target: 'tools',
    changeType: '修改',
    title: '完善订单查询参数与失败返回',
    summary: '明确完整订单号为必填参数，并统一订单号缺失、服务超时、订单不存在和跨境节点异常的返回结构；异常结果不得被当作成功响应。',
    reason: 'CASE-RF-002、CASE-RF-003 均出现订单信息不可用后继续生成退款结论，工具边界和返回定义没有被 Agent 正确识别。',
    caseIds: ['CASE-RF-002', 'CASE-RF-003'],
    evaluatorIds: ['EVAL-INSTRUCTION', 'EVAL-FAITHFUL', 'EVAL-RISK'],
    tagIds: ['tool-result', 'tool-params', 'model-external'],
    validation: '构造订单号缺失、服务超时、订单不存在和跨境节点异常四类请求，确认工具失败不会进入成功分支。',
  },
  {
    id: 'ACT-OPT-003',
    priority: '随后处理',
    target: 'skills',
    changeType: '修改',
    title: '补齐售后政策流程与例外知识',
    summary: '在售后政策 Skill 中补充寄回方式、运费承担、部分退款金额、复议材料和人工升级规则，并要求按场景输出用户完成售后的必要动作。',
    reason: '4 条流程型 Badcase 只回答原则，没有覆盖寄回、凭证、退款拆分或复议材料等可执行信息。',
    caseIds: ['CASE-RF-001', 'CASE-RF-004', 'CASE-RF-005', 'CASE-RF-006'],
    evaluatorIds: ['EVAL-COMPLETE', 'EVAL-COVERAGE', 'EVAL-RISK'],
    tagIds: ['skill-flow', 'skill-exception', 'prompt-completion'],
    validation: '检查 Expected Output 要点覆盖率，并确认例外类目、跨境异常和复议场景都提供人工升级路径。',
  },
];

const demoOptimizationResult: OptimizationResult = {
  status: '优化成功',
  selectedCaseCount: 6,
  changeSummary: '围绕订单前置校验、退货条件覆盖、工具异常兜底和售后复议材料，重写系统提示词、工具约束和售后政策 Skill。',
  beforeConfig: demoBeforeConfig,
  afterConfig: demoAfterConfig,
  changes: [
    { target: 'system_prompt', changeType: '修改', before: demoBeforeConfig.systemPrompt, after: demoAfterConfig.systemPrompt, reason: '问题模式集中在“回答结构不完整”和“工具失败后继续推断”。优化依据来自 CASE-RF-001、002、003、005 的 EVAL-COMPLETE、EVAL-INSTRUCTION、EVAL-FAITHFUL 和 EVAL-RISK 评分原因。修改后固定回答顺序，增加订单号前置校验、异常兜底和承诺边界。', caseIds: ['CASE-RF-001', 'CASE-RF-002', 'CASE-RF-003', 'CASE-RF-005'], evaluatorIds: ['EVAL-COMPLETE', 'EVAL-INSTRUCTION', 'EVAL-FAITHFUL', 'EVAL-RISK'], evidence: '评估器原因指出：缺少寄回方式和运费承担、订单号缺失仍查询、工具失败后编造进度、部分退货金额未说明。', expectedEffect: '验证集 EVAL-COMPLETE、EVAL-INSTRUCTION、EVAL-RISK 全部通过，回归集保持原有通过状态。' },
    { target: 'tools', changeType: '新增', before: demoBeforeConfig.tools.map((item) => `${item.name}\n${item.detail}`).join('\n\n'), after: demoAfterConfig.tools.map((item) => `${item.name}\n${item.detail}`).join('\n\n'), reason: '问题模式是“工具可用但调用边界不清”。CASE-RF-002 的 Trace 显示订单号为空仍触发订单查询；CASE-RF-003 的订单查询超时后没有替代路径。修改 order-query 的前置条件、失败处理，并新增 shipping-policy 以回答质量问题和无理由退货的运费责任。', caseIds: ['CASE-RF-002', 'CASE-RF-003', 'CASE-RF-004'], evaluatorIds: ['EVAL-INSTRUCTION', 'EVAL-FAITHFUL', 'EVAL-RISK'], evidence: 'Trace 节点“订单查询”在 CASE-RF-002、003 中分别返回 ORDER_SERVICE_TIMEOUT；评估器原因同时指出没有追问订单号和人工入口。', expectedEffect: '工具调用前完成信息校验，工具失败不再产生无依据订单结论。' },
    { target: 'skills', changeType: '修改', before: demoBeforeConfig.skills.map((item) => `${item.name}\n${item.content}`).join('\n\n'), after: demoAfterConfig.skills.map((item) => `${item.name}\n${item.content}`).join('\n\n'), reason: '问题模式是“知识规则存在但没有转成回答要求”。CASE-RF-001、004、005、006 的 EVAL-COVERAGE 都低于 0.80，评分原因分别指出寄回方式、质量问题凭证、部分退货金额拆分和复议材料缺失。修改 Skill 使规则按场景输出，并补充跨境售后和人工升级边界。', caseIds: ['CASE-RF-001', 'CASE-RF-004', 'CASE-RF-005', 'CASE-RF-006'], evaluatorIds: ['EVAL-COMPLETE', 'EVAL-COVERAGE', 'EVAL-RISK'], evidence: 'Expected Output 要求回答条件、流程、费用、例外和下一步动作，现有 Skill 只有原则性描述。', expectedEffect: '验证集验收覆盖率从 0.12-0.50 提升到 0.92 以上，回归集回答保持一致。' },
  ],
  suggestions: demoSuggestions,
  report: {
    generatedAt: '2026-09-24 10:18',
    summary: [
      '6 条 Badcase 共产生 21 个失败评估项，涉及 5 个评估器。',
      '问题主要集中在 Prompt 回答约束、Skill 流程知识和工具异常返回。',
      '优先补充回答结构与订单查询边界，可覆盖全部 6 条 Badcase。',
    ],
    attributionTags: demoAttributionTags,
    actions: demoReportActions,
    unresolved: [{
      id: 'UNR-OPT-001',
      title: '退款复议材料标准需要业务维护',
      reason: '质量问题、物流问题和金额争议的材料清单属于业务知识，建议售后运营确认后再写入 Skill。',
    }],
  },
  scoreRows,
  summary: demoSummary,
  comparisonId: 'CMP-OPT-REFUND-10',
};

export const demoTasks: EvaluationTask[] = [{
  id: 'TASK-OPT-REFUND-001',
  name: '售后退款全链路质量评测',
  description: '基于 10 条售后 Case 检查退款条件、订单前置校验、跨境异常、运费责任、部分退货和售后复议。',
  agentType: '万智',
  agent: '退款客服助手',
  agentVersion: 'V3',
  datasetId: demoDataset.id,
  datasetVersion: 'V1',
  evaluatorIds: demoEvaluators.map((item) => item.id),
  status: '已完成',
  tone: 'success',
  createdBy: '客服质检组',
  createdAt: '2026-09-24 09:42',
  updatedAt: '2026-09-24 10:18',
  totalCases: 10,
  executableCases: 10,
  completedCases: 10,
  failedCases: 0,
  results: demoBeforeResults,
  runtime: { concurrency: 2, timeout: 90, continueOnError: true },
}];

const demoTaskRefs: ComparisonTaskRef[] = [
  { taskId: 'TASK-OPT-BASE-V3', name: '优化前｜退款客服助手 V3', label: '优化前 V3', role: '对照组', agent: '退款客服助手', agentVersion: 'V3', datasetVersion: 'V1', evaluatorIds: demoEvaluators.map((item) => item.id) },
  { taskId: 'TASK-OPT-CANDIDATE-V1', name: '优化后｜候选配置 V1', label: '优化后 V1', role: '实验组', agent: '退款客服助手', agentVersion: '优化候选 V1', datasetVersion: 'V1', evaluatorIds: demoEvaluators.map((item) => item.id) },
];

const demoMetricValue = (item: EvaluatorResult) => item.scoreType === 'numeric' && typeof item.evaluationResult === 'number' ? item.evaluationResult : item.evaluationStatus === '通过' ? 1 : 0;
const demoAverage = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const makeDemoEvaluatorRows = (before: CaseResult[], after: CaseResult[]): ComparisonEvaluatorRow[] => demoEvaluators.map((evaluator) => {
  const buildCell = (results: CaseResult[], taskId: string, previous?: ComparisonMetricCell): ComparisonMetricCell => {
    const values = results.map((item) => item.evaluatorResults.find((result) => result.evaluatorId === evaluator.id)).filter((item): item is EvaluatorResult => Boolean(item));
    const numericValues = values.map(demoMetricValue);
    const value = demoAverage(numericValues);
    const passed = values.filter((item) => item.evaluationStatus === '通过').length;
    const result = evaluator.scoreType === 'numeric' ? `${(value ?? 0).toFixed(2)} · ${passed}/${values.length} 通过` : `${passed}/${values.length} 通过`;
    const cell: ComparisonMetricCell = { taskId, result, value, coverage: `${values.length}/${before.length}`, state: taskId === demoTaskRefs[0].taskId ? '对照组' : '有效' };
    if (!previous || value === undefined || previous.value === undefined) return cell;
    const delta = value - previous.value;
    return { ...cell, delta: evaluator.scoreType === 'numeric' ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}` : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`, judgment: delta > 0.005 ? '改善' : delta < -0.005 ? '下降' : '无变化' };
  };
  const beforeCell = buildCell(before, demoTaskRefs[0].taskId);
  const afterCell = buildCell(after, demoTaskRefs[1].taskId, beforeCell);
  return { metric: evaluator.name, evaluatorName: evaluator.name, evaluatorId: evaluator.id, scoreType: evaluator.scoreType, cells: { [demoTaskRefs[0].taskId]: beforeCell, [demoTaskRefs[1].taskId]: afterCell } };
});

const makeDemoRuntimeRows = (): ComparisonRuntimeRow[] => {
  const metrics: Array<{ name: string; read: (item: CaseResult) => number | undefined; format: (value: number) => string }> = [
    { name: 'Agent 耗时', read: (item) => Number(item.runtime?.agentDuration.replace(' s', '')), format: (value) => `${value.toFixed(1)} s` },
    { name: '首字时延', read: (item) => Number(item.runtime?.firstTokenLatency.replace(' ms', '')), format: (value) => `${Math.round(value)} ms` },
    { name: 'Total Tokens', read: (item) => item.runtime?.totalTokens, format: (value) => `${(value / 1000).toFixed(1)}K` },
  ];
  return metrics.map((metric) => {
    const buildCell = (results: CaseResult[], taskId: string, previous?: ComparisonMetricCell): ComparisonMetricCell => {
      const value = demoAverage(results.map(metric.read).filter((item): item is number => item !== undefined));
      const cell: ComparisonMetricCell = { taskId, result: value === undefined ? '未采集' : metric.format(value), value, coverage: `${results.length}/${results.length}`, state: taskId === demoTaskRefs[0].taskId ? '对照组' : '有效' };
      if (!previous || value === undefined || previous.value === undefined) return cell;
      const delta = (value - previous.value) / (previous.value || 1);
      return { ...cell, delta: `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`, judgment: delta < -0.005 ? '改善' : delta > 0.005 ? '下降' : '无变化' };
    };
    const beforeCell = buildCell(demoBeforeResults, demoTaskRefs[0].taskId);
    const afterCell = buildCell(demoAfterResults, demoTaskRefs[1].taskId, beforeCell);
    return { metric: metric.name, cells: { [demoTaskRefs[0].taskId]: beforeCell, [demoTaskRefs[1].taskId]: afterCell } };
  });
};

const makeDemoCaseRows = (): ComparisonCaseRow[] => demoCaseDefinitions.map((definition, index) => {
  const before = demoBeforeResults[index];
  const after = demoAfterResults[index];
  const changed = before.agentOutput !== after.agentOutput || before.evaluatorResults.some((item, resultIndex) => item.evaluationStatus !== after.evaluatorResults[resultIndex].evaluationStatus);
  return {
    caseId: definition.id,
    cohort: definition.cohort,
    sharedValues: {
      Input: definition.input,
      'Expected Output': definition.expected,
      订单号: definition.order,
      商品状态: definition.product,
      售后阶段: definition.stage,
      'User Feedback': definition.feedback || '未采集',
    },
    outputs: {
      [demoTaskRefs[0].taskId]: { taskId: demoTaskRefs[0].taskId, output: before.agentOutput, evaluatorResults: before.evaluatorResults },
      [demoTaskRefs[1].taskId]: { taskId: demoTaskRefs[1].taskId, output: after.agentOutput, evaluatorResults: after.evaluatorResults },
    },
    judgment: changed ? '有差异' : '一致',
    reason: definition.comparisonReason,
  };
});

export const demoComparisons: ComparisonRecord[] = [{
  id: 'CMP-OPT-REFUND-10',
  name: '售后退款优化｜验证集与回归集对比',
  controlTaskId: demoTaskRefs[0].taskId,
  experimentTaskIds: [demoTaskRefs[1].taskId],
  taskRefs: demoTaskRefs,
  dataset: demoDataset.name,
  datasetId: demoDataset.id,
  datasetVersion: 'V1',
  status: '已完成',
  tone: 'success',
  totalCases: 10,
  comparableCases: 10,
  differentCases: 6,
  sameCases: 4,
  incomparableCases: 0,
  createdAt: '2026-09-24 10:18',
  sharedFields: ['Input', 'Expected Output', '订单号', '商品状态', '售后阶段', 'User Feedback'],
  evaluatorRows: makeDemoEvaluatorRows(demoBeforeResults, demoAfterResults),
  runtimeRows: makeDemoRuntimeRows(),
  caseRows: makeDemoCaseRows(),
}];

export const demoExperiments: OptimizeExperiment[] = [{
  id: 'EXP-OPT-REFUND-001',
  name: '售后退款全链路｜配置优化实验',
  sourceTaskId: 'TASK-OPT-REFUND-001',
  agentType: '万智',
  agent: '退款客服助手',
  baseVersion: 'V3',
  candidateVersion: '优化候选 V1',
  datasetVersion: '售后退款优化验证集 V1',
  followUpMode: '直接实验对比',
  status: '已完成',
  tone: 'success',
  createdAt: '2026-09-24 10:04',
  selectedCaseIds: demoCaseDefinitions.filter((item) => item.cohort === '验证集').map((item) => item.id),
  selectedCaseCount: 6,
  regressionCaseIds: demoCaseDefinitions.filter((item) => item.cohort === '回归集').map((item) => item.id),
  result: { ...demoOptimizationResult, comparisonId: 'CMP-OPT-REFUND-10' },
}];
