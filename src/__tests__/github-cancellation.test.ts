import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPRContext, fetchRepoContext } from '@/lib/github/fetch-repo-context'

describe('GitHub collection cancellation seam', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('combines caller cancellation with repository request timeouts', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      throw new DOMException('cancelled', 'AbortError')
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    await expect(fetchRepoContext('https://github.com/owner/repo', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    await expect(fetchPRContext('https://github.com/owner/repo/pull/1', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
