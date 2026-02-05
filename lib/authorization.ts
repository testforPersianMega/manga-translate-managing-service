import { prisma } from "./prisma";
import { PERMISSIONS } from "./permissions";
import { getSessionUser } from "./auth";
import type { Chapter, User } from "@prisma/client";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("عدم دسترسی: ابتدا وارد شوید");
  }
  return user;
}

export async function getEffectivePermissions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
      permissionGrants: { include: { permission: true } },
      permissionDenies: { include: { permission: true } },
    },
  });
  if (!user) return new Set<string>();
  if (user.role.name === "ADMIN") {
    const all = await prisma.permission.findMany();
    return new Set(all.map((perm) => perm.key));
  }
  const rolePermissions = user.role.rolePermissions.map(
    (item) => item.permission.key,
  );
  const grantPermissions = user.permissionGrants.map(
    (item) => item.permission.key,
  );
  const denyPermissions = new Set(
    user.permissionDenies.map((item) => item.permission.key),
  );
  const merged = new Set([...rolePermissions, ...grantPermissions]);
  denyPermissions.forEach((key) => merged.delete(key));
  return merged;
}

export async function hasPermission(userId: string, permission: string) {
  const permissions = await getEffectivePermissions(userId);
  return permissions.has(permission);
}

export async function canAccessBook(user: User, bookId: string) {
  if (user.roleId) {
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    if (role?.name === "ADMIN") {
      return true;
    }
  }
  if (user.scopeMode === "ALL_BOOKS") {
    return true;
  }
  const access = await prisma.bookAccess.findUnique({
    where: {
      userId_bookId: {
        userId: user.id,
        bookId,
      },
    },
  });
  return Boolean(access);
}

export async function canViewChapter(user: User, chapter: Chapter) {
  if (await canAccessBook(user, chapter.bookId)) {
    const permissions = await getEffectivePermissions(user.id);
    if (permissions.has(PERMISSIONS.CHAPTER_VIEW_ANY)) {
      return true;
    }
    if (permissions.has(PERMISSIONS.CHAPTER_VIEW_OWN)) {
      return chapter.assignedToUserId === user.id;
    }
  }
  return false;
}

export async function canEditChapter(user: User, chapter: Chapter) {
  if (await canAccessBook(user, chapter.bookId)) {
    const permissions = await getEffectivePermissions(user.id);
    if (permissions.has(PERMISSIONS.CHAPTER_EDIT_ANY)) {
      return true;
    }
    if (permissions.has(PERMISSIONS.CHAPTER_EDIT_OWN)) {
      return chapter.assignedToUserId === user.id;
    }
  }
  return false;
}

export async function assertPermission(userId: string, permission: string) {
  const allowed = await hasPermission(userId, permission);
  if (!allowed) {
    throw new Error("عدم دسترسی لازم");
  }
}
