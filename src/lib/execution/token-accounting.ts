export function checkpointTokenTotals(input: {
  telemetryInputTokens: number | null
  telemetryOutputTokens: number | null
  telemetryTotalTokens: number | null
  reconciledTotalTokens: number | null
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  return {
    inputTokens: input.telemetryInputTokens ?? 0,
    outputTokens: input.telemetryOutputTokens ?? 0,
    totalTokens: Math.max(input.telemetryTotalTokens ?? 0, input.reconciledTotalTokens ?? 0),
  }
}
