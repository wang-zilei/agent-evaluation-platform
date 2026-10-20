import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  GitCompare,
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

const EVALUATOR_BARS = [
  { label: '任务完成度', value: 86.4 },
  { label: '回答忠实度', value: 89.1 },
  { label: '工具选择正确性', value: 81.7 },
  { label: 'Agent 轨迹质量', value: 78.6 },
];

const TRACE_BARS = [
  { label: '工具调用完整', value: 93 },
  { label: '错误状态完整', value: 91 },
  { label: '父子关系完整', value: 88 },
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

function PercentageRows({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return <div className="ov-percentage-rows">{rows.map((row) => <div key={row.label}>
    <span>{row.label}</span><i><b style={{ width: `${row.value}%` }} /></i><strong>{row.value}%</strong>
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

    <div className="ov-module-grid">
      <section className="ov-module" style={{ '--module-accent': '#55a6c8' } as CSSProperties}>
        <ModuleHeader title="评测覆盖与数据质量" note="判断线上数据能否进入稳定评测。" action="接入详情" onAction={onOpenAccess} />
        <div className="ov-coverage-block">
          <div className="ov-coverage-main"><strong>73.2%</strong><span>自动评测覆盖率</span><i><b style={{ width: '73.2%' }} /></i></div>
          <div className="ov-coverage-side"><span>Trace 完整率<strong>94.1%</strong></span><span>可用字段率<strong>91.6%</strong></span><span>证据不足<strong className="is-warning">4.8%</strong></span></div>
        </div>
      </section>

      <section className="ov-module" style={{ '--module-accent': '#49a591' } as CSSProperties}>
        <ModuleHeader title="评测质量结果" note="按现有评估器查看实际通过率。" action="查看任务" onAction={onOpenTasks} />
        <PercentageRows rows={EVALUATOR_BARS} />
        <div className="ov-module-foot"><span><ClipboardCheck size={14} />人工校准 38 条</span><span><CircleAlert size={14} />待人工复核 126 条</span></div>
      </section>

      <section className="ov-module" style={{ '--module-accent': '#849ce4' } as CSSProperties}>
        <ModuleHeader title="Agent 运行与 Trace" note="定位执行失败和轨迹缺失。" action="查看 Trace" onAction={onOpenTrace} />
        <div className="ov-runtime-stats">
          <div><span>执行成功率</span><strong>97.2%</strong></div>
          <div><span>工具失败率</span><strong className="is-danger">3.7%</strong></div>
          <div><span>平均执行步骤</span><strong>6.8</strong></div>
        </div>
        <PercentageRows rows={TRACE_BARS} />
      </section>

      <section className="ov-module" style={{ '--module-accent': '#a477c7' } as CSSProperties}>
        <ModuleHeader title="任务、实验与变更" note="对应现有评测任务和实验能力。" action="进入评测" onAction={onOpenTasks} />
        <div className="ov-task-stats">
          <div><span>已完成评测任务</span><strong>42</strong></div>
          <div><span>运行中自动任务</span><strong>8</strong></div>
          <div><span>对比实验</span><strong>12</strong></div>
          <div><span>优化实验</span><strong>5</strong></div>
        </div>
        <div className="ov-change-note"><GitCompare size={15} /><span>近 7 次版本对比中，3 次出现回归退化，已进入优化实验。</span></div>
      </section>
    </div>

    <section className="ov-agent-detail-module" style={{ '--module-accent': '#55a6c8' } as CSSProperties}>
      <ModuleHeader title="Agent 质量明细" note="保留每个 Agent 的独立口径，不计算无法解释的总分。" action="查看观测" onAction={onOpenTrace} />
      <div className="ov-agent-table-wrap">
        <table className="ov-agent-table">
          <thead><tr><th>Agent</th><th>版本</th><th>评测覆盖</th><th>有效通过率</th><th>证据不足</th><th>Trace 完整率</th><th>状态</th></tr></thead>
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
