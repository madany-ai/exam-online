import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * تجزئة كلمة المرور باستخدام scrypt المدمج في Node.js
 * (لا حاجة لأي حزمة خارجية أو مكتبات أصلية).
 * الصيغة: scrypt$N$r$p$salt$hash
 */
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
const MAX_MEMORY = 64 * 1024 * 1024;

const DEFAULT_OPTIONS: ScryptOptions = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELISM,
  maxmem: MAX_MEMORY,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, DEFAULT_OPTIONS);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(hashRaw, "base64");
  if (expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    // معاملات تجزئة تالفة (مثل قيمة N غير صالحة) تُعامَل كفشل تحقق
    return false;
  }
}
