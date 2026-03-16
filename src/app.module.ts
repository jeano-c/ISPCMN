import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FormModule } from './form/form.module';

@Module({
  imports: [
    // Add ConfigModule.forRoot() at the very top of your imports
    ConfigModule.forRoot({
      isGlobal: true, // Makes the variables available everywhere
    }),
    DatabaseModule,
    UserModule,
    AuthModule,
    FormModule,
  ],
})
export class AppModule {}
