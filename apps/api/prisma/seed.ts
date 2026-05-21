import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 12);
  const userPassword = await bcrypt.hash('user123', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { username: 'worker' },
    update: {},
    create: {
      username: 'worker',
      passwordHash: userPassword,
      role: UserRole.USER,
    },
  });

  // Sample SKUs from the Zoho catalog so local approvals exercise the SKU lookup path.
  const seedItems = [
    { sku: '1275', productName: '100W Garage Light (18 pcs)', quantity: 490 },
    { sku: '1281', productName: '0.72W RGB Module (10 pcs)', quantity: 128 },
    { sku: '1558', productName: '1.2W White Module 10000K (8 bags)', quantity: 172 },
    { sku: '1132', productName: '100ft Outdoor Permanent Light 72W (8 pcs)', quantity: 16 },
    { sku: '1485', productName: '1.5W Cool White Module', quantity: 0 },
  ];
  for (const it of seedItems) {
    await prisma.inventoryItem.upsert({
      where: { sku: it.sku },
      update: {},
      create: it,
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
