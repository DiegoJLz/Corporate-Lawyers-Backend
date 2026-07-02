import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Super Admin
  const passwordHash = await bcrypt.hash('Admin123!@#', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@corporatelawyers.com' },
    update: {},
    create: {
      email: 'admin@corporatelawyers.com',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+52 55 1234 5678',
      preferredLanguage: 'es',
      twoFactorEnabled: false,
    },
  });

  console.log(`Super Admin created: ${superAdmin.email}`);
  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
