import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://www.ispecmn.site',
      'http://localhost:5173/',
      process.env.FRONTEND_URL,
    ].filter(Boolean),

    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT || 3000);
}
void bootstrap();
