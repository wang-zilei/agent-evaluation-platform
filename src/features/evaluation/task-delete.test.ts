import { describe, expect, it } from 'vitest';
import { cloneEvaluationState } from './evaluation.mock';
import { removeEvaluationTask } from './task-delete';

describe('evaluation task deletion', () => {
  it('removes the task and directly dependent evaluation records', () => {
    const state = cloneEvaluationState();
    const taskId = 'TASK-20260922-001';

    expect(state.tasks.some((task) => task.id === taskId)).toBe(true);
    expect(state.experiments.some((experiment) => experiment.sourceTaskId === taskId)).toBe(true);
    expect(state.comparisons.some((comparison) => comparison.controlTaskId === taskId || comparison.experimentTaskIds.includes(taskId))).toBe(true);

    const next = removeEvaluationTask(state, taskId);

    expect(next.tasks.some((task) => task.id === taskId)).toBe(false);
    expect(next.experiments.some((experiment) => experiment.sourceTaskId === taskId)).toBe(false);
    expect(next.comparisons.some((comparison) => comparison.controlTaskId === taskId || comparison.experimentTaskIds.includes(taskId))).toBe(false);
    expect(next.evaluatorOptimizations.every((experiment) => !experiment.sourceTaskIds.includes(taskId))).toBe(true);
    expect(next.datasets).toHaveLength(state.datasets.length);
    expect(next.evaluators).toHaveLength(state.evaluators.length);
  });

  it('keeps unrelated tasks and experiments', () => {
    const state = cloneEvaluationState();
    const deletedId = 'TASK-20260922-001';
    const keptTaskId = 'TASK-20260922-002';
    const next = removeEvaluationTask(state, deletedId);

    expect(next.tasks.some((task) => task.id === keptTaskId)).toBe(true);
    expect(next.experiments.filter((experiment) => experiment.sourceTaskId === keptTaskId)).toHaveLength(
      state.experiments.filter((experiment) => experiment.sourceTaskId === keptTaskId).length,
    );
  });
});
