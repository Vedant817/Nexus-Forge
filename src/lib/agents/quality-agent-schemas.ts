import { z } from 'zod'

export const qualityUnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  area: z.string(),
  description: z.string(),
  acceptance: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  dependencies: z.array(z.string()),
})

export const qualityPlannerOutputSchema = z.object({
  goal: z.string(),
  currentState: z.string(),
  units: z.array(qualityUnitSchema),
  criteriaProfile: z.array(z.string()),
})

export const fileEditSchema = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
})

export const qualityGeneratorOutputSchema = z.object({
  unitId: z.string(),
  title: z.string(),
  edits: z.array(fileEditSchema),
  explanation: z.string(),
})

export const criterionResultSchema = z.object({
  criterion: z.string(),
  passed: z.boolean(),
  detail: z.string(),
})

export const qualityEvaluatorOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  criticalFailure: z.boolean(),
  criterionResults: z.array(criterionResultSchema),
  summary: z.string(),
  reworkFeedback: z.string().optional(),
})

export type QualityUnit = z.infer<typeof qualityUnitSchema>
export type QualityPlannerOutput = z.infer<typeof qualityPlannerOutputSchema>
export type FileEdit = z.infer<typeof fileEditSchema>
export type QualityGeneratorOutput = z.infer<typeof qualityGeneratorOutputSchema>
export type CriterionResult = z.infer<typeof criterionResultSchema>
export type QualityEvaluatorOutput = z.infer<typeof qualityEvaluatorOutputSchema>
