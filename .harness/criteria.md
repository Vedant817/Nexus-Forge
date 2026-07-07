# Quality Criteria

## Build Criteria
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0 (if applicable)

## Test Criteria
- [ ] `npm test` — all tests pass
- [ ] Test count >= 85 (current baseline)
- [ ] No test files have `.skip` or `.todo` without justification

## Lint Criteria
- [ ] `npm run lint` exits 0

## Security Criteria
- [ ] No hardcoded secrets (API keys, tokens, passwords) in source
- [ ] No `console.log` in production code
- [ ] No `TODO` / `FIXME` / `HACK` without a linked issue
- [ ] Input validation (Zod schemas) on all API routes
- [ ] `@ts-expect-error` / `@ts-ignore` count <= 3

## Code Quality Criteria
- [ ] No dead code (unused exports, imports, variables)
- [ ] No commented-out code blocks
- [ ] Functions are under 50 lines unless justified
- [ ] Error messages are user-facing, not stack traces

## Scoring
Each criterion is worth 1 point.
- **Pass**: all criteria satisfied (score = total)
- **Conditional pass**: score >= 80% with no critical failures
- **Rework**: score < 80% or any critical failure

Critical failures: secrets in source, build broken, tests failing, no input validation.
