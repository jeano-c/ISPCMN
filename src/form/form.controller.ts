import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  Put,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { FormService } from './form.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';
import { FormAIDto } from './dto/FormAi.dto';

@Controller('api/Form')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post('createform')
  @UseGuards(JwtAuthGuard)
  create(@Body() createFormDto: CreateFormDto, @Req() req: Request) {
    const user = req.user as { email: string };

    return this.formService.create(createFormDto, user.email);
  }

  @Put('saveform/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFormDto: UpdateFormDto,
    @Req() req: Request,
  ) {
    const user = req.user as { email: string };

    return this.formService.update(id, updateFormDto, user.email);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: Request) {
    const user = req.user as { email: string };
    return this.formService.findAll(user.email);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as { email: string };
    return this.formService.findOne(id, user.email);
  }

  @Get('view/:publicId')
  async getPublicForm(
    @Param('publicId') publicId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.formService.getPublicForm(publicId, req);

    if (result.setCookie) {
      res.cookie('survey_client_id', result.browserId, {
        httpOnly: true,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        secure: true,
        sameSite: 'none',
      });
    }

    return res.status(result.status).json(result.data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as { email: string };

    return this.formService.remove(id, user.email);
  }

  @Post('Ai/')
  @UseGuards(JwtAuthGuard)
  aiForm(@Body() dto: FormAIDto, @Req() req: Request) {
    const user = req.user as { email: string };

    return this.formService.generateAiForm(dto, user.email);
  }
}
