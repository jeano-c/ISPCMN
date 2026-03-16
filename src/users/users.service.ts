import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { LibSQLDatabase } from 'drizzle-orm/libsql';

@Injectable()
export class UserService {
  constructor(
    @Inject(DRIZZLE)
    private db: LibSQLDatabase<typeof schema>,
  ) {}

  async findByEmail(email: string): Promise<schema.User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async create(userData: schema.InsertUser): Promise<schema.User> {
    const result = await this.db
      .insert(schema.users)
      .values(userData)
      .returning();
    return result[0];
  }

  async update(user: schema.User): Promise<schema.User> {
    const result = await this.db
      .update(schema.users)
      .set({
        name: user.name,
        avatar: user.avatar,
        password: user.password,
      })
      .where(eq(schema.users.id, user.id))
      .returning();

    return result[0];
  }

  async remove(user: schema.User): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, user.id));
  }
}
