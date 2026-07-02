import * as bcrypt from 'bcryptjs';

export async function hashPassword(
  password: string,
  rounds: number = 12,
): Promise<string> {
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(password, salt);
}

export async function comparePasswords(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
