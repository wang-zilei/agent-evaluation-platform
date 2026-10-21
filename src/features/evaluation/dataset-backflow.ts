import type {
  CaseResult,
  Dataset,
  DatasetCase,
  EvaluationTask,
  FieldDefinition,
  FieldSemantic,
} from './evaluation.types';

export type AddToDatasetTarget =
  | { mode: 'existing'; datasetId: string }
  | { mode: 'new'; name: string; description: string };

export type AddCasesToDatasetResult =
  | { ok: true; datasetId: string; datasetName: string; addedCount: number; created: boolean }
  | { ok: false };

const field = (
  id: string,
  name: string,
  semantic: FieldSemantic,
  description: string,
  required = false,
): FieldDefinition => ({ id, name, semantic, description, required });

const fallbackTaskFields: FieldDefinition[] = [
  field('task-input', 'Input', 'Input', '任务运行时保存的用户输入。', true),
  field('task-expected-output', 'Expected Output', 'Expected Output', '可用于回归验证的期望结果。'),
  field('task-agent-output', 'Agent Output', 'Agent Output', '任务运行时保存的 Agent 输出。'),
  field('task-trace', 'Trace', 'Trace', '任务运行时保存的原始执行轨迹。'),
  field('task-user-feedback', 'User Feedback', 'User Feedback', '来自原始数据的用户反馈。'),
];

const uniqueFields = (fields: FieldDefinition[]) => {
  const seen = new Set<string>();
  return fields.filter((item) => {
    const key = item.semantic === 'Custom' ? `${item.semantic}:${item.name.trim()}` : item.semantic;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const taskBackflowFields = (task: EvaluationTask, datasets: Dataset[]): FieldDefinition[] => {
  const sourceDataset = datasets.find((dataset) => dataset.id === task.datasetId);
  const fields = sourceDataset?.fields.length ? sourceDataset.fields : fallbackTaskFields;
  return uniqueFields(fields).map((item) => ({ ...item }));
};

const sourceFieldValue = (
  item: CaseResult,
  sourceDataset: Dataset | undefined,
  sourceField: FieldDefinition | undefined,
) => {
  if (!sourceField) return '';
  const sourceCase = sourceDataset?.cases.find((datasetCase) => datasetCase.id === item.caseId);
  return sourceCase?.values[sourceField.id] ?? '';
};

const sourceValueForSemantic = (
  semantic: FieldSemantic,
  item: CaseResult,
  sourceFields: FieldDefinition[],
  sourceDataset: Dataset | undefined,
) => {
  const sourceField = sourceFields.find((fieldDefinition) => fieldDefinition.semantic === semantic);
  return sourceFieldValue(item, sourceDataset, sourceField);
};

const traceReference = (item: CaseResult) =>
  `trace://${item.observedTraceId ?? item.queryAgent?.traceId ?? item.caseId}`;

export const mapTaskCaseToDatasetValues = ({
  item,
  targetFields,
  sourceFields,
  sourceDataset,
}: {
  item: CaseResult;
  targetFields: FieldDefinition[];
  sourceFields: FieldDefinition[];
  sourceDataset?: Dataset;
}): Record<string, string> => {
  const sourceCase = sourceDataset?.cases.find((datasetCase) => datasetCase.id === item.caseId);
  const valueFor = (targetField: FieldDefinition) => {
    switch (targetField.semantic) {
      case 'Input':
        return item.input || sourceValueForSemantic('Input', item, sourceFields, sourceDataset);
      case 'Expected Output':
        return item.expectedOutput || sourceValueForSemantic('Expected Output', item, sourceFields, sourceDataset);
      case 'Agent Output':
        return item.agentOutput || sourceValueForSemantic('Agent Output', item, sourceFields, sourceDataset);
      case 'Agent Configuration':
        return item.agentConfiguration || sourceValueForSemantic('Agent Configuration', item, sourceFields, sourceDataset);
      case 'User Feedback':
        return item.userFeedback || sourceValueForSemantic('User Feedback', item, sourceFields, sourceDataset);
      case 'Trace':
        return sourceValueForSemantic('Trace', item, sourceFields, sourceDataset) || traceReference(item);
      case 'File':
        return sourceValueForSemantic('File', item, sourceFields, sourceDataset);
      case 'Custom': {
        const matchingField = sourceFields.find((sourceField) => (
          sourceField.semantic === 'Custom' && sourceField.name.trim() === targetField.name.trim()
        )) ?? sourceFields.find((sourceField) => sourceField.id === targetField.id);
        return sourceCase?.values[matchingField?.id ?? ''] ?? '';
      }
      default:
        return '';
    }
  };

  return Object.fromEntries(targetFields.map((targetField) => [targetField.id, valueFor(targetField)]));
};

const nextCaseNumber = (cases: DatasetCase[]) => {
  const highest = cases.reduce((max, item) => {
    const match = item.id.match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return highest + 1;
};

export const buildDatasetCasesFromResults = ({
  results,
  targetFields,
  sourceFields,
  sourceDataset,
  existingCases = [],
  createdAt,
}: {
  results: CaseResult[];
  targetFields: FieldDefinition[];
  sourceFields: FieldDefinition[];
  sourceDataset?: Dataset;
  existingCases?: DatasetCase[];
  createdAt: string;
}): DatasetCase[] => {
  const firstCaseNumber = nextCaseNumber(existingCases);
  const createdDate = createdAt.slice(0, 10);

  return results.map((item, index) => {
    const values = mapTaskCaseToDatasetValues({ item, targetFields, sourceFields, sourceDataset });
    const fileFieldIds = targetFields.filter((targetField) => targetField.semantic === 'File').map((targetField) => targetField.id);
    return {
      id: `CASE-${String(firstCaseNumber + index).padStart(3, '0')}`,
      values,
      source: '评测任务回流',
      createdAt: createdDate,
      hasFile: fileFieldIds.some((fieldId) => Boolean(values[fieldId])),
    };
  });
};

const sourceFieldForTarget = (targetField: FieldDefinition, sourceFields: FieldDefinition[]) => {
  if (targetField.semantic === 'Custom') {
    return sourceFields.find((sourceField) => (
      sourceField.semantic === 'Custom' && sourceField.name.trim() === targetField.name.trim()
    )) ?? sourceFields.find((sourceField) => sourceField.id === targetField.id);
  }
  return sourceFields.find((sourceField) => sourceField.semantic === targetField.semantic);
};

export const mapDatasetCaseToDatasetValues = ({
  item,
  targetFields,
  sourceFields,
}: {
  item: DatasetCase;
  targetFields: FieldDefinition[];
  sourceFields: FieldDefinition[];
}): Record<string, string> => Object.fromEntries(targetFields.map((targetField) => {
  const sourceField = sourceFieldForTarget(targetField, sourceFields);
  return [targetField.id, item.values[sourceField?.id ?? targetField.id] ?? ''];
}));

export const buildDatasetCasesFromCases = ({
  cases,
  targetFields,
  sourceFields,
  existingCases = [],
  createdAt,
}: {
  cases: DatasetCase[];
  targetFields: FieldDefinition[];
  sourceFields: FieldDefinition[];
  existingCases?: DatasetCase[];
  createdAt: string;
}): DatasetCase[] => {
  const firstCaseNumber = nextCaseNumber(existingCases);
  const createdDate = createdAt.slice(0, 10);

  return cases.map((item, index) => {
    const values = mapDatasetCaseToDatasetValues({ item, targetFields, sourceFields });
    const fileFieldIds = targetFields.filter((targetField) => targetField.semantic === 'File').map((targetField) => targetField.id);
    return {
      id: `CASE-${String(firstCaseNumber + index).padStart(3, '0')}`,
      values,
      source: '评测集复制',
      createdAt: createdDate,
      hasFile: fileFieldIds.some((fieldId) => Boolean(values[fieldId])),
    };
  });
};
