import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock3,
} from 'lucide-react';
import { SelectField } from '../evaluation/eval-ui';
import { TIME_PRESETS, formatDateTime, formatDateTimeInput, getTimeRange, type TimePresetKey, type TimeRange } from './overview-time';
import './overview.css';

type MetricKey = 'sessions' | 'conversations' | 'users' | 'tokens' | 'duration' | 'ttft' | 'score';
type Scope = '总计' | '按 Agent';

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
  { name: '金融合规问答 Agent', version: 'V1', coverage: 100, passRate: 50.0, averageScore: 0.82 },
  { name: '问数 Agent', version: 'V1', coverage: 100, passRate: 91.1, averageScore: 0.86 },
  { name: '退款客服助手', version: 'V4', coverage: 92, passRate: 91.8, averageScore: 0.86 },
  { name: '招标评估助手', version: 'V1', coverage: 43, passRate: 78.2, averageScore: 0.72 },
  { name: '网页研究助手', version: 'V2', coverage: 81, passRate: 87.1, averageScore: 0.84 },
];

const TASK_STATS = [
  { label: '评测数据集', value: '5' },
  { label: '已完成评测任务', value: '4' },
  { label: '运行中任务', value: '1' },
  { label: '对比实验', value: '2' },
  { label: '优化实验', value: '2' },
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
  timeRange,
  onScopeChange,
  onMetricChange,
}: {
  metric: Metric;
  scope: Scope;
  timeRange: TimeRange;
  onScopeChange: (scope: Scope) => void;
  onMetricChange: (key: MetricKey) => void;
}) {
  const scopedSeries = useMemo(() => {
    if (scope === '总计') return metric.series;
    const factor = 0.83;
    const phase = 3.3;
    return metric.series.map((value, index) => value * factor * (1 + Math.sin(index * 0.48 + phase) * 0.08));
  }, [metric, scope]);
  const min = Math.min(...scopedSeries);
  const max = Math.max(...scopedSeries);
  const chartRange = Math.max(1, max - min);
  const total = scopedSeries.reduce((sum, value) => sum + value, 0);
  const displayTotal = scope === '总计' ? metric.value : formatChartValue(metric, total / 31);
  const axisValues = [max, (max + min) / 2, min].map((value) => formatChartValue(metric, value));
  const axisTimes = useMemo(() => {
    const start = timeRange.start.getTime();
    const end = timeRange.end.getTime();
    const span = Math.max(1, end - start);
    const formatter = span <= 6 * 60 * 60 * 1000
      ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      : span <= 8 * 24 * 60 * 60 * 1000
        ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        : span <= 366 * 24 * 60 * 60 * 1000
          ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
          : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => formatter.format(new Date(start + span * ratio)));
  }, [timeRange]);
  return <section className="ov-time-panel" style={{ '--metric-color': metric.color } as CSSProperties}>
    <header className="ov-time-panel__header">
      <div className="ov-time-panel__summary">
        <MetricMenu selected={metric.key} onSelect={onMetricChange} />
        <span className="ov-time-total"><i />{displayTotal}</span>
        <span className={`ov-time-delta is-${metric.trend}`}>{(metric.trend === 'up' ? '↑ ' : '↓ ') + metric.delta}</span>
      </div>
      <div className="ov-scope-switch" role="tablist" aria-label="统计范围">
        {(['总计', '按 Agent'] as Scope[]).map((item) => <button type="button" role="tab" aria-selected={scope === item} className={scope === item ? 'is-active' : ''} key={item} onClick={() => onScopeChange(item)}>{item}</button>)}
      </div>
    </header>
    <div className="ov-time-chart-frame">
      <div className="ov-time-y-axis" aria-hidden="true">{axisValues.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div>
      <div className="ov-time-chart" role="img" aria-label={`${metric.label}近 24 小时时序柱状图`}>
        <div className="ov-time-plot">
          <div className="ov-time-grid" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="ov-time-bars">
            {scopedSeries.map((value, index) => {
              const height = 14 + ((value - min) / chartRange) * 82;
              return <span className={`ov-time-bar${index === scopedSeries.length - 1 ? ' is-current' : ''}`} key={`${scope}-${index}`} title={`${index + 1} · ${formatChartValue(metric, value)}`}>
                <i style={{ height: `${height}%` }} />
              </span>;
            })}
          </div>
        </div>
        <div className="ov-time-x-axis" aria-hidden="true">{axisTimes.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div>
      </div>
    </div>
    <footer className="ov-time-panel__footer"><span><i style={{ background: metric.color }} />{metric.label} · {displayTotal}</span></footer>
  </section>;
}

function ModuleHeader({ title, note, action, onAction }: { title: string; note: string; action?: string; onAction?: () => void }) {
  return <header className="ov-module__header">
    <div><h3>{title}</h3><p>{note}</p></div>
    {action && onAction && <button type="button" onClick={onAction}>{action}<ArrowRight size={13} /></button>}
  </header>;
}

export default function OverviewPage({
  onOpenTrace,
  onOpenTasks,
}: {
  onOpenTrace: () => void;
  onOpenTasks: () => void;
}) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('sessions');
  const [scope, setScope] = useState<Scope>('总计');
  const [agent, setAgent] = useState('全部 Agent');
  const [timePreset, setTimePreset] = useState<TimePresetKey>('1d');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timeAnchor, setTimeAnchor] = useState(() => new Date());
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);
  const timePickerRef = useRef<HTMLDivElement>(null);
  const metric = METRICS.find((item) => item.key === selectedMetric) ?? METRICS[0];
  const selectedTimePreset = TIME_PRESETS.find((item) => item.key === timePreset) ?? TIME_PRESETS[6];
  const timeRange = useMemo(() => getTimeRange(timePreset, timeAnchor, customRange), [timePreset, timeAnchor, customRange]);

  useEffect(() => {
    if (!timePickerOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (timePickerRef.current?.contains(event.target as Node)) return;
      setTimePickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTimePickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [timePickerOpen]);

  const toggleTimePicker = () => {
    setTimeAnchor(new Date());
    setTimePickerOpen((current) => !current);
  };

  const selectTimePreset = (key: TimePresetKey) => {
    const nextAnchor = new Date();
    setTimeAnchor(nextAnchor);
    setTimePreset(key);
    if (key === 'custom') {
      setCustomRange((current) => current ?? getTimeRange('1d', nextAnchor));
      return;
    }
    setTimePickerOpen(false);
  };

  const customRangeInvalid = timePreset === 'custom' && (!customRange || customRange.start.getTime() > customRange.end.getTime());

  return <div className="overview-page">
    <div className="ov-dashboard-toolbar">
      <div className="ov-query-controls">
        <label className="ov-select-control"><Bot size={15} /><SelectField aria-label="选择 Agent" value={agent} onChange={(event) => setAgent(event.target.value)}><option>全部 Agent</option><option>金融合规问答 Agent</option><option>问数 Agent</option><option>退款客服助手</option><option>招标评估助手</option><option>网页研究助手</option></SelectField></label>
        <div className="ov-time-range" ref={timePickerRef}>
          <button type="button" className="ov-time-range__trigger" aria-haspopup="dialog" aria-expanded={timePickerOpen} onClick={toggleTimePicker}>
            <span className="ov-time-range__preset">{selectedTimePreset.label}</span>
            <span className="ov-time-range__text">{formatDateTime(timeRange.start)} ~ {formatDateTime(timeRange.end)}</span>
            <ChevronDown size={15} />
          </button>
          {timePickerOpen && <div className="ov-time-picker" role="dialog" aria-label="时间选择">
            <h3>时间选择</h3>
            <div className="ov-time-picker__grid">
              {TIME_PRESETS.map((option) => <button type="button" key={option.key} className={option.key === timePreset ? 'is-selected' : ''} onClick={() => selectTimePreset(option.key)}>{option.label}</button>)}
            </div>
            {timePreset === 'custom' && <div className="ov-time-picker__custom">
              <label><span>开始时间</span><input type="datetime-local" step="1" value={formatDateTimeInput(customRange?.start ?? timeRange.start)} max={formatDateTimeInput(timeRange.end)} onChange={(event) => { const start = new Date(event.target.value); if (!Number.isNaN(start.getTime())) setCustomRange({ start, end: customRange?.end ?? timeRange.end }); }} /></label>
              <label><span>结束时间</span><input type="datetime-local" step="1" min={formatDateTimeInput(timeRange.start)} value={formatDateTimeInput(customRange?.end ?? timeRange.end)} onChange={(event) => { const end = new Date(event.target.value); if (!Number.isNaN(end.getTime())) setCustomRange({ start: customRange?.start ?? timeRange.start, end }); }} /></label>
              <button type="button" className="ov-time-picker__apply" disabled={customRangeInvalid} onClick={() => setTimePickerOpen(false)}>应用</button>
            </div>}
          </div>}
        </div>
      </div>
    </div>

    <section className="ov-metric-strip-wrap" aria-label="监控指标">
      <div className="ov-metric-strip">{METRICS.map((item) => <MetricCard key={item.key} metric={item} selected={item.key === selectedMetric} onSelect={() => setSelectedMetric(item.key)} />)}</div>
    </section>

    <TimeSeriesPanel metric={metric} scope={scope} timeRange={timeRange} onScopeChange={setScope} onMetricChange={setSelectedMetric} />
    <p className="ov-chart-caption"><Clock3 size={13} />{timePreset === '1d' ? '近 24 小时' : timePreset === '7d' ? '近 7 天' : timePreset === '30d' ? '近 30 天' : selectedTimePreset.label}，按小时聚合，柱高表示所选指标的时序变化。</p>

    <section className="ov-module ov-task-module" style={{ '--module-accent': '#a477c7' } as CSSProperties}>
      <ModuleHeader title="任务、实验与变更" note="对应现有评测任务、数据集和实验能力。" action="进入评测" onAction={onOpenTasks} />
      <div className="ov-task-stats">{TASK_STATS.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    </section>

    <section className="ov-agent-detail-module" style={{ '--module-accent': '#55a6c8' } as CSSProperties}>
      <ModuleHeader title="Agent 质量明细" note="按 Agent 汇总有效评测结果，平均分只使用可评分样本。" action="查看观测" onAction={onOpenTrace} />
      <div className="ov-agent-table-wrap">
        <table className="ov-agent-table">
          <thead><tr><th>Agent</th><th>版本</th><th>评测覆盖</th><th>有效通过率</th><th>平均分</th></tr></thead>
          <tbody>{AGENT_ROWS.map((item) => <tr key={`${item.name}-${item.version}`}>
            <td><button type="button" onClick={onOpenTrace}><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>在线 Agent</small></div></button></td>
            <td>{item.version}</td>
            <td><div className="ov-table-progress"><i><b style={{ width: `${item.coverage}%` }} /></i><span>{item.coverage}%</span></div></td>
            <td><strong>{item.passRate}%</strong></td>
            <td><strong>{item.averageScore.toFixed(2)}</strong></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
