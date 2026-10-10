export type EvaluatorComparableResult = string | number | undefined;

export const EVALUATOR_SCORE_TOLERANCE = 0.1;
export const EVALUATOR_BATCH_HIT_RATE = 0.8;

const withinTolerance = (left: number, right: number) => Math.abs(left - right) <= EVALUATOR_SCORE_TOLERANCE + Number.EPSILON;

export const evaluatorResultError = (candidate: EvaluatorComparableResult, expected: EvaluatorComparableResult): number | undefined => (
  typeof candidate === 'number' && typeof expected === 'number' ? Math.abs(candidate - expected) : undefined
);

export const matchesCalibrationResult = (candidate: EvaluatorComparableResult, calibrated: EvaluatorComparableResult) => {
  if (typeof candidate === 'number' && typeof calibrated === 'number') return withinTolerance(candidate, calibrated);
  return candidate !== undefined && candidate === calibrated;
};

export const calibrationBatchPassed = (matched: number, total: number) => {
  if (total <= 0) return false;
  return total < 5 ? matched === total : matched / total >= EVALUATOR_BATCH_HIT_RATE;
};

export const regressionResultStable = (candidate: EvaluatorComparableResult, original: EvaluatorComparableResult, threshold?: number) => {
  if (typeof candidate === 'number' && typeof original === 'number') {
    if (!withinTolerance(candidate, original)) return false;
    return threshold === undefined || (candidate >= threshold) === (original >= threshold);
  }
  return candidate !== undefined && candidate === original;
};
