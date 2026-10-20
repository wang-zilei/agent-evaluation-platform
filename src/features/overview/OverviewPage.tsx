import { useMemo, useState, type CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CircleAlert,
  Clock3,
  Database,
  Gauge,
  PlugZap,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import './overview.css';

type Tone = 'green' | 'violet' | 'amber' | 'red' | 'neutral';
type Period = '7' | '14' | '30';

type Kpi = {
  label: string;
  value: string;
  detail: string;
  delta: string;
  direction: 'up' | 'down';
  tone: Tone;
  signal: number[];
};

type AgentHealth = {
  id: string;
  name: string;
  domain: string;
  source: string;
  version: string;
  sessions: string;
  passRate: number;
  qualityDelta: number;
  coverage: number;
  p95: string;
  toolFailure: number;
  cost: string;
  status: '正常' | '关注' | '高风险';
  issue: string;
};

const KPIS: Kpi[] = [
  {
    label: '接入 Agent',
    value: '28',
    detail: '26 在线 · 2 待验证',
    delta: '+3 本周',
    direction: 'up',
    tone: 'violet',
    signal: [34, 42, 46, 53, 61, 66, 72, 82, 88, 92],
  },
  {
    label: '今日会话',
    value: '58.0K',
    detail: '覆盖 24 个业务 Agent',
    delta: '+2.6%',
    direction: 'up',
    tone: 'green',
    signal: [48, 56, 51, 62, 67, 64, 71, 78, 74, 82],
  },
  {
    label: 'Trace 摄入',
    value: '272.3K',
    detail: '平均延迟 4.1 秒',
    delta: '+8.4%',
    direction: 'up',
    tone: 'neutral',
    signal: [42, 48, 54, 59, 63, 69, 75, 78, 84, 88],
  },
  {
    label: '有效质量通过率',
    value: '86.4%',
    detail: '证据不足样本单独统计',
    delta: '+1.8 pp',
    direction: 'up',
    tone: 'green',
    signal: [61, 65, 68, 67, 72, 75, 79, 78, 84, 87],
  },
  {
    label: '评测覆盖率',
    value: '73.2%',
    detail: '已评测 199.3K Trace',
    delta: '-2.1 pp',
    direction: 'down',
    tone: 'amber',
    signal: [81, 79, 76, 78, 74, 72, 75, 71, 70, 73],
  },
  {
    label: 'Trace 完整率',
    value: '94.1%',
    detail: '满足最小 Agent 语义链',
    delta: '+0.6 pp',
    direction: 'up',
    tone: 'violet',
    signal: [78, 81, 84, 85, 88, 87, 90, 91, 92, 94],
  },
  {
    label: 'P95 Agent 时延',
    value: '8.2s',
    detail: '工具等待占 31%',
    delta: '+1.4%',
    direction: 'down',
    tone: 'red',
    signal: [54, 58, 55, 61, 67, 64, 72, 76, 73, 79],
  },
  {
    label: '每成功任务成本',
    value: '¥0.18',
    detail: '总 Token 981.1M',
    delta: '+3.2%',
    direction: 'down',
    tone: 'amber',
    signal: [52, 55, 51, 58, 61, 60, 64, 68, 71, 74],
  },
];

const QUALITY_SERIES = [
  { label: '09-21', passRate: 78.2, evaluated: 16.4, total: 31.1 },
  { label: '09-22', passRate: 79.1, evaluated: 18.2, total: 33.7 },
  { label: '09-23', passRate: 78.7, evaluated: 17.3, total: 32.8 },
  { label: '09-24', passRate: 80.4, evaluated: 20.8, total: 35.4 },
  { label: '09-25', passRate: 81.2, evaluated: 19.6, total: 36.1 },
  { label: '09-26', passRate: 80.8, evaluated: 18.9, total: 34.6 },
  { label: '09-27', passRate: 82.1, evaluated: 21.7, total: 36.9 },
  { label: '09-28', passRate: 81.6, evaluated: 22.3, total: 38.8 },
  { label: '09-29', passRate: 83.4, evaluated: 23.1, total: 39.7 },
  { label: '09-30', passRate: 82.8, evaluated: 21.9, total: 38.4 },
  { label: '10-01', passRate: 83.7, evaluated: 22.8, total: 39.5 },
  { label: '10-02', passRate: 84.2, evaluated: 24.2, total: 41.6 },
  { label: '10-03', passRate: 83.9, evaluated: 23.5, total: 40.8 },
  { label: '10-04', passRate: 84.8, evaluated: 25.1, total: 42.7 },
  { label: '10-05', passRate: 85.3, evaluated: 24.7, total: 43.2 },
  { label: '10-06', passRate: 84.6, evaluated: 23.8, total: 42.5 },
  { label: '10-07', passRate: 83.7, evaluated: 20.9, total: 42.2 },
  { label: '10-08', passRate: 82.9, evaluated: 19.4, total: 40.7 },
  { label: '10-09', passRate: 83.8, evaluated: 21.1, total: 41.5 },
  { label: '10-10', passRate: 84.5, evaluated: 22.6, total: 42.6 },
  { label: '10-11', passRate: 85.1, evaluated: 24.1, total: 44.3 },
  { label: '10-12', passRate: 84.4, evaluated: 23.6, total: 43.8 },
  { label: '10-13', passRate: 83.9, evaluated: 22.2, total: 43.1 },
  { label: '10-14', passRate: 84.8, evaluated: 24.4, total: 44.6 },
  { label: '10-15', passRate: 85.7, evaluated: 25.8, total: 45.9 },
  { label: '10-16', passRate: 86.1, evaluated: 26.2, total: 46.4 },
  { label: '10-17', passRate: 85.5, evaluated: 25.4, total: 46.1 },
  { label: '10-18', passRate: 86.2, evaluated: 27.1, total: 47.8 },
  { label: '10-19', passRate: 85.8, evaluated: 26.7, total: 47.2 },
  { label: '10-20', passRate: 86.4, evaluated: 28.9, total: 48.6 },
];

const AGENT_HEALTH: AgentHealth[] = [
  {
    id: 'agent-refund-v4',
    name: '退款客服助手',
    domain: '客户服务',
    source: '自研 Agent',
    version: 'V4',
    sessions: '18.4K',
    passRate: 91.8,
    qualityDelta: 2.1,
    coverage: 92,
    p95: '4.1s',
    toolFailure: 1.4,
    cost: '¥0.12',
    status: '正常',
    issue: '质量与成本稳定',
  },
  {
    id: 'agent-query-v3',
    name: '经营问数助手',
    domain: '数据分析',
    source: '自研 Agent',
    version: 'V3',
    sessions: '8.2K',
    passRate: 83.4,
    qualityDelta: -5.6,
    coverage: 68,
    p95: '9.8s',
    toolFailure: 7.8,
    cost: '¥0.31',
    status: '关注',
    issue: 'SQL 工具失败率上升',
  },
  {
    id: 'agent-tender-v1',
    name: '招标评估助手',
    domain: '业务办公',
    source: '通用框架',
    version: 'V1',
    sessions: '2.1K',
    passRate: 78.2,
    qualityDelta: 0.8,
    coverage: 43,
    p95: '12.6s',
    toolFailure: 2.6,
    cost: '¥0.27',
    status: '关注',
    issue: '评测覆盖率低于基线',
  },
  {
    id: 'agent-research-v2',
    name: '网页研究助手',
    domain: '研究分析',
    source: '自研 Agent',
    version: 'V2',
    sessions: '6.7K',
    passRate: 87.1,
    qualityDelta: -0.3,
    coverage: 81,
    p95: '7.3s',
    toolFailure: 2.2,
    cost: '¥0.16',
    status: '正常',
    issue: '引用完整度保持稳定',
  },
  {
    id: 'agent-contract-v2',
    name: '合同审查助手',
    domain: '风险管理',
    source: '数据库转换',
    version: 'V2',
    sessions: '4.5K',
    passRate: 74.9,
    qualityDelta: -7.8,
    coverage: 38,
    p95: '18.4s',
    toolFailure: 4.9,
    cost: '¥0.44',
    status: '高风险',
    issue: 'Trace 缺失父子步骤关系',
  },
  {
    id: 'agent-ticket-v5',
    name: '工单分派助手',
    domain: '客户服务',
    source: '通用框架',
    version: 'V5',
    sessions: '12.9K',
    passRate: 89.2,
    qualityDelta: 0.4,
    coverage: 90,
    p95: '2.7s',
    toolFailure: 0.9,
    cost: '¥0.08',
    status: '正常',
    issue: '任务完成率 92.6%',
  },
];

const RISKS = [
  {
    id: 'risk-1',
    severity: '高',
    tone: 'red' as Tone,
    title: '合同审查助手质量与数据完整性同时下降',
    detail: '通过率 -7.8 pp，37% Trace 缺少父步骤关系，当前评估结论需要降级解读。',
    meta: '风险管理 · 10:06',
  },
  {
    id: 'risk-2',
    severity: '高',
    tone: 'red' as Tone,
    title: '经营问数助手工具失败率升至 7.8%',
    detail: 'SQL 执行超时与字段映射错误占主要失败，相关 Badcase 已进入自动评测队列。',
    meta: '数据分析 · 09:48',
  },
  {
    id: 'risk-3',
    severity: '中',
    tone: 'amber' as Tone,
    title: '三个 Agent 的在线评测覆盖率低于 60%',
    detail: '招标评估、合同审查、政策问答存在评测缺口，无法支撑版本质量判断。',
    meta: '平台治理 · 09:22',
  },
  {
    id: 'risk-4',
    severity: '中',
    tone: 'amber' as Tone,
    title: '退款客服 V4 单任务成本短期上升 1.8 倍',
    detail: '质量通过率保持稳定，成本增长主要来自长上下文重复发送。',
    meta: '成本治理 · 08:50',
  },
];

const RUNTIME_SIGNALS = [
  { label: '工具调用失败率', value: '3.7%', trend: '+0.8 pp', tone: 'red' as Tone, width: 58 },
  { label: '超时 / 超步任务', value: '1.2%', trend: '-0.2 pp', tone: 'green' as Tone, width: 30 },
  { label: '平均执行步骤', value: '6.8', trend: '+0.4', tone: 'amber' as Tone, width: 68 },
  { label: '证据不足率', value: '4.8%', trend: '+0.6 pp', tone: 'amber' as Tone, width: 48 },
  { label: '人工复核积压', value: '126', trend: '+18', tone: 'red' as Tone, width: 64 },
  { label: '用户负向反馈率', value: '2.3%', trend: '-0.3 pp', tone: 'green' as Tone, width: 36 },
];

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

function KpiCard({ item }: { item: Kpi }) {
  const TrendIcon = item.direction === 'up' ? TrendingUp : TrendingDown;
  return <article className={`ov-kpi ov-kpi--${item.tone}`}>
    <div className="ov-kpi__head"><span>{item.label}</span><i aria-hidden="true" /></div>
    <strong>{item.value}</strong>
    <div className="ov-kpi__meta"><span>{item.detail}</span><em className={`is-${item.direction}`}><TrendIcon size={12} />{item.delta}</em></div>
    <div className="ov-kpi__signal" aria-hidden="true">{item.signal.map((height, index) => <i key={`${item.label}-${index}`} style={{ height: `${height}%` }} />)}</div>
  </article>;
}

function QualityTrend({ period }: { period: Period }) {
  const points = QUALITY_SERIES.slice(-Number(period));
  const width = 760;
  const height = 236;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const min = 70;
  const max = 92;
  const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => top + ((max - Math.max(min, Math.min(max, value))) / (max - min)) * plotHeight;
  const linePoints = points.map((item, index) => `${x(index)},${y(item.passRate)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  return <div className="ov-chart-wrap">
    <svg className="ov-quality-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`过去 ${period} 天质量通过率与评测覆盖变化`}>
      <defs>
        <linearGradient id="ov-quality-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#177245" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#177245" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[70, 75, 80, 85, 90].map((tick) => <g key={tick}>
        <line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} className="ov-chart-grid" />
        <text x={left - 9} y={y(tick) + 4} textAnchor="end" className="ov-chart-axis">{tick}%</text>
      </g>)}
      {points.map((item, index) => {
        const barWidth = Math.max(4, Math.min(16, plotWidth / Math.max(points.length, 1) - 6));
        const totalHeight = plotHeight * 0.44;
        const evaluatedHeight = totalHeight * (item.evaluated / item.total);
        return <g key={item.label}>
          <rect x={x(index) - barWidth / 2} y={height - bottom - totalHeight} width={barWidth} height={totalHeight} rx="2" className="ov-chart-total" />
          <rect x={x(index) - barWidth / 2} y={height - bottom - evaluatedHeight} width={barWidth} height={evaluatedHeight} rx="2" className="ov-chart-evaluated" />
        </g>;
      })}
      <polygon points={`${left},${height - bottom} ${linePoints} ${width - right},${height - bottom}`} fill="url(#ov-quality-area)" />
      <polyline points={linePoints} className="ov-quality-line" />
      {points.map((item, index) => index % labelStep === 0 || index === points.length - 1 ? <g key={`${item.label}-label`}>
        <circle cx={x(index)} cy={y(item.passRate)} r="3.5" className="ov-quality-dot" />
        <text x={x(index)} y={height - 13} textAnchor="middle" className="ov-chart-axis">{item.label}</text>
      </g> : null)}
    </svg>
  </div>;
}

function StatusPill({ status }: { status: AgentHealth['status'] }) {
  const tone = status === '正常' ? 'success' : status === '关注' ? 'warning' : 'danger';
  return <span className={`ov-status ov-status--${tone}`}><i />{status}</span>;
}

export default function OverviewPage({
  onOpenAccess,
  onOpenTrace,
  onOpenTasks,
}: {
  onOpenAccess: () => void;
  onOpenTrace: () => void;
  onOpenTasks: () => void;
}) {
  const [period, setPeriod] = useState<Period>('7');
  const [domain, setDomain] = useState('全部业务域');
  const [query, setQuery] = useState('');
  const [updatedAt, setUpdatedAt] = useState('10:18:30');
  const filteredAgents = useMemo(() => AGENT_HEALTH.filter((item) => {
    const domainMatch = domain === '全部业务域' || item.domain === domain;
    const queryMatch = !query || `${item.name} ${item.source} ${item.version} ${item.issue}`.toLowerCase().includes(query.toLowerCase());
    return domainMatch && queryMatch;
  }), [domain, query]);

  return <div className="overview-page">
    <div className="ov-toolbar">
      <div className="ov-toolbar__filters">
        <label><span>业务域</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option>全部业务域</option><option>客户服务</option><option>数据分析</option><option>研究分析</option><option>业务办公</option><option>风险管理</option></select></label>
        <label><span>时间范围</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7">近 7 天</option><option value="14">近 14 天</option><option value="30">近 30 天</option></select></label>
        <span className="ov-freshness"><Clock3 size={13} />更新于 {updatedAt}</span>
      </div>
      <div className="ov-toolbar__actions">
        <button type="button" className="ov-button ov-button--ghost" onClick={() => { setUpdatedAt('刚刚'); onOpenAccess(); }}><PlugZap size={15} />接入健康</button>
        <button type="button" className="ov-button ov-button--ghost ov-refresh" aria-label="刷新总览数据" title="刷新总览数据" onClick={() => setUpdatedAt('刚刚')}><RefreshCw size={15} /></button>
      </div>
    </div>

    <section className="ov-kpi-grid" aria-label="平台关键指标">
      {KPIS.map((item) => <KpiCard key={item.label} item={item} />)}
    </section>

    <div className="ov-main-grid">
      <section className="ov-panel ov-quality-panel">
        <header className="ov-panel__header">
          <div><span className="ov-eyebrow">QUALITY SIGNAL</span><h3>质量与评估趋势</h3></div>
          <div className="ov-legend"><span><i className="is-line" />有效质量通过率</span><span><i className="is-bar" />已评测 Trace</span></div>
        </header>
        <div className="ov-chart-summary">
          <div><span>当前通过率</span><strong>86.4%</strong><em>较昨日 +0.6 pp</em></div>
          <div><span>今日已评测</span><strong>28.9K</strong><em>覆盖率 73.2%</em></div>
          <div><span>好评与差评差</span><strong>+81.7%</strong><em>用户反馈样本 12.4K</em></div>
        </div>
        <QualityTrend period={period} />
        <footer className="ov-panel__footer"><span>通过率仅统计有效样本；证据不足、无法执行与执行失败不折算为 0。</span><button type="button" onClick={onOpenTasks}>查看评测任务<ArrowRight size={14} /></button></footer>
      </section>

      <section className="ov-panel ov-coverage-panel">
        <header className="ov-panel__header"><div><span className="ov-eyebrow">EVALUATION LOOP</span><h3>评测覆盖链路</h3></div><span className="ov-panel__badge">在线闭环</span></header>
        <div className="ov-coverage-hero">
          <div className="ov-coverage-ring" style={{ '--coverage': '73.2%' } as CSSProperties}><strong>73.2%</strong><span>已评测</span></div>
          <div><strong>72.9K Trace 尚未进入评测</strong><p>未覆盖数据主要集中在 3 个低流量 Agent。</p></div>
        </div>
        <div className="ov-funnel">
          <div><span>运行接入</span><strong>94.1%</strong><i><b style={{ width: '94.1%' }} /></i><small>26 / 28 Agent</small></div>
          <div><span>自动评测</span><strong>73.2%</strong><i><b style={{ width: '73.2%' }} /></i><small>199.3K Trace</small></div>
          <div><span>人工复核</span><strong>16.3%</strong><i><b style={{ width: '16.3%' }} /></i><small>126 条待处理</small></div>
        </div>
        <div className="ov-coverage-foot"><span><Bot size={14} />质量均分 0.81</span><span><ShieldAlert size={14} />高危 Badcase 38</span></div>
      </section>
    </div>

    <section className="ov-panel ov-agent-panel">
      <header className="ov-panel__header ov-agent-panel__header">
        <div><span className="ov-eyebrow">AGENT PORTFOLIO</span><h3>Agent 健康度</h3><p>按业务影响、质量变化和评测覆盖综合排序。</p></div>
        <label className="ov-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Agent、来源或风险" /></label>
      </header>
      <div className="ov-table-wrap">
        <table className="ov-agent-table">
          <thead><tr><th>Agent</th><th>会话</th><th>有效通过率</th><th>质量变化</th><th>评测覆盖</th><th>P95</th><th>工具失败</th><th>成本 / 成功任务</th><th>状态</th></tr></thead>
          <tbody>{filteredAgents.map((item) => <tr key={item.id}>
            <td><button type="button" className="ov-agent-name" onClick={onOpenTrace}><span className="ov-agent-avatar">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.source} · {item.version} · {item.domain}</small></span></button></td>
            <td>{item.sessions}</td>
            <td><strong className={item.passRate < 80 ? 'is-danger' : ''}>{formatPercent(item.passRate)}</strong></td>
            <td><span className={item.qualityDelta >= 0 ? 'ov-delta is-up' : 'ov-delta is-down'}>{item.qualityDelta >= 0 ? '+' : ''}{item.qualityDelta.toFixed(1)} pp</span></td>
            <td><div className="ov-coverage-cell"><i><b style={{ width: `${item.coverage}%` }} /></i><span>{item.coverage}%</span></div></td>
            <td>{item.p95}</td>
            <td>{item.toolFailure.toFixed(1)}%</td>
            <td>{item.cost}</td>
            <td><StatusPill status={item.status} /><small className="ov-row-issue">{item.issue}</small></td>
          </tr>)}</tbody>
        </table>
        {!filteredAgents.length && <div className="ov-empty">没有匹配的 Agent。</div>}
      </div>
    </section>

    <div className="ov-lower-grid">
      <section className="ov-panel ov-risk-panel">
        <header className="ov-panel__header"><div><span className="ov-eyebrow">ACTIONS</span><h3>优先处理</h3></div><span className="ov-panel__badge ov-panel__badge--red">4 项需跟进</span></header>
        <div className="ov-risk-list">{RISKS.map((risk) => <button type="button" key={risk.id} className="ov-risk-item" onClick={onOpenTasks}>
          <span className={`ov-risk-level ov-risk-level--${risk.tone}`}>{risk.severity}</span>
          <span className="ov-risk-copy"><strong>{risk.title}</strong><small>{risk.detail}</small><em>{risk.meta}</em></span>
          <ArrowRight size={15} />
        </button>)}</div>
      </section>

      <section className="ov-panel ov-runtime-panel">
        <header className="ov-panel__header"><div><span className="ov-eyebrow">OPERATIONS</span><h3>运行与成本信号</h3></div><span className="ov-panel__badge"><Activity size={12} />实时</span></header>
        <div className="ov-runtime-summary"><div><WalletCards size={17} /><span>总 Token</span><strong>981.1M</strong></div><div><Gauge size={17} /><span>任务完成率</span><strong>84.7%</strong></div><div><Database size={17} /><span>缓存命中</span><strong>38.4%</strong></div></div>
        <div className="ov-signal-list">{RUNTIME_SIGNALS.map((signal) => <div key={signal.label}><span>{signal.label}</span><strong>{signal.value}</strong><em className={`is-${signal.tone}`}>{signal.trend}</em><i><b className={`is-${signal.tone}`} style={{ width: `${signal.width}%` }} /></i></div>)}</div>
        <footer className="ov-runtime-note"><CircleAlert size={14} />成本异常按 Agent、模型、Tool 与实际成功任务归因，不使用单纯 Token 降幅判断优化效果。</footer>
      </section>
    </div>
  </div>;
}
