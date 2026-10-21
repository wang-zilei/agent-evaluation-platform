import { describe, expect, it } from 'vitest';
import {
  buildDatasetCasesFromCases,
  buildDatasetCasesFromResults,
  mapDatasetCaseToDatasetValues,
  mapTaskCaseToDatasetValues,
  taskBackflowFields,
} from './dataset-backflow';
import type { CaseResult, Dataset, EvaluationTask } from './evaluation.types';

const sourceDataset: Dataset = {
  id: 'DS-SOURCE',
  name: '来源评测集',
  description: '',
  tags: [],
  status: '已提交',
  source: '用户上传',
  createdAt: '2026-10-21 10:00',
  updatedAt: '2026-10-21 10:00',
  createdBy: '测试',
  fields: [
    { id: 'source-input', name: '用户问题', semantic: 'Input', description: '', required: true },
    { id: 'source-expected', name: '验收要点', semantic: 'Expected Output', description: '', required: false },
    { id: 'source-output', name: 'Agent 回答', semantic: 'Agent Output', description: '', required: false },
    { id: 'source-order', name: '订单号', semantic: 'Custom', description: '', required: false },
  ],
  cases: [{
    id: 'CASE-008',
    values: {
      'source-input': '查询订单',
      'source-expected': '返回订单状态',
      'source-output': '订单已发货',
      'source-order': 'OD-1001',
    },
    source: '用户上传',
    createdAt: '2026-10-20',
  }],
  versions: [],
  draftVersionId: '',
};

const task: EvaluationTask = {
  id: 'TASK-001',
  name: '订单问数回归',
  description: '',
  agent: '问数 Agent',
  agentVersion: 'V1',
  datasetId: sourceDataset.id,
  datasetVersion: 'V1',
  evaluatorIds: [],
  status: '已完成',
  tone: 'success',
  createdBy: '测试',
  createdAt: '2026-10-21 10:00',
  updatedAt: '2026-10-21 10:10',
  totalCases: 1,
  executableCases: 1,
  completedCases: 1,
  failedCases: 0,
  results: [],
  runtime: { concurrency: 1, timeout: 60, continueOnError: true },
};

const result: CaseResult = {
  caseId: 'CASE-008',
  status: '通过',
  input: '查询订单',
  expectedOutput: '返回订单状态',
  agentOutput: '订单已发货',
  trace: [],
  evaluatorResults: [],
  agentConfiguration: '',
  observedTraceId: 'trace-order-008',
};

describe('dataset task backflow', () => {
  it('maps source values to target fields by semantic and custom field name', () => {
    const targetFields = [
      { id: 'target-input', name: '问题', semantic: 'Input' as const, description: '', required: true },
      { id: 'target-order', name: '订单号', semantic: 'Custom' as const, description: '', required: false },
      { id: 'target-trace', name: 'Trace', semantic: 'Trace' as const, description: '', required: false },
    ];

    expect(mapTaskCaseToDatasetValues({
      item: result,
      targetFields,
      sourceFields: taskBackflowFields(task, [sourceDataset]),
      sourceDataset,
    })).toEqual({
      'target-input': '查询订单',
      'target-order': 'OD-1001',
      'target-trace': 'trace://trace-order-008',
    });
  });

  it('creates review cases with sequential IDs and task backflow source', () => {
    const cases = buildDatasetCasesFromResults({
      results: [result, { ...result, caseId: 'CASE-009', observedTraceId: 'trace-order-009' }],
      targetFields: sourceDataset.fields,
      sourceFields: sourceDataset.fields,
      sourceDataset,
      existingCases: [{ ...sourceDataset.cases[0], id: 'CASE-007' }],
      createdAt: '2026-10-21 12:30',
    });

    expect(cases.map((item) => item.id)).toEqual(['CASE-008', 'CASE-009']);
    expect(cases.every((item) => item.source === '评测任务回流')).toBe(true);
    expect(cases.every((item) => item.createdAt === '2026-10-21')).toBe(true);
  });

  it('maps dataset cases into another dataset with copied source metadata', () => {
    const targetFields = [
      { id: 'target-question', name: '问题', semantic: 'Input' as const, description: '', required: true },
      { id: 'target-order', name: '订单号', semantic: 'Custom' as const, description: '', required: false },
    ];
    const values = mapDatasetCaseToDatasetValues({
      item: sourceDataset.cases[0],
      targetFields,
      sourceFields: sourceDataset.fields,
    });
    const cases = buildDatasetCasesFromCases({
      cases: [sourceDataset.cases[0]],
      targetFields,
      sourceFields: sourceDataset.fields,
      existingCases: [{ ...sourceDataset.cases[0], id: 'CASE-004' }],
      createdAt: '2026-10-21 13:20',
    });

    expect(values).toEqual({
      'target-question': '查询订单',
      'target-order': 'OD-1001',
    });
    expect(cases[0].id).toBe('CASE-005');
    expect(cases[0].source).toBe('评测集复制');
  });
});
