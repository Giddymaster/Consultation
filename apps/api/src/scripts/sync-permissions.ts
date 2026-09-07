import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, type Permission, type Role } from '@meridian/types';
import { prisma } from '../lib/prisma.js';

/**
 * Re-synchronises the permission catalogue and the default role grants.
 *
 * The seed does this too, but only as part of building a whole demo database.
 * When a permission is added, renamed or moved between roles — which is a code
 * change, not a data change — an existing environment needs the grants brought
 * back in line without touching a single booking. That is this script.
 *
 * It is idempotent and safe to run on a live database. Grants are replaced
 * wholesale per role so a permission *removed* from a role's defaults is
 * actually revoked; a role's grants are the code's to decide.
 *
 *   pnpm --filter @meridian/api permissions:sync
 */
async function main(): Promise<void> {
  let created = 0;

  for (const [key, description] of Object.entries(PERMISSIONS)) {
    const existing = await prisma.permission.findUnique({ where: { key }, select: { id: true } });
    if (!existing) created += 1;
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }

  // A permission dropped from the code should not linger as a grantable row.
  const known = Object.keys(PERMISSIONS);
  const removed = await prisma.permission.deleteMany({ where: { key: { notIn: known } } });

  console.log(`Permissions: ${known.length} known (${created} new, ${removed.count} obsolete removed)`);

  for (const roleName of Object.values(ROLES) as Role[]) {
    const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) {
      console.log(`  ${roleName}: role row absent, skipped`);
      continue;
    }

    const keys = [...DEFAULT_ROLE_PERMISSIONS[roleName]] as Permission[];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });

    const before = await prisma.rolePermission.count({ where: { roleId: role.id } });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      }),
    ]);

    console.log(`  ${roleName}: ${before} → ${permissions.length} grants`);
  }

  console.log(
    '\nSigned-in users keep their old permission set until their access token expires; a refresh re-reads these grants.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
