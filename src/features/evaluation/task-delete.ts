import type { EvaluationState } from './evaluation.types';

export const removeEvaluationTask = (state: EvaluationState, taskId: string): EvaluationState => ({
  ...state,
  tasks: state.tasks.filter((task) => task.id !== taskId),
  experiments: state.experiments.filter((experiment) => experiment.sourceTaskId !== taskId),
  comparisons: state.comparisons.filter((comparison) => (
    comparison.controlTaskId !== taskId
    && !comparison.experimentTaskIds.includes(taskId)
  )),
  evaluatorOptimizations: state.evaluatorOptimizations.map((experiment) => {
    if (!experiment.sourceTaskIds.includes(taskId)) return experiment;
    const sourceTaskIds = experiment.sourceTaskIds.filter((id) => id !== taskId);
    return { ...experiment, sourceTaskIds, taskCount: sourceTaskIds.length };
  }),
});
