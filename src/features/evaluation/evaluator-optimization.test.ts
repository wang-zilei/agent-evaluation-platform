import { describe, expect, it } from 'vitest';
import { calibrationBatchPassed, matchesCalibrationResult, regressionResultStable } from './evaluator-optimization';

describe('evaluator optimization validation', () => {
  it('accepts numeric calibration results within 0.1', () => {
    expect(matchesCalibrationResult(0.6, 0.5)).toBe(true);
    expect(matchesCalibrationResult(0.61, 0.5)).toBe(false);
  });

  it('requires pass/fail calibration results to match exactly', () => {
    expect(matchesCalibrationResult('通过', '通过')).toBe(true);
    expect(matchesCalibrationResult('不通过', '通过')).toBe(false);
  });

  it('requires every calibration to hit when fewer than five exist', () => {
    expect(calibrationBatchPassed(3, 3)).toBe(true);
    expect(calibrationBatchPassed(2, 3)).toBe(false);
  });

  it('requires at least 80 percent when five or more calibrations exist', () => {
    expect(calibrationBatchPassed(4, 5)).toBe(true);
    expect(calibrationBatchPassed(3, 5)).toBe(false);
  });

  it('keeps regression scores within tolerance and on the same threshold side', () => {
    expect(regressionResultStable(0.8, 0.88, 0.7)).toBe(true);
    expect(regressionResultStable(0.65, 0.71, 0.7)).toBe(false);
  });
});
