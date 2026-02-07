import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { ALL_PERMISSION_KEYS, PERMISSION_CATALOG, PERMISSIONS } from "../lib/permissions";

async function main() {
  console.log("Seeding permissions...");
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        labelFa: permission.labelFa,
        group: permission.group,
      },
      create: {
        key: permission.key,
        labelFa: permission.labelFa,
        group: permission.group,
      },
    });
  }

  const permissions = await prisma.permission.findMany();
  const permissionMap = new Map(permissions.map((perm) => [perm.key, perm.id]));

  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: { description: "دسترسی کامل" },
    create: { name: "ADMIN", description: "دسترسی کامل" },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "MANAGER" },
    update: { description: "مدیر پروژه" },
    create: { name: "MANAGER", description: "مدیر پروژه" },
  });

  const translatorRole = await prisma.role.upsert({
    where: { name: "TRANSLATOR" },
    update: { description: "مترجم" },
    create: { name: "TRANSLATOR", description: "مترجم" },
  });

  await prisma.rolePermission.deleteMany({});

  const adminPermissions = ALL_PERMISSION_KEYS.map((key) => ({
    roleId: adminRole.id,
    permissionId: permissionMap.get(key)!,
  }));

  const managerPermissionKeys = [
    PERMISSIONS.USER_LIST,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DEACTIVATE,
    PERMISSIONS.USER_ASSIGN_ROLE,
    PERMISSIONS.USER_MANAGE_OVERRIDES,
    PERMISSIONS.USER_MANAGE_BOOK_SCOPE,
    PERMISSIONS.USER_RESET_PASSWORD,
    PERMISSIONS.ROLE_LIST,
    PERMISSIONS.ROLE_VIEW,
    PERMISSIONS.BOOK_LIST,
    PERMISSIONS.BOOK_VIEW,
    PERMISSIONS.BOOK_CREATE,
    PERMISSIONS.BOOK_UPDATE,
    PERMISSIONS.BOOK_DELETE,
    PERMISSIONS.CHAPTER_LIST,
    PERMISSIONS.CHAPTER_VIEW,
    PERMISSIONS.CHAPTER_CREATE,
    PERMISSIONS.CHAPTER_UPDATE,
    PERMISSIONS.CHAPTER_ASSIGN,
    PERMISSIONS.CHAPTER_CHANGE_STATUS,
    PERMISSIONS.CHAPTER_EDIT_ANY,
    PERMISSIONS.CHAPTER_VIEW_ANY,
    PERMISSIONS.CHAPTER_ASSETS_VIEW,
    PERMISSIONS.CHAPTER_ASSETS_PAGE_VIEW,
    PERMISSIONS.CHAPTER_ASSETS_UPLOAD,
    PERMISSIONS.CHAPTER_ASSETS_DELETE,
    PERMISSIONS.CHAPTER_ASSETS_UPDATE,
    PERMISSIONS.DASHBOARD_MANAGER,
  ];

  const managerPermissions = managerPermissionKeys.map((key) => ({
    roleId: managerRole.id,
    permissionId: permissionMap.get(key)!,
  }));

  const translatorPermissionKeys = [
    PERMISSIONS.BOOK_LIST,
    PERMISSIONS.BOOK_VIEW,
    PERMISSIONS.CHAPTER_LIST,
    PERMISSIONS.CHAPTER_VIEW,
    PERMISSIONS.CHAPTER_CLAIM,
    PERMISSIONS.CHAPTER_UNCLAIM,
    PERMISSIONS.CHAPTER_CHANGE_STATUS,
    PERMISSIONS.CHAPTER_VIEW_OWN,
    PERMISSIONS.CHAPTER_EDIT_OWN,
    PERMISSIONS.CHAPTER_ASSETS_VIEW,
    PERMISSIONS.CHAPTER_ASSETS_UPDATE,
    PERMISSIONS.DASHBOARD_TRANSLATOR,
  ];

  const translatorPermissions = translatorPermissionKeys.map((key) => ({
    roleId: translatorRole.id,
    permissionId: permissionMap.get(key)!,
  }));

  await prisma.rolePermission.createMany({
    data: [...adminPermissions, ...managerPermissions, ...translatorPermissions],
  });

  const adminPassword = await bcrypt.hash("Admin1234!", 10);
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      name: "مدیر کل",
      passwordHash: adminPassword,
      roleId: adminRole.id,
      isActive: true,
      scopeMode: "ALL_BOOKS",
    },
    create: {
      name: "مدیر کل",
      email: "admin@example.com",
      passwordHash: adminPassword,
      roleId: adminRole.id,
      isActive: true,
      scopeMode: "ALL_BOOKS",
    },
  });

  const sampleBooks = await prisma.book.createMany({
    data: [
      {
        titleFa: "قهرمان گمشده",
        titleEn: "Lost Hero",
        type: "MANGA",
        description: "یک مانگای ماجراجویانه برای نمونه",
      },
      {
        titleFa: "افسانه ماه",
        titleEn: "Moon Legend",
        type: "MANHWA",
        description: "نمونه مانهوا برای تست",
      },
    ],
    skipDuplicates: true,
  });

  const books = await prisma.book.findMany();
  if (books.length) {
    await prisma.chapter.createMany({
      data: [
        {
          bookId: books[0].id,
          number: "1",
          title: "شروع",
        },
        {
          bookId: books[0].id,
          number: "2",
          title: "نبرد اول",
        },
        {
          bookId: books[1].id,
          number: "1",
          title: "آغاز داستان",
        },
      ],
      skipDuplicates: true,
    });
  }

  console.log("Seed completed", sampleBooks);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
