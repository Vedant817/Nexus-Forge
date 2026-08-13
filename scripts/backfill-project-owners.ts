import prisma from '../src/lib/db/prisma'

async function main() {
  const email = process.env.LEGACY_PROJECT_OWNER_EMAIL?.trim().toLowerCase()
  if (!email) {
    throw new Error('Set LEGACY_PROJECT_OWNER_EMAIL to an existing Better Auth user before running this backfill.')
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
  if (!user) {
    throw new Error(`No Better Auth user exists for ${email}. Sign in once before running the backfill.`)
  }

  const result = await prisma.project.updateMany({
    where: { ownerId: null },
    data: { ownerId: user.id },
  })

  console.log(`Assigned ${result.count} unowned project(s) to ${user.email}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
