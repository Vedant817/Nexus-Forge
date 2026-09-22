import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { Pool, type PoolClient } from 'pg'

async function main(): Promise<void> {

  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    console.log('Skipping PostgreSQL integration tests: TEST_DATABASE_URL is not set.')
    process.exit(0)
  }
  const parsedUrl = new URL(testUrl)
  if (!['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)) {
    throw new Error('TEST_DATABASE_URL must target a disposable local/CI PostgreSQL host.')
  }
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''))
  if (!/^nexus[_-]forge[_-](test|ci)(?:[_-][a-z0-9-]+)?$/i.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL must use a dedicated nexus_forge_test or nexus_forge_ci database.')
  }

  const migrate = spawnSync('npx prisma migrate deploy', {
    cwd: process.cwd(), shell: true, stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  })
  if (migrate.status !== 0) throw new Error('Disposable PostgreSQL migration deployment failed.')
  process.env.DATABASE_URL = testUrl
  const { CLAIM_JOB_SQL, FENCE_JOB_SQL, PrismaJobLeaseRepository } = await import('../src/lib/execution/job-repository')
  const { default: integrationPrisma } = await import('../src/lib/db/prisma')
  const { reconcileAiBudget, recordAiUsageEvent, reserveAiBudget } = await import('../src/lib/ai/budget')

  const pool = new Pool({ connectionString: testUrl })
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Integration assertion failed: ${message}`)
  }

  async function createUser(client: PoolClient): Promise<string> {
    const id = `user-${randomUUID()}`
    await client.query('INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,false,NOW(),NOW())', [id, 'CI User', `${id}@example.test`])
    return id
  }

  async function createProject(client: PoolClient, ownerId: string): Promise<string> {
    const id = `project-${randomUUID()}`
    await client.query('INSERT INTO "Project" ("id","ownerId","name","goal","repoUrl","prUrl","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())', [id, ownerId, 'CI project', '', '', '', 'idle'])
    return id
  }

  async function createRun(client: PoolClient, projectId: string, ownerId: string, status = 'QUEUED'): Promise<string> {
    const id = `run-${randomUUID()}`
    await client.query(`INSERT INTO "AnalysisRun"
      ("id","projectId","ownerId","status","inputSnapshot","inputHash","pipelineVersion","promptVersion","modelConfigVersion","modelConfig","queuedAt","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,'{"project":{"name":"ci","goal":"","repoUrl":"","prUrl":""},"sources":[]}'::jsonb,$5,'durable-v1','evidence-first-v1','groq-v1','{"provider":"groq","model":"ci"}'::jsonb,NOW(),NOW(),NOW())`, [id, projectId, ownerId, status, randomUUID()])
    return id
  }

  async function createAnalysisJob(client: PoolClient, projectId: string, ownerId: string, runId: string, values: { status?: string; attempts?: number; max?: number; expired?: boolean } = {}): Promise<string> {
    const id = `job-${randomUUID()}`
    await client.query(`INSERT INTO "Job"
      ("id","kind","status","projectId","ownerId","analysisRunId","attemptCount","maxAttempts","availableAt","leaseOwner","leaseToken","leaseExpiresAt","heartbeatAt","createdAt","updatedAt")
      VALUES ($1,'ANALYSIS',$2,$3,$4,$5,$6,$7,NOW(),$8,$9,CASE WHEN $10='expired' THEN NOW()-INTERVAL '1 minute' WHEN $10='live' THEN NOW()+INTERVAL '1 minute' ELSE NULL END,CASE WHEN $10='expired' THEN NOW()-INTERVAL '1 minute' WHEN $10='live' THEN NOW() ELSE NULL END,NOW(),NOW())`, [
      id, values.status ?? 'QUEUED', projectId, ownerId, runId, values.attempts ?? 0, values.max ?? 5,
      values.status === 'RUNNING' ? 'old-worker' : null,
      values.status === 'RUNNING' ? `old-${randomUUID()}` : null,
      values.status === 'RUNNING' ? (values.expired ? 'expired' : 'live') : 'none',
    ])
    return id
  }

  const client = await pool.connect()
  try {
    const migrations = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY started_at')
    const names = migrations.rows.map((row) => row.migration_name)
    assert(names.includes('20260811174500_auth_ownership_controls'), 'auth migration was applied')
    assert(names.includes('20260812090000_durable_analysis_execution'), 'durable migration was applied in order')
    assert(names.includes('20260812160000_evidence_scorecards'), 'evidence scorecard migration was applied in order')
    assert(names.includes('20260812123000_llm_boundary_telemetry'), 'LLM telemetry migration was applied in order')
    assert(names.includes('20260922190000_github_authority_safe_onboarding'), 'GitHub authority-safe onboarding migration was applied in order')
    assert(names.includes('20260922210000_workflow_human_overlay'), 'workflow human-overlay migration was applied in order')
    assert(names.includes('20260922220000_data_transfer_containment'), 'data-transfer containment migration was applied in order')
    assert(names.includes('20260922230000_workspace_tenancy'), 'workspace tenancy migration was applied in order')
    assert(names.includes('20260922240000_deletion_retention'), 'deletion retention migration was applied in order')
    assert(names.includes('20260922250000_trust_center'), 'trust center migration was applied in order')
    assert(names.includes('20260922260000_audit_ledger'), 'audit ledger migration was applied in order')
    assert(names.includes('20260922270000_hardening'), 'hardening migration was applied in order')
    assert(names.includes('20260922280000_entitlements'), 'entitlements migration was applied in order')
    assert(names.includes('20260922220000_data_transfer_containment'), 'data-transfer containment migration was applied in order')

    const ownerId = await createUser(client)

    const onboardingProject = await createProject(client, ownerId)
    const onboardingSession = `session-${randomUUID()}`
    await client.query('INSERT INTO "session" ("id","expiresAt","token","createdAt","updatedAt","userId") VALUES ($1,NOW()+INTERVAL \'1 hour\',$2,NOW(),NOW(),$3)', [onboardingSession, randomUUID(), ownerId])
    const onboardingState = `state-${randomUUID()}`
    await client.query('INSERT INTO "GitHubOnboardingState" ("id","tokenHash","projectId","userId","sessionId","status","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'CALLBACK_VERIFIED\',NOW()+INTERVAL \'15 minutes\',NOW(),NOW())', [onboardingState, randomUUID(), onboardingProject, ownerId, onboardingSession])
    const consume = () => pool.query('UPDATE "GitHubOnboardingState" SET "status"=\'CONSUMED\',"consumedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1 AND "status"=\'CALLBACK_VERIFIED\' RETURNING "id"', [onboardingState])
    const [firstConsume, secondConsume] = await Promise.all([consume(), consume()])
    assert(firstConsume.rowCount! + secondConsume.rowCount! === 1, 'GitHub onboarding state is consumed exactly once under concurrency')
    await client.query('INSERT INTO "RepositoryPermissionSnapshot" ("id","projectId","installationId","repositoryId","repositoryFullName","installationPermissions","userRepositoryPermissions","repositorySelection","observedAt","source","createdAt") VALUES ($1,$2,\'42\',\'100\',\'octo-org/repo\',\'{}\'::jsonb,\'{"admin":true}\'::jsonb,\'selected\',NOW(),\'integration\',NOW())', [`permission-${randomUUID()}`, onboardingProject])
    await client.query('DELETE FROM "Project" WHERE "id"=$1', [onboardingProject])
    const permissionRows = await client.query('SELECT COUNT(*)::int AS count FROM "RepositoryPermissionSnapshot" WHERE "projectId"=$1', [onboardingProject])
    assert(permissionRows.rows[0].count === 0, 'permission snapshots cascade when a project is deleted')

    const uniqueProject = await createProject(client, ownerId)
    await client.query('INSERT INTO "Workflow" ("id","projectId","tasksJson","acceptanceCriteria","completedAcceptanceCriteria","humanState","humanEdited","revision","createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'[]\', $5::jsonb,true,1,NOW(),NOW())', [
      `workflow-${randomUUID()}`, uniqueProject,
      JSON.stringify([{ id: 'generated-old', title: 'Old', description: '', status: 'planned', priority: 'medium', reason: '', acceptanceCriteria: [], suggestedAgentPrompt: '', evidence: [] }]),
      JSON.stringify(['Old criterion']),
      JSON.stringify({ version: 1, baseAnalysisRunId: null, tasks: [{ id: 'human-task', title: 'Maintained', description: '', status: 'done', priority: 'high', reason: '', acceptanceCriteria: [], suggestedAgentPrompt: '', evidence: [] }], acceptanceCriteria: ['Maintained criterion'], completedAcceptanceCriteria: [0] }),
    ])
    const updateWorkflow = () => pool.query('UPDATE "Workflow" SET "revision"="revision"+1,"tasksJson"=$2,"updatedAt"=NOW() WHERE "projectId"=$1 AND "revision"=1 RETURNING "revision"', [uniqueProject, JSON.stringify([{ id: 'generated-new' }])])
    const [firstWorkflowUpdate, secondWorkflowUpdate] = await Promise.all([updateWorkflow(), updateWorkflow()])
    assert(firstWorkflowUpdate.rowCount! + secondWorkflowUpdate.rowCount! === 1, 'workflow revision prevents concurrent lost updates')
    const preservedWorkflow = await client.query('SELECT "humanState","revision" FROM "Workflow" WHERE "projectId"=$1', [uniqueProject])
    assert(preservedWorkflow.rows[0].humanState.tasks[0].id === 'human-task', 'generated workflow updates preserve human-maintained state')
    assert(preservedWorkflow.rows[0].revision === 2, 'successful workflow update increments the revision')
    await client.query('INSERT INTO "Source" ("id","projectId","type","title","rawContent","quarantineStatus","scannerVersion") VALUES ($1,$2,\'notes\',\'quarantined\',\'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\',\'QUARANTINED\',\'secret-scanner-v1\')', [`source-${randomUUID()}`, uniqueProject])
    const quarantined = await client.query('SELECT COUNT(*)::int AS count FROM "Source" WHERE "projectId"=$1 AND "quarantineStatus"=\'QUARANTINED\'', [uniqueProject])
    assert(quarantined.rows[0].count === 1, 'quarantined sources persist scanner state')
    const manifestCheck = await client.query('SELECT "processingMode","admissionManifest","admissionDigest" FROM "AnalysisRun" LIMIT 1')
    void manifestCheck
    const firstRun = await createRun(client, uniqueProject, ownerId)
    let uniqueViolation = false
    try { await createRun(client, uniqueProject, ownerId) } catch (error) {
      uniqueViolation = (error as { code?: string }).code === '23505'
    }
    assert(uniqueViolation, 'partial unique index rejects a second active run')
    await client.query('UPDATE "AnalysisRun" SET "status" = \'FAILED\', "completedAt"=NOW() WHERE "id"=$1', [firstRun])

    let checkViolation = false
    try {
      const malformedProject = await createProject(client, ownerId)
      await client.query('INSERT INTO "Job" ("id","kind","status","projectId","ownerId","attemptCount","maxAttempts","availableAt","createdAt","updatedAt") VALUES ($1,\'ANALYSIS\',\'QUEUED\',$2,$3,0,5,NOW(),NOW(),NOW())', [`bad-${randomUUID()}`, malformedProject, ownerId])
    } catch (error) { checkViolation = (error as { code?: string }).code === '23514' }
    assert(checkViolation, 'job kind/consumer check rejects malformed tuples')

    const terminalProject = await createProject(client, ownerId)
    const terminalRun = await createRun(client, terminalProject, ownerId, 'SUCCEEDED')
    const terminalJobId = await createAnalysisJob(client, terminalProject, ownerId, terminalRun, { status: 'RUNNING', attempts: 1, max: 5 })
    const terminalRow = await client.query('SELECT "leaseToken" FROM "Job" WHERE "id"=$1', [terminalJobId])
    const terminalOutcome = await new PrismaJobLeaseRepository().retryOrDead({
      id: terminalJobId, kind: 'ANALYSIS', projectId: terminalProject, ownerId,
      analysisRunId: terminalRun, webhookDeliveryId: null, payload: null,
      attemptCount: 1, maxAttempts: 5, leaseToken: terminalRow.rows[0].leaseToken,
    }, { failureClass: 'PERMANENT', code: 'AfterPublishCrash', message: 'safe', transient: false })
    assert(terminalOutcome === 'succeeded', 'retry transition preserves an already-successful consumer state')

    const claimProjects = [await createProject(client, ownerId), await createProject(client, ownerId)]
    for (const projectId of claimProjects) {
      const runId = await createRun(client, projectId, ownerId)
      await createAnalysisJob(client, projectId, ownerId, runId)
    }
    const claimA = pool.query(CLAIM_JOB_SQL, ['ci-a', randomUUID(), 60_000])
    const claimB = pool.query(CLAIM_JOB_SQL, ['ci-b', randomUUID(), 60_000])
    const [claimedA, claimedB] = await Promise.all([claimA, claimB])
    assert(claimedA.rows[0]?.id && claimedB.rows[0]?.id && claimedA.rows[0].id !== claimedB.rows[0].id, 'SKIP LOCKED claims do not duplicate jobs')
    const claimed = claimedA.rows[0]
    const staleFence = await client.query(FENCE_JOB_SQL, [claimed.id, 'stale-token'])
    const liveFence = await client.query(FENCE_JOB_SQL, [claimed.id, claimed.leaseToken])
    assert(staleFence.rowCount === 0 && liveFence.rowCount === 1, 'stale lease token is fenced')
    await client.query('UPDATE "Job" SET "status"=\'SUCCEEDED\',"leaseToken"=NULL,"leaseExpiresAt"=NULL WHERE "id"=ANY($1)', [[claimedA.rows[0].id, claimedB.rows[0].id]])
    await client.query('UPDATE "AnalysisRun" SET "status"=\'SUCCEEDED\',"completedAt"=NOW() WHERE "projectId"=ANY($1)', [claimProjects])

    const reclaimProject = await createProject(client, ownerId)
    const reclaimRun = await createRun(client, reclaimProject, ownerId, 'RUNNING')
    const reclaimJob = await createAnalysisJob(client, reclaimProject, ownerId, reclaimRun, {
      status: 'RUNNING', attempts: 1, max: 5, expired: true,
    })
    const oldLease = await client.query('SELECT "leaseToken" FROM "Job" WHERE "id"=$1', [reclaimJob])
    const reclaimed = await client.query(CLAIM_JOB_SQL, ['reclaimer', randomUUID(), 60_000])
    assert(reclaimed.rows[0]?.id === reclaimJob, 'an expired under-limit lease is reclaimed')
    assert(reclaimed.rows[0].leaseToken !== oldLease.rows[0].leaseToken, 'reclaim rotates the lease token')
    const rejectedOldLease = await client.query(FENCE_JOB_SQL, [reclaimJob, oldLease.rows[0].leaseToken])
    assert(rejectedOldLease.rowCount === 0, 'the old token cannot checkpoint after lease takeover')
    await client.query('UPDATE "Job" SET "status"=\'SUCCEEDED\',"leaseToken"=NULL,"leaseExpiresAt"=NULL WHERE "id"=$1', [reclaimJob])
    await client.query('UPDATE "AnalysisRun" SET "status"=\'SUCCEEDED\',"completedAt"=NOW() WHERE "id"=$1', [reclaimRun])

    const successProject = await createProject(client, ownerId)
    const successRun = await createRun(client, successProject, ownerId, 'SUCCEEDED')
    const successJob = await createAnalysisJob(client, successProject, ownerId, successRun, { status: 'RUNNING', attempts: 5, max: 5, expired: true })

    const cancelProject = await createProject(client, ownerId)
    const cancelRun = await createRun(client, cancelProject, ownerId, 'CANCEL_REQUESTED')
    await client.query('INSERT INTO "AnalysisStageRun" ("id","analysisRunId","stage","ordinal","status","createdAt","updatedAt") VALUES ($1,$2,\'KNOWLEDGE\',0,\'RUNNING\',NOW(),NOW())', [`stage-${randomUUID()}`, cancelRun])
    const cancelJob = await createAnalysisJob(client, cancelProject, ownerId, cancelRun, { status: 'RUNNING', attempts: 5, max: 5, expired: true })

    const failureProject = await createProject(client, ownerId)
    const failureRun = await createRun(client, failureProject, ownerId, 'RUNNING')
    const failureJob = await createAnalysisJob(client, failureProject, ownerId, failureRun, { status: 'RUNNING', attempts: 5, max: 5, expired: true })

    const webhookProject = await createProject(client, ownerId)
    const deliveryId = `delivery-${randomUUID()}`
    await client.query(`INSERT INTO "WebhookDelivery" ("id","deliveryId","projectId","event","action","status","eventKey","payloadSha256","payload","receivedAt","processedAt")
      VALUES ($1,$2,$3,'pull_request','closed','processed',$4,$5,'{}'::jsonb,NOW(),NOW())`, [deliveryId, randomUUID(), webhookProject, randomUUID(), randomUUID()])
    const webhookJob = `job-${randomUUID()}`
    await client.query(`INSERT INTO "Job" ("id","kind","status","projectId","ownerId","webhookDeliveryId","attemptCount","maxAttempts","availableAt","leaseOwner","leaseToken","leaseExpiresAt","heartbeatAt","createdAt","updatedAt")
      VALUES ($1,'WEBHOOK','RUNNING',$2,$3,$4,5,5,NOW(),'old',$5,NOW()-INTERVAL '1 minute',NOW()-INTERVAL '1 minute',NOW(),NOW())`, [webhookJob, webhookProject, ownerId, deliveryId, randomUUID()])

    await client.query(CLAIM_JOB_SQL, ['reaper', randomUUID(), 60_000])
    const states = await client.query('SELECT "id","status"::text FROM "Job" WHERE "id"=ANY($1)', [[successJob, cancelJob, failureJob, webhookJob]])
    const state = new Map(states.rows.map((row) => [row.id, row.status]))
    assert(state.get(successJob) === 'SUCCEEDED', 'reaper finalizes already-successful analysis job')
    assert(state.get(webhookJob) === 'SUCCEEDED', 'reaper finalizes already-processed webhook job')
    assert(state.get(cancelJob) === 'CANCELLED', 'reaper terminalizes cancellation')
    assert(state.get(failureJob) === 'DEAD', 'reaper dead-letters only a genuinely nonterminal exhausted run')
    const failed = await client.query('SELECT "status"::text FROM "AnalysisRun" WHERE "id"=$1', [failureRun])
    assert(failed.rows[0].status === 'FAILED', 'reaper transitions the genuinely exhausted run to failed')
    const cancelled = await client.query('SELECT "status"::text FROM "AnalysisRun" WHERE "id"=$1', [cancelRun])
    assert(cancelled.rows[0].status === 'CANCELLED', 'cancellation releases active run status')

    const artifactProject = await createProject(client, ownerId)
    const artifactRun = await createRun(client, artifactProject, ownerId, 'SUCCEEDED')
    const artifactId = `artifact-${randomUUID()}`
    await client.query('INSERT INTO "ArtifactVersion" ("id","projectId","analysisRunId","kind","content","contentHash","createdAt") VALUES ($1,$2,$3,\'TEST\',\'{"ok":true}\'::jsonb,$4,NOW())', [artifactId, artifactProject, artifactRun, randomUUID()])
    let immutableViolation = false
    try { await client.query('UPDATE "ArtifactVersion" SET "content"=\'{"ok":false}\'::jsonb WHERE "id"=$1', [artifactId]) } catch (error) {
      immutableViolation = (error as { code?: string }).code === 'P0001'
    }
    assert(immutableViolation, 'immutable artifact trigger rejects updates')

    const evidenceProject = await createProject(client, ownerId)
    const evidenceRun = await createRun(client, evidenceProject, ownerId, 'RUNNING')
    const evidenceId = `evidence-${randomUUID()}`
    await client.query(`INSERT INTO "EvidenceRecord"
      ("id","projectId","analysisRunId","stableEvidenceId","evidenceType","source","collectorId","collectorVersion","observedAt","contentHash","facts","provenance","confidence","createdAt")
      VALUES ($1,$2,$3,'repository:inventory','repository.inventory','integration','integration','1',NOW(),$4,'{"hasReadme":true}'::jsonb,'REPOSITORY_SNAPSHOT','HIGH',NOW())`,
      [evidenceId, evidenceProject, evidenceRun, randomUUID()])
    let duplicateEvidenceRejected = false
    try {
      await client.query(`INSERT INTO "EvidenceRecord"
        ("id","projectId","analysisRunId","stableEvidenceId","evidenceType","source","collectorId","collectorVersion","observedAt","contentHash","facts","provenance","confidence","createdAt")
        VALUES ($1,$2,$3,'repository:inventory','repository.inventory','integration','integration','1',NOW(),$4,'{}'::jsonb,'REPOSITORY_SNAPSHOT','HIGH',NOW())`,
        [`duplicate-${randomUUID()}`, evidenceProject, evidenceRun, randomUUID()])
    } catch (error) { duplicateEvidenceRejected = (error as { code?: string }).code === '23505' }
    assert(duplicateEvidenceRejected, 'stable run-local evidence IDs prevent retry duplicates')
    const scorecardId = `scorecard-${randomUUID()}`
    const criterionId = `criterion-${randomUUID()}`
    await client.query('BEGIN')
    await client.query(`INSERT INTO "Scorecard"
      ("id","projectId","analysisRunId","kind","version","score","completenessRatio","completenessBasisPoints","totalWeight","knownWeight","passedWeight","applicableCount","evaluatedCount","passCount","failCount","unknownCount","notApplicableCount","createdAt")
      VALUES ($1,$2,$3,'REPOSITORY_MATURITY','integration-v1',100,1,10000,10,10,10,1,1,1,0,0,0,NOW())`, [scorecardId, evidenceProject, evidenceRun])
    await client.query(`INSERT INTO "CriterionResult"
      ("id","scorecardId","criterionId","criterionVersion","status","weight","reasonCode","reason","evaluatedAt","createdAt")
      VALUES ($1,$2,'repo.readme','1','PASS',10,'OBSERVED','Observed',NOW(),NOW())`, [criterionId, scorecardId])
    await client.query('INSERT INTO "CriterionResultEvidence" ("criterionResultId","evidenceRecordId","createdAt") VALUES ($1,$2,NOW())', [criterionId, evidenceId])
    await client.query('COMMIT')
    const otherEvidenceProject = await createProject(client, ownerId)
    const otherEvidenceRun = await createRun(client, otherEvidenceProject, ownerId, 'RUNNING')
    const otherEvidenceId = `evidence-${randomUUID()}`
    await client.query(`INSERT INTO "EvidenceRecord"
      ("id","projectId","analysisRunId","stableEvidenceId","evidenceType","source","collectorId","collectorVersion","observedAt","contentHash","facts","provenance","confidence","createdAt")
      VALUES ($1,$2,$3,'other:source','source.snapshot','integration','integration','1',NOW(),$4,'{}'::jsonb,'SOURCE_SNAPSHOT','HIGH',NOW())`,
      [otherEvidenceId, otherEvidenceProject, otherEvidenceRun, randomUUID()])
    let crossRunEvidenceLinkRejected = false
    try {
      await client.query('INSERT INTO "CriterionResultEvidence" ("criterionResultId","evidenceRecordId","createdAt") VALUES ($1,$2,NOW())', [criterionId, otherEvidenceId])
    } catch (error) { crossRunEvidenceLinkRejected = (error as { code?: string }).code === 'P0001' }
    assert(crossRunEvidenceLinkRejected, 'criterion links cannot reference evidence from another run/project')
    for (const [table, id] of [['EvidenceRecord', evidenceId], ['Scorecard', scorecardId], ['CriterionResult', criterionId]] as const) {
      let updateRejected = false
      try { await client.query(`UPDATE "${table}" SET "createdAt"=NOW() WHERE "id"=$1`, [id]) } catch (error) {
        updateRejected = (error as { code?: string }).code === 'P0001'
      }
      assert(updateRejected, `${table} immutable trigger rejects updates`)
      let deleteRejected = false
      try { await client.query(`DELETE FROM "${table}" WHERE "id"=$1`, [id]) } catch (error) {
        deleteRejected = (error as { code?: string }).code === 'P0001'
      }
      assert(deleteRejected, `${table} immutable trigger rejects deletes`)
    }
    for (const statement of [
      ['UPDATE "CriterionResultEvidence" SET "createdAt"=NOW() WHERE "criterionResultId"=$1 AND "evidenceRecordId"=$2', 'update'],
      ['DELETE FROM "CriterionResultEvidence" WHERE "criterionResultId"=$1 AND "evidenceRecordId"=$2', 'delete'],
    ] as const) {
      let rejected = false
      try { await client.query(statement[0], [criterionId, evidenceId]) } catch (error) {
        rejected = (error as { code?: string }).code === 'P0001'
      }
      assert(rejected, `CriterionResultEvidence immutable trigger rejects ${statement[1]}s`)
    }
    let scopeRejected = false
    const wrongProject = await createProject(client, ownerId)
    try {
      await client.query(`INSERT INTO "EvidenceRecord"
        ("id","projectId","analysisRunId","stableEvidenceId","evidenceType","source","collectorId","collectorVersion","observedAt","contentHash","facts","provenance","confidence","createdAt")
        VALUES ($1,$2,$3,'wrong-scope','source.snapshot','integration','integration','1',NOW(),$4,'{}'::jsonb,'SOURCE_SNAPSHOT','HIGH',NOW())`,
        [`bad-evidence-${randomUUID()}`, wrongProject, evidenceRun, randomUUID()])
    } catch (error) { scopeRejected = (error as { code?: string }).code === 'P0001' }
    assert(scopeRejected, 'evidence trigger rejects cross-project run linkage')

    await client.query('UPDATE "AnalysisRun" SET "ledgerSealedAt"=NOW(),"status"=\'SUCCEEDED\',"completedAt"=NOW() WHERE "id"=$1', [evidenceRun])
    const sealedInsertStatements: Array<[string, unknown[]]> = [
      [`INSERT INTO "EvidenceRecord" ("id","projectId","analysisRunId","stableEvidenceId","evidenceType","source","collectorId","collectorVersion","observedAt","contentHash","facts","provenance","confidence","createdAt") VALUES ($1,$2,$3,'sealed','source.snapshot','integration','integration','1',NOW(),$4,'{}'::jsonb,'SOURCE_SNAPSHOT','HIGH',NOW())`, [`sealed-e-${randomUUID()}`, evidenceProject, evidenceRun, randomUUID()]],
      [`INSERT INTO "Scorecard" ("id","projectId","analysisRunId","kind","version","score","completenessRatio","completenessBasisPoints","totalWeight","knownWeight","passedWeight","applicableCount","evaluatedCount","passCount","failCount","unknownCount","notApplicableCount","createdAt") VALUES ($1,$2,$3,'PROOF_COMPLETENESS','sealed',NULL,0,0,10,0,0,1,0,0,0,1,0,NOW())`, [`sealed-s-${randomUUID()}`, evidenceProject, evidenceRun]],
      [`INSERT INTO "CriterionResult" ("id","scorecardId","criterionId","criterionVersion","status","weight","reasonCode","reason","evaluatedAt","createdAt") VALUES ($1,$2,'sealed','1','UNKNOWN',10,'SEALED','sealed',NOW(),NOW())`, [`sealed-c-${randomUUID()}`, scorecardId]],
      [`INSERT INTO "CriterionResultEvidence" ("criterionResultId","evidenceRecordId","createdAt") VALUES ($1,$2,NOW())`, [criterionId, evidenceId]],
    ]
    for (const [statement, parameters] of sealedInsertStatements) {
      let rejected = false
      try { await client.query(statement, parameters) } catch (error) { rejected = (error as { code?: string }).code === 'P0001' }
      assert(rejected, 'sealed ledger rejects every ledger row insertion path')
    }
    for (const [statement, parameter] of [
      ['DELETE FROM "AnalysisRun" WHERE "id"=$1', evidenceRun],
      ['DELETE FROM "Project" WHERE "id"=$1', evidenceProject],
    ] as const) {
      let rejected = false
      try { await client.query(statement, [parameter]) } catch (error) { rejected = (error as { code?: string }).code === '23503' }
      assert(rejected, 'ledger foreign keys restrict parent deletion')
    }

    const malformedProject = await createProject(client, ownerId)
    const malformedRun = await createRun(client, malformedProject, ownerId, 'RUNNING')
    let malformedScorecardRejected = false
    try {
      await client.query(`INSERT INTO "Scorecard" ("id","projectId","analysisRunId","kind","version","score","completenessRatio","completenessBasisPoints","totalWeight","knownWeight","passedWeight","applicableCount","evaluatedCount","passCount","failCount","unknownCount","notApplicableCount","createdAt") VALUES ($1,$2,$3,'PROOF_COMPLETENESS','malformed',100,1,10000,10,5,10,1,1,1,0,0,0,NOW())`, [`malformed-${randomUUID()}`, malformedProject, malformedRun])
    } catch (error) { malformedScorecardRejected = (error as { code?: string }).code === '23514' }
    assert(malformedScorecardRejected, 'scorecard arithmetic constraints reject malformed weighted aggregates')

    const snapshotProject = await createProject(client, ownerId)
    await client.query('UPDATE "Project" SET "githubInstallationId"=$1,"githubRepositoryId"=$2,"githubRepositoryFullName"=$3,"githubBindingStatus"=\'active\' WHERE "id"=$4', ['501', '601', 'owner/repo', snapshotProject])
    const snapshotRun = await createRun(client, snapshotProject, ownerId, 'RUNNING')
    const repositorySnapshotId = `snapshot-${randomUUID()}`
    await client.query(`INSERT INTO "RepositorySnapshot"
      ("id","projectId","analysisRunId","installationId","repositoryId","repositoryFullName","commitSha","treeSha","collectorVersion","complete","truncated","diagnostics","entryCount","sourceFileCount","decodedBytes","observedAt","createdAt")
      VALUES ($1,$2,$3,'501','601','owner/repo',$4,$5,'integration',true,false,'[]'::jsonb,1,1,10,NOW(),NOW())`,
      [repositorySnapshotId, snapshotProject, snapshotRun, 'a'.repeat(40), 'b'.repeat(40)])
    const repositoryFileId = `repository-file-${randomUUID()}`
    await client.query(`INSERT INTO "RepositoryFile"
      ("id","snapshotId","path","mode","objectType","blobSha","size","status","content","contentHash","createdAt")
      VALUES ($1,$2,'src/index.ts','100644','blob',$3,10,'collected','export {}',$4,NOW())`,
      [repositoryFileId, repositorySnapshotId, 'c'.repeat(40), randomUUID()])
    for (const [table, id] of [['RepositorySnapshot', repositorySnapshotId], ['RepositoryFile', repositoryFileId]] as const) {
      let rejected = false
      try { await client.query(`DELETE FROM "${table}" WHERE "id"=$1`, [id]) } catch (error) { rejected = (error as { code?: string }).code === 'P0001' }
      assert(rejected, `${table} immutable trigger rejects deletes`)
    }
    let snapshotScopeRejected = false
    try {
      await client.query(`INSERT INTO "RepositorySnapshot"
        ("id","projectId","analysisRunId","installationId","repositoryId","repositoryFullName","commitSha","treeSha","collectorVersion","diagnostics","observedAt","createdAt")
        VALUES ($1,$2,$3,'999','601','owner/repo',$4,$5,'integration-2','[]'::jsonb,NOW(),NOW())`,
        [`bad-snapshot-${randomUUID()}`, snapshotProject, snapshotRun, 'd'.repeat(40), 'e'.repeat(40)])
    } catch (error) { snapshotScopeRejected = (error as { code?: string }).code === 'P0001' }
    assert(snapshotScopeRejected, 'repository snapshot trigger rejects mismatched installation binding')
    await client.query('UPDATE "AnalysisRun" SET "status"=\'SUCCEEDED\',"completedAt"=NOW() WHERE "id"=$1', [snapshotRun])
    let lateFileRejected = false
    try { await client.query(`INSERT INTO "RepositoryFile" ("id","snapshotId","path","mode","objectType","status","createdAt") VALUES ($1,$2,'late.ts','100644','blob','not_collected',NOW())`, [`late-${randomUUID()}`, repositorySnapshotId]) } catch (error) { lateFileRejected = (error as { code?: string }).code === 'P0001' }
    assert(lateFileRejected, 'repository files cannot be appended after the run is terminal')

    const budgetOwner = await createUser(client)
    const budgetProject = await createProject(client, budgetOwner)
    process.env.AI_DAILY_USER_TOKEN_BUDGET = '100'
    process.env.AI_DAILY_PROJECT_TOKEN_BUDGET = '100'
    const budgetContext = {
      userId: budgetOwner,
      projectId: budgetProject,
      operation: 'integration.budget',
      requestedProvider: 'groq',
      requestedModel: 'integration-model',
      pipelineVersion: 'durable-v1',
      promptId: 'integration',
      promptVersion: '1',
      schemaVersion: '1',
      reservedTokens: 60,
    }
    const concurrentReservations = await Promise.allSettled([
      reserveAiBudget(budgetContext),
      reserveAiBudget(budgetContext),
    ])
    const acceptedReservations = concurrentReservations.filter((entry) => entry.status === 'fulfilled')
    const rejectedReservations = concurrentReservations.filter((entry) => entry.status === 'rejected')
    assert(acceptedReservations.length === 1 && rejectedReservations.length === 1, 'concurrent reservations atomically enforce the daily cap')
    const reservedBuckets = await client.query(
      'SELECT "reservedTokens","usedTokens" FROM "AiBudgetBucket" WHERE "key" LIKE $1 OR "key" LIKE $2 ORDER BY "key"',
      [`project:${budgetProject}:%`, `user:${budgetOwner}:%`],
    )
    assert(reservedBuckets.rows.length === 2, 'user and project budget buckets were created')
    assert(reservedBuckets.rows.every((row) => row.reservedTokens === 60 && row.usedTokens === 0), 'rejected reservation rolls back both bucket increments')

    const accepted = concurrentReservations.find((entry) => entry.status === 'fulfilled')
    if (!accepted || accepted.status !== 'fulfilled') throw new Error('Missing accepted budget reservation.')
    await reconcileAiBudget(accepted.value, { totalTokens: 25 })
    await reconcileAiBudget(accepted.value, { totalTokens: 25 })
    const reconciledBuckets = await client.query(
      'SELECT "reservedTokens","usedTokens" FROM "AiBudgetBucket" WHERE "key" LIKE $1 OR "key" LIKE $2',
      [`project:${budgetProject}:%`, `user:${budgetOwner}:%`],
    )
    assert(reconciledBuckets.rows.every((row) => row.reservedTokens === 0 && row.usedTokens === 25), 'usage reconciliation is idempotent and charges actual usage exactly once')
    await recordAiUsageEvent(accepted.value, { success: true, latencyMs: 5, totalTokens: 25 }, accepted.value.id)
    const usageEvents = await client.query('SELECT "success","totalTokens","promptId" FROM "AiUsageEvent" WHERE "projectId"=$1', [budgetProject])
    assert(usageEvents.rows.length === 1 && usageEvents.rows[0].success === true && usageEvents.rows[0].totalTokens === 25, 'safe usage telemetry persists separately from budget accounting')

    const conservativeOwner = await createUser(client)
    const conservativeProject = await createProject(client, conservativeOwner)
    const conservative = await reserveAiBudget({
      ...budgetContext,
      userId: conservativeOwner,
      projectId: conservativeProject,
      operation: 'integration.conservative',
      reservedTokens: 40,
    })
    const conservativeCharge = await reconcileAiBudget(conservative, { totalTokens: undefined })
    assert(conservativeCharge === 40, 'unknown provider usage charges the full reservation')

    const overageOwner = await createUser(client)
    const overageProject = await createProject(client, overageOwner)
    const overage = await reserveAiBudget({
      ...budgetContext,
      userId: overageOwner,
      projectId: overageProject,
      operation: 'integration.overage',
      reservedTokens: 40,
    })
    const overageCharge = await reconcileAiBudget(overage, { totalTokens: 140 })
    assert(overageCharge === 140, 'provider usage above the reservation is charged in full')
    const blockedAfterOverage = await Promise.allSettled([reserveAiBudget({
      ...budgetContext,
      userId: overageOwner,
      projectId: overageProject,
      operation: 'integration.after-overage',
      reservedTokens: 1,
    })])
    assert(blockedAfterOverage[0].status === 'rejected', 'an overage prevents subsequent calls beyond the daily cap')

    console.log('Durable PostgreSQL integration tests passed.')
  } finally {
    client.release()
    await integrationPrisma.$disconnect()
    await pool.end()
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Script failed')
  process.exitCode = 1
})
