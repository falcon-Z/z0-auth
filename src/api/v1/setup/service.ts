import { PrismaClient, PlatformRoleType } from "@prisma/client";
import { hashPassword } from "../../../lib/auth";
import type { SuperAdminInput } from "./validations";

const prisma = new PrismaClient();

/**
 * Handles platform setup by creating a super admin PlatformManager.
 * @param input - Super admin credentials
 * @returns The created PlatformManager (without password)
 */
export async function handleSetup(input: SuperAdminInput) {
  const { name, email, password } = input;
  const hashed = await hashPassword(password);
  const manager = await prisma.platformManager.create({
    data: {
      name,
      email,
      password: hashed,
      roleType: PlatformRoleType.SUPER_ADMIN,
      scopes: [],
    },
    select: {
      id: true,
      name: true,
      email: true,
      roleType: true,
      createdAt: true,
    },
  });
  return manager;
}
