import prisma from './prisma'

export interface DatastoreAdapter {
  getProject(id: string): Promise<Record<string, unknown> | null>
  createProject(data: Record<string, unknown>): Promise<Record<string, unknown>>
  updateProject(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  deleteProject(id: string): Promise<void>
  listProjects(): Promise<Record<string, unknown>[]>
}

export class PrismaDatastore implements DatastoreAdapter {
  async getProject(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: { sources: true },
    })
  }

  async createProject(data: { name: string; goal?: string; repoUrl?: string; prUrl?: string }) {
    return prisma.project.create({ data })
  }

  async updateProject(id: string, data: Record<string, unknown>) {
    return prisma.project.update({ where: { id }, data: data as Record<string, unknown> })
  }

  async deleteProject(id: string) {
    await prisma.project.delete({ where: { id } })
  }

  async listProjects() {
    return prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { sources: true } },
      },
    })
  }
}

export interface DocumentStoreAdapter {
  store(id: string, content: string, metadata?: Record<string, string>): Promise<void>
  get(id: string): Promise<string | null>
  delete(id: string): Promise<void>
  list(): Promise<string[]>
}

export class PrismaDocumentStore implements DocumentStoreAdapter {
  async store(id: string, content: string, _metadata?: Record<string, string>) {
    if (_metadata?.projectId) {
      await prisma.source.upsert({
        where: { id },
        create: {
          id,
          projectId: _metadata.projectId,
          type: _metadata.type || 'docs',
          title: _metadata.title || '',
          rawContent: content,
          documentId: id,
        },
        update: {
          rawContent: content,
          title: _metadata?.title ?? undefined,
        },
      })
    }
  }

  async get(id: string): Promise<string | null> {
    const source = await prisma.source.findUnique({ where: { id } })
    return source?.rawContent ?? null
  }

  async delete(id: string) {
    await prisma.source.delete({ where: { id } }).catch(() => { })
  }

  async list(): Promise<string[]> {
    const sources = await prisma.source.findMany({ select: { id: true } })
    return sources.map(s => s.id)
  }
}

// Singletons for export
let _datastore: DatastoreAdapter | null = null
let _documentStore: DocumentStoreAdapter | null = null

export function getDatastore(): DatastoreAdapter {
  if (!_datastore) {
    _datastore = new PrismaDatastore()
  }
  return _datastore
}

export function getDocumentStore(): DocumentStoreAdapter {
  if (!_documentStore) {
    _documentStore = new PrismaDocumentStore()
  }
  return _documentStore
}
