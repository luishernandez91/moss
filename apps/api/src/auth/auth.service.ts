import { randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '@moss/contracts';
import { DATABASE, type Database } from '../database/database.module.js';
import { users, partners } from '../database/schema.js';
import { hashPassword, verifyPassword } from './password.js';

const accountFields = {
  userId: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  sessionVersion: users.sessionVersion,
  partnerId: partners.id,
  partnerName: partners.name,
};
type Account = {
  userId: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  partnerId: string;
  partnerName: string;
};

export function publicUser(account: Account): AuthUser {
  return {
    userId: account.userId,
    email: account.email,
    partner: { id: account.partnerId, name: account.partnerName },
  };
}

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(24).toString('base64url'));
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async authenticate(email: string, password: string): Promise<Account | null> {
    const [account] = await this.db
      .select(accountFields)
      .from(users)
      .innerJoin(partners, eq(partners.userId, users.id))
      .where(eq(users.email, email));
    const valid = await verifyPassword(password, account?.passwordHash ?? (await this.dummyHash));
    return account && valid ? account : null;
  }

  async fromSession(userId: string, version: number): Promise<AuthUser> {
    const [account] = await this.db
      .select(accountFields)
      .from(users)
      .innerJoin(partners, eq(partners.userId, users.id))
      .where(eq(users.id, userId));
    if (!account || account.sessionVersion !== version) throw new UnauthorizedException();
    return publicUser(account);
  }
}
