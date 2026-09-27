import { NormalizationRun, NormalizedResult } from '@prisma/client';

export interface CreateNormalizationRunParams {
  eventId: string;
  rubricId: string;
  rubricSnapshot: any;
  inputSnapshot: any;
  method: string;
  parameters: any;
  diagnostics: any;
  status: string;
  results: Omit<NormalizedResult, 'id' | 'normalizationRunId'>[];
}

export interface NormalizationRepository {
  createRun(params: CreateNormalizationRunParams): Promise<NormalizationRun>;
  findRunById(id: string): Promise<NormalizationRun | null>;
  findRunsByEvent(eventId: string): Promise<NormalizationRun[]>;
  findResultsByRun(runId: string): Promise<NormalizedResult[]>;
}
