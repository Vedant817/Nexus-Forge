export function canPublishLegacyProjection(
  runStatus: string,
  stageStatuses: string[],
  expectedStageCount = 5,
): boolean {
  return runStatus === 'RUNNING'
    && stageStatuses.length === expectedStageCount
    && stageStatuses.every((status) => status === 'SUCCEEDED' || status === 'SKIPPED')
}
