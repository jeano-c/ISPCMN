import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

export const DRIZZLE = 'DRIZZLE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const client = createClient({
          url: process.env.DATABASE_URL!,
          authToken: process.env.DATABASE_TOKEN!,
        });
        return drizzle(client);
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
