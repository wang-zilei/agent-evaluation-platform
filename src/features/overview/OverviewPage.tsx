import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Layers3,
  Search,
} from 'lucide-react';
import './overview.css';

type MetricKey = 'sessions' | 'conversations' | 'users' | 'tokens' | 'duration' | 'ttft' | 'score';
type Scope = '总计' | '按应用' | '按 Agent';

type Metric = {
  key: MetricKey;
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
  color: string;
  series: number[];
};

const makeSeries = (base: number, variance: number, seed: number, drift = 0) => Array.from({ length: 31 }, (_, index) => {
  const wave = Math.sin((index + seed) * 0.63) * variance;
  const secondary = Math.cos((index + seed * 2) * 0.27) * variance * 0.38;
  return Math.max(base * 0.35, base * (1 + wave + secondary + drift * (index / 30)));
});

const METRICS: Metric[] = [
  { key: 'sessions', label: '会话数', value: '57.9K', delta: '-0.2%', trend: 'down', color: '#59b6ab', series: makeSeries(57900, 0.025, 2, -0.09) },
  { key: 'conversations', label: '对话数', value: '269.0K', delta: '-3.7%', trend: 'down', color: '#59b6ab', series: makeSeries(269000, 0.035, 5, -0.13) },
  { key: 'users', label: '用户数', value: '11.6K', delta: '-4.7%', trend: 'down', color: '#59b6ab', series: makeSeries(11600, 0.07, 8, -0.08) },
  { key: 'tokens', label: 'Token 用量', value: '977.5M', delta: '-3.6%', trend: 'down', color: '#b056c5', series: makeSeries(977500000, 0.24, 11, -0.08) },
  { key: 'duration', label: '平均耗时', value: '6.42s', delta: '+3.3%', trend: 'up', color: '#7fa7ee', series: makeSeries(6.42, 0.055, 14, 0.03) },
  { key: 'ttft', label: '平均 TTFT', value: '2.09s', delta: '+11.0%', trend: 'up', color: '#91b4fa', series: makeSeries(2.09, 0.12, 17, 0.11) },
  { key: 'score', label: '评估分数', value: '0.64', delta: '-1.0%', trend: 'down', color: '#b48939', series: makeSeries(0.64, 0.035, 20, -0.01) },
];

const AGENT_ROWS = [
  { name: '退款客服助手', version: 'V4', coverage: 92, passRate: 91.8, insufficient: 2.1, completeness: 98, status: '正常' },
  { name: '经营问数助手', version: 'V3', coverage: 68, passRate: 83.4, insufficient: 4.8, completeness: 95, status: '关注' },
  { name: '招标评估助手', version: 'V1', coverage: 43, passRate: 78.2, insufficient: 7.3, completeness: 89, status: '关注' },
  { name: '网页研究助手', version: 'V2', coverage: 81, passRate: 87.1, insufficient: 3.4, completeness: 96, status: '正常' },
  { name: '合同审查助手', version: 'V2', coverage: 38, passRate: 74.9, insufficient: 12.6, completeness: 71, status: '高风险' },
  { name: '工单分派助手', version: 'V5', coverage: 90, passRate: 89.2, insufficient: 1.8, completeness: 97, status: '正常' },
];

const RESULT_DISTRIBUTION = [
  { label: '有效结果', value: 199300, percent: 93.3, color: '#49a591' },
  { label: '证据不足', value: 7100, percent: 3.3, color: '#b48939' },
  { label: '无法执行', value: 5800, percent: 2.7, color: '#7fa7ee' },
  { label: '执行失败', value: 1400, percent: 0.7, color: '#c65b52' },
];

const EVALUATOR_RESULTS = [
  { label: '任务完成度', kind: '通过率', value: 86.4, display: '86.4%', valid: '12.4K' },
  { label: '回答忠实度', kind: '均分', value: 84, display: '0.84', valid: '10.8K' },
  { label: '工具选择正确性', kind: '通过率', value: 81.7, display: '81.7%', valid: '8.6K' },
  { label: 'Agent 轨迹质量', kind: '均分', value: 79, display: '0.79', valid: '9.4K' },
];

const TRACE_CHECKS = [
  { label: '运行入口可识别', value: 99.2 },
  { label: '父子节点可关联', value: 91.6 },
  { label: '终态输出可定位', value: 97.4 },
];

const TASK_STATS = [
  { label: '评测数据集', value: '24' },
  { label: '已完成评测任务', value: '42' },
  { label: '运行中任务', value: '8' },
  { label: '对比实验', value: '12' },
  { label: '优化实验', value: '5' },
];

const formatChartValue = (metric: Metric, value: number) => {
  if (metric.key === 'tokens') return `${(value / 1000000).toFixed(1)}M`;
  if (metric.key === 'duration' || metric.key === 'ttft') return `${value.toFixed(2)}s`;
  if (metric.key === 'score') return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toString();
};

const sparkHeights = (series: number[]) => {
  const min = Math.min(...series);
  const max = Math.max(...series);
  return series.map((value) => 18 + ((value - min) / Math.max(1, max - min)) * 82);
};

function MetricCard({ metric, selected, onSelect }: { metric: Metric; selected: boolean; onSelect: () => void }) {
  return <button
    type="button"
    className={`ov-metric-card${selected ? ' is-selected' : ''}`}
    aria-pressed={selected}
    style={{ '--metric-color': metric.color } as CSSProperties}
    onClick={onSelect}
  >
    <span className="ov-metric-card__label">{metric.label}</span>
    <strong>{metric.value}</strong>
    <span className={`ov-metric-card__delta is-${metric.trend}`}>{metric.trend === 'up' ? '↑' : '↓'} {metric.delta}</span>
    <span className="ov-metric-card__spark" aria-hidden="true">{sparkHeights(metric.series).map((height, index) => <i key={`${metric.key}-${index}`} style={{ height: `${height}%` }} />)}</span>
  </button>;
}

function MetricMenu({ selected, onSelect }: { selected: MetricKey; onSelect: (key: MetricKey) => void }) {
  const [open, setOpen] = useState(false);
  const selectedMetric = METRICS.find((metric) => metric.key === selected) ?? METRICS[0];
  return <div className="ov-metric-menu">
    <button type="button" className="ov-metric-menu__trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{selectedMetric.label}<ChevronDown size={15} /></button>
    {open && <div className="ov-metric-menu__panel">
      <span>切换指标</span>
      {METRICS.map((metric) => <button type="button" key={metric.key} className={metric.key === selected ? 'is-active' : ''} onClick={() => { onSelect(metric.key); setOpen(false); }}>
        <i style={{ background: metric.color }} />{metric.label}{metric.key === selected && <Check size={14} />}
      </button>)}
    </div>}
  </div>;
}

function TimeSeriesPanel({
  metric,
  scope,
  onScopeChange,
  onMetricChange,
}: {
  metric: Metric;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  onMetricChange: (key: MetricKey) => void;
}) {
  const scopedSeries = useMemo(() => {
    if (scope === '总计') return metric.series;
    const factor = scope === '按应用' ? 0.71 : 0.83;
    const phase = scope === '按应用' ? 1.8 : 3.3;
    return metric.series.map((value, index) => value * factor * (1 + Math.sin(index * 0.48 + phase) * 0.08));
  }, [metric, scope]);
  const min = Math.min(...scopedSeries) * 0.91;
  const max = Math.max(...scopedSeries) * 1.03;
  const total = scopedSeries.reduce((sum, value) => sum + value, 0);
  const displayTotal = scope === '总计' ? metric.value : formatChartValue(metric, total / 31);
  return <section className="ov-time-panel" style={{ '--metric-color': metric.color } as CSSProperties}>
    <header className="ov-time-panel__header">
      <div className="ov-time-panel__summary">
        <MetricMenu selected={metric.key} onSelect={onMetricChange} />
        <span className="ov-time-total"><i />{displayTotal}</span>
        <span className={`ov-time-delta is-${metric.trend}`}>{(metric.trend === 'up' ? '↑ ' : '↓ ') + metric.delta}</span>
      </div>
      <div className="ov-scope-switch" role="tablist" aria-label="统计范围">
        {(['总计', '按应用', '按 Agent'] as Scope[]).map((item) => <button type="button" role="tab" aria-selected={scope === item} className={scope === item ? 'is-active' : ''} key={item} onClick={() => onScopeChange(item)}>{item}</button>)}
      </div>
    </header>
    <div className="ov-time-chart" aria-label={`${metric.label}近 24 小时时序柱状图`}>
      <div className="ov-time-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="ov-time-bars">
        {scopedSeries.map((value, index) => {
          const height = 12 + ((value - min) / Math.max(1, max - min)) * 82;
          return <i key={`${scope}-${index}`} style={{ height: `${height}%`, background: metric.color }} title={`${index + 1} · ${formatChartValue(metric, value)}`} />;
        })}
      </div>
    </div>
    <footer className="ov-time-panel__footer"><span><i style={{ background: metric.color }} />{metric.label} · {displayTotal}</span><span>近 24 小时 · 31 个数据点</span></footer>
  </section>;
}

function ModuleHeader({ title, note, action, onAction }: { title: string; note: string; action?: string; onAction?: () => void }) {
  return <header className="ov-module__header">
    <div><h3>{title}</h3><p>{note}</p></div>
    {action && onAction && <button type="button" onClick={onAction}>{action}<ArrowRight size={13} /></button>}
  </header>;
}

function ResultBreakdown() {
  return <div className="ov-result-breakdown">
    <div className="ov-result-total"><strong>213.6K</strong><span>评估器结果</span></div>
    <div className="ov-result-stack" aria-label="评估器结果状态分布">
      {RESULT_DISTRIBUTION.map((item) => <i key={item.label} style={{ width: `${item.percent}%`, background: item.color }} />)}
    </div>
    <div className="ov-result-legend">{RESULT_DISTRIBUTION.map((item) => <div key={item.label}>
      <span><i style={{ background: item.color }} />{item.label}</span>
      <strong>{(item.value / 1000).toFixed(1)}K · {item.percent}%</strong>
    </div>)}</div>
  </div>;
}

function EvaluatorResults() {
  return <div className="ov-evaluator-results">{EVALUATOR_RESULTS.map((item) => <div key={item.label}>
    <div className="ov-evaluator-results__head"><span>{item.label}<em>{item.kind}</em></span><strong>{item.display}</strong></div>
    <i><b style={{ width: `${item.value}%` }} /></i>
    <small>有效样本 {item.valid}</small>
  </div>)}</div>;
}

function TraceChecks() {
  return <div className="ov-trace-checks">{TRACE_CHECKS.map((item) => <div key={item.label}>
    <span>{item.label}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}%</strong>
  </div>)}</div>;
}

function Status({ value }: { value: string }) {
  const tone = value === '正常' ? 'success' : value === '关注' ? 'warning' : 'danger';
  return <span className={`ov-status ov-status--${tone}`}><i />{value}</span>;
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
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('sessions');
  const [scope, setScope] = useState<Scope>('总计');
  const [timeRange, setTimeRange] = useState('1天');
  const [application, setApplication] = useState('全部 Agent 应用');
  const [agent, setAgent] = useState('全部 Agent');
  const [lastQuery, setLastQuery] = useState('10:18:30');
  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[0];

  return <div className="overview-page">
    <div className="ov-dashboard-toolbar">
      <div className="ov-query-controls">
        <label className="ov-select-control"><Layers3 size={15} /><select aria-label="选择 Agent 应用" value={application} onChange={(event) => setApplication(event.target.value)}><option>全部 Agent 应用</option><option>客户服务</option><option>数据分析</option><option>业务办公</option></select></label>
        <label className="ov-select-control"><Bot size={15} /><select aria-label="选择 Agent" value={agent} onChange={(event) => setAgent(event.target.value)}><option>全部 Agent</option><option>退款客服助手</option><option>经营问数助手</option><option>招标评估助手</option><option>网页研究助手</option><option>合同审查助手</option></select></label>
        <button type="button" className="ov-query-button" onClick={() => setLastQuery(new Date().toLocaleTimeString('zh-CN', { hour12: false }))}><Search size={15} />查询</button>
        <span className="ov-last-query">最近查询 {lastQuery}</span>
      </div>
      <select className="ov-time-select" aria-label="选择时间范围" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}><option>1天</option><option>7天</option><option>30天</option></select>
    </div>

    <section className="ov-metric-strip-wrap" aria-label="监控指标">
      <div className="ov-metric-strip">{METRICS.map((item) => <MetricCard key={item.key} metric={item} selected={item.key === selectedMetric} onSelect={() => setSelectedMetric(item.key)} />)}</div>
    </section>

    <TimeSeriesPanel metric={metric} scope={scope} onScopeChange={setScope} onMetricChange={setSelectedMetric} />
    <p className="ov-chart-caption"><Clock3 size={13} />{timeRange === '1天' ? '近 24 小时' : timeRange === '7天' ? '近 7 天' : '近 30 天'}按小时聚合，柱高表示所选指标的时序变化。</p>

    <div className="ov-module-grid ov-module-grid--three">
      <section className="ov-module" style={{ '--module-accent': '#55a6c8' } as CSSProperties}>
        <ModuleHeader title="评测执行结果" note="按评估器执行状态统计，异常状态不进入有效分母。" action="查看任务" onAction={onOpenTasks} />
        <ResultBreakdown />
      </section>

      <section className="ov-module" style={{ '--module-accent': '#49a591' } as CSSProperties}>
        <ModuleHeader title="评估器质量结果" note="按评估器类型分别展示有效样本，不混合通过率和均分。" action="查看任务" onAction={onOpenTasks} />
        <EvaluatorResults />
        <div className="ov-module-foot"><span><ClipboardCheck size={14} />人工校准 38 条</span><span><CircleAlert size={14} />待人工评估 126 条</span></div>
      </section>

      <section className="ov-module" style={{ '--module-accent': '#849ce4' } as CSSProperties}>
        <ModuleHeader title="Agent 运行与 Trace 质量" note="从运行状态和链路字段直接计算。" action="查看接入" onAction={onOpenAccess} />
        <div className="ov-runtime-stats">
          <div><span>运行成功率</span><strong>97.2%</strong></div>
          <div><span>工具调用失败率</span><strong className="is-danger">3.7%</strong></div>
          <div><span>终态输出缺失率</span><strong className="is-danger">1.8%</strong></div>
        </div>
        <TraceChecks />
      </section>

    </div>

    <section className="ov-module ov-task-module" style={{ '--module-accent': '#a477c7' } as CSSProperties}>
      <ModuleHeader title="任务、实验与变更" note="对应现有评测任务、数据集和实验能力。" action="进入评测" onAction={onOpenTasks} />
      <div className="ov-task-stats">{TASK_STATS.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    </section>

    <section className="ov-agent-detail-module" style={{ '--module-accent': '#55a6c8' } as CSSProperties}>
      <ModuleHeader title="Agent 质量明细" note="保留每个 Agent 的独立口径，不计算无法解释的总分。" action="查看观测" onAction={onOpenTrace} />
      <div className="ov-agent-table-wrap">
        <table className="ov-agent-table">
          <thead><tr><th>Agent</th><th>版本</th><th>评测覆盖</th><th>有效通过率</th><th>证据不足</th><th>链路可关联率</th><th>状态</th></tr></thead>
          <tbody>{AGENT_ROWS.map((item) => <tr key={`${item.name}-${item.version}`}>
            <td><button type="button" onClick={onOpenTrace}><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>在线 Agent</small></div></button></td>
            <td>{item.version}</td>
            <td><div className="ov-table-progress"><i><b style={{ width: `${item.coverage}%` }} /></i><span>{item.coverage}%</span></div></td>
            <td><strong>{item.passRate}%</strong></td>
            <td className={item.insufficient >= 7 ? 'is-danger' : ''}>{item.insufficient}%</td>
            <td><div className="ov-table-progress"><i><b style={{ width: `${item.completeness}%` }} /></i><span>{item.completeness}%</span></div></td>
            <td><Status value={item.status} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
