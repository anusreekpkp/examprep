import bcrypt from 'bcryptjs';

/**
 * 12 rounds costs roughly 250ms on Render's free CPU. High enough to make
 * offline cracking expensive, low enough that login does not feel broken.
 */
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
