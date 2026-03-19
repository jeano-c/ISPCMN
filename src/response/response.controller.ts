import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponseService } from './response.service';
import { CreateResponseDto } from './dto/create-response.dto';
import { UpdateResponseDto } from './dto/update-response.dto';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import 'multer';

@Controller('api/Response')
export class ResponseController {
  constructor(private readonly responseService: ResponseService) {}

  @Post('submit/:publicId')
  submitResponse(
    @Param('publicId', ParseUUIDPipe) publicId: string,
    @Body() createResponseDto: CreateResponseDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.responseService.submit(publicId, createResponseDto, req, res);
  }

  @Post('responses/media')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file || file.size === 0) {
      throw new BadRequestException('No file uploaded.');
    }
    return this.responseService.uploadMedia(file);
  }

  @Delete('responses/media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(@Param('id', ParseIntPipe) id: number) {
    await this.responseService.deleteMedia(id);
  }

  @Get('media/view/:id')
  async viewMedia(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, contentType } = await this.responseService.getMediaFile(id);
    res.set('Content-Type', contentType);
    res.send(buffer);
  }

  @Get('responses/:surveyId')
  @UseGuards(JwtAuthGuard)
  getResponses(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Req() req: Request,
  ) {
    return this.responseService.getResponses(
      surveyId,
      req.user as { email?: string },
    );
  }

  @Get()
  findAll() {
    return this.responseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.responseService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateResponseDto: UpdateResponseDto,
  ) {
    return this.responseService.update(+id, updateResponseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.responseService.remove(+id);
  }
}
