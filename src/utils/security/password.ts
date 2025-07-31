import { hash } from "bun";

export function hashPassword(password: string) {
  return hash(password, 13);
}
