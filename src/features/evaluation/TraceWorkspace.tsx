import { useState } from 'react';
import { Activity, ArrowLeft, ChevronDown, ChevronRight, Clock3, Search, Wrench } from 'lucide-react';
import type { ObservedTrace, TraceAssistantStep } from './trace.types';

const formatTokens = (value: number | null) => value === null ? '未采集' : value.toLocaleString('en-US');
const stepSummary = (step: TraceAssistantStep) => {
  const toolCount = step.tools.length;
  if (step.text) return step.text.replace(/\s+/g, ' ').slice(0, 110);
  if (step.reasoning && toolCount) return `已记录 reasoning_content · 调用 ${toolCount} 个 Tool`;
  if (step.reasoning) return '已记录 reasoning_content';
  return toolCount ? `调用 ${toolCount} 个 Tool` : '无可见内容';
};

export function TraceList({ traces, search, setSearch, onOpen }: { traces: ObservedTrace[]; search: string; setSearch: (value: string) => void; onOpen: (trace: ObservedTrace) => void }) {
  const filtered = traces.filter((trace) => `${trace.id} ${trace.traceId ?? ''} ${trace.agent ?? ''} ${trace.input} ${trace.sourceFile}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page eval-trace-page">
    <div className="eval-section-head"><div><span className="eval-eyebrow">OBSERVATION / TRACE</span><h2>Trace</h2><p>查看已上报的 Agent 运行轨迹。当前原型展示三条真实 Trace。</p></div></div>
    <div className="eval-trace-toolbar"><label className="eval-search"><Search size={15} /><input value={search} placeholder="搜索 Trace ID、Agent 或输入" onChange={(event) => setSearch(event.target.value)} /></label><span>{filtered.length} 条 Trace</span></div>
    <section className="eval-trace-list" aria-label="Trace 列表">{filtered.map((trace) => <button type="button" className="eval-trace-row" key={trace.id} onClick={() => onOpen(trace)}><div className="eval-trace-row__main"><span className="eval-trace-row__signal"><Activity size={17} /></span><div><strong>{trace.traceId ?? trace.id}</strong><span>{trace.input}</span><small>{trace.agent ?? 'Agent 名称未采集'} · {trace.sourceFile}</small></div></div><div className="eval-trace-row__stats"><div><span>当前消息</span><strong>{trace.currentMessageCount}</strong></div><div><span>Tool</span><strong>{trace.toolCount}</strong></div><div><span>耗时</span><strong>未采集</strong></div></div><ChevronRight className="eval-trace-row__arrow" size={17} /></button>)}</section>
  </div>;
}

export function TraceDetail({ trace, onBack }: { trace: ObservedTrace; onBack: () => void }) {
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);
  const renderStep = (item: TraceAssistantStep, index: number) => {
    const open = expandedReasoning === item.id;
    return <article className="eval-assistant-step" key={item.id}><div className="eval-trace-node eval-trace-node--assistant" onClick={() => setExpandedReasoning(open ? null : item.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setExpandedReasoning(open ? null : item.id); }}><span className="eval-trace-node__tag">ASSISTANT</span><div><strong>Assistant（step{index + 1}）</strong><small>{stepSummary(item)}</small></div><ChevronDown className={open ? 'is-open' : ''} size={16} /></div>{open && <div className="eval-assistant-reasoning"><span>reasoning_content</span><p>已记录。本原型只展示存在状态，不直接展开思考原文。</p><small>模型：{item.model ?? '未采集'} · Input Tokens：{formatTokens(item.inputTokens)} · Output Tokens：{formatTokens(item.outputTokens)}</small></div>}<div className="eval-tool-stack">{item.tools.map((tool) => <div className="eval-trace-node eval-trace-node--tool" key={tool.id}><span className="eval-trace-node__tag">TOOL</span><div><strong>{tool.name}</strong><small>{tool.linked ? '已通过 tool_call_id 关联结果' : '未关联结果'}</small></div></div>)}</div></article>;
  };
  return <div className="eval-detail-page eval-trace-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Trace</button><span className="eval-trace-source">{trace.sourceFile}</span></div>
    <header className="eval-trace-detail-head"><div><span className="eval-eyebrow">TRACE DETAIL</span><h2>{trace.traceId ?? trace.id}</h2><p>{trace.agent ?? 'Agent 名称未采集'} · {trace.occurredAt ?? '时间未采集'}</p></div><div className="eval-trace-detail-meta"><span><Clock3 size={14} />耗时未采集</span><span><Wrench size={14} />{trace.toolCount} 个 Tool</span><span>reasoning_content {trace.reasoningCount} 条</span></div></header>
    {trace.compressed && <div className="eval-inline-warning"><Activity size={15} /><span>本文件首条为会话摘要，前序消息未完整提供；以下只展示当前文件中可解析的消息。</span></div>}
    <section className="eval-trace-summary"><div><span>输入</span><p>{trace.input}</p></div><div><span>最终输出</span><p>{trace.output || '当前文件未识别到独立最终回复。'}</p></div></section>
    <section className="eval-trace-ledger"><div className="eval-trace-ledger__head"><div><span className="eval-eyebrow">TRACE LEDGER</span><h3>执行轨迹</h3></div><span>Turn {trace.turn} · {trace.currentMessageCount} 条当前消息</span></div><div className="eval-turn-group"><div className="eval-turn-label"><span>TURN {trace.turn}</span><small>{trace.historyMessageCount ? `含 ${trace.historyMessageCount} 条历史消息` : '本次用户输入'}</small></div><div className="eval-trace-node eval-trace-node--input"><span className="eval-trace-node__tag">USER</span><div><strong>{trace.input}</strong><small>用户输入</small></div></div>{trace.steps.map(renderStep)}{trace.unlinkedTools.length > 0 && <div className="eval-unlinked-tools"><span>未关联 Tool</span>{trace.unlinkedTools.map((tool) => <div className="eval-trace-node eval-trace-node--tool" key={tool.id}><span className="eval-trace-node__tag">TOOL</span><div><strong>{tool.name}</strong><small>缺少可匹配的 Assistant tool_call_id</small></div></div>)}</div>}{trace.final && <div className="eval-trace-node eval-trace-node--output"><span className="eval-trace-node__tag">AGENT OUTPUT</span><div><strong>{trace.final.text}</strong><small>最终回复 · Input Tokens：{formatTokens(trace.final.inputTokens)} · Output Tokens：{formatTokens(trace.final.outputTokens)}</small></div></div>}</div></section>
  </div>;
}
