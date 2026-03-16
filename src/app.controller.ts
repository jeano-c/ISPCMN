import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  getHome(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ispecmn API</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #121212;
            color: #ffffff;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }
          .container {
            text-align: center;
          }
          h1 {
            font-weight: 300;
            margin-bottom: 2rem;
            color: #f3f4f6;
          }
          .btn {
            background-color: #3b82f6;
            color: white;
            padding: 12px 28px;
            text-decoration: none;
            font-size: 1.1rem;
            font-weight: 500;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            transition: all 0.2s ease-in-out;
          }
          .btn:hover {
            background-color: #2563eb;
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Welcome to Ispecmn API</h1>
          <a href="https://www.ispecmn.site/" class="btn">Go to Ispecmn Site</a>
        </div>
      </body>
      </html>
    `;
  }
}
