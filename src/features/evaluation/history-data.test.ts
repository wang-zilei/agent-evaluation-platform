import { describe, expect, it } from 'vitest';
import { historyConversations } from './evaluation.mock';

describe('trace replay demo coverage', () => {
  const anchor = '2026-08-28';
  const start = '2026-08-24';
  const tenderConversations = historyConversations.filter((conversation) => (
    conversation.agentId === 'agent-tender'
    && conversation.agentVersion === 'V1'
    && conversation.occurredAt.slice(0, 10) >= start
    && conversation.occurredAt.slice(0, 10) <= anchor
  ));

  it('provides enough tender-agent sessions across the five-day demo window', () => {
    expect(tenderConversations).toHaveLength(8);
    expect(new Set(tenderConversations.map((conversation) => conversation.occurredAt.slice(0, 10))).size).toBe(5);
  });

  it('covers both feedback and no-feedback filters', () => {
    const hasFeedback = (conversation: typeof tenderConversations[number]) =>
      conversation.traces.some((trace) => Boolean(trace.userFeedback.trim()));
    expect(tenderConversations.filter(hasFeedback).length).toBeGreaterThanOrEqual(4);
    expect(tenderConversations.filter((conversation) => !hasFeedback(conversation)).length).toBeGreaterThanOrEqual(4);
  });
});
