import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import 'multer';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CreateResponseDto } from './dto/create-response.dto';
import { UpdateResponseDto } from './dto/update-response.dto';
import { DRIZZLE } from 'src/database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql/driver';
import * as schema from '../database/schema';
import { and, eq, desc } from 'drizzle-orm';
import { users } from '../database/schema';
import { randomUUID } from 'crypto';
@Injectable()
export class ResponseService {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  async submit(
    publicId: string,
    dto: CreateResponseDto,
    req: ExpressRequest,
    res: ExpressResponse,
  ) {
    // 1. Fetch the survey by publicId
    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.publicId, publicId))
      .get();

    if (!survey) {
      throw new NotFoundException('Form not found.');
    }

    let browserId = req.cookies?.['survey_client_id'] as string | undefined;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!browserId || !uuidRegex.test(browserId)) {
      browserId = randomUUID();

      // Attach cookie to the response
      res.cookie('survey_client_id', browserId, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
      });
    }

    // 3. Handle optional user authentication
    let userId: number | null = null;
    const authUser = req.user as { email?: string };

    if (authUser?.email) {
      const user = await this.db
        .select()
        .from(users)
        .where(eq(users.email, authUser.email))
        .get();

      if (user) {
        userId = user.id;
      }
    }

    // 4. Check for multiple submissions if restricted
    if (!survey.allowMultipleSubmissions) {
      let alreadySubmitted = false;

      if (userId) {
        const existingResponse = await this.db
          .select()
          .from(schema.responses)
          .where(
            and(
              eq(schema.responses.surveyId, survey.id),
              eq(schema.responses.userId, userId),
            ),
          )
          .get();

        alreadySubmitted = !!existingResponse;
      } else {
        const existingResponse = await this.db
          .select()
          .from(schema.responses)
          .where(
            and(
              eq(schema.responses.surveyId, survey.id),
              eq(schema.responses.browserId, browserId),
            ),
          )
          .get();

        alreadySubmitted = !!existingResponse;
      }

      if (alreadySubmitted) {
        throw new ConflictException(
          'You have already submitted a response to this form.',
        );
      }
    }

    // 5. Save the response
    await this.db.insert(schema.responses).values({
      ...dto,
      surveyId: survey.id,
      browserId: browserId,
      userId: userId,
      submittedAt: new Date().toISOString(),
    });

    return { message: 'Response submitted successfully' };
  }

  async uploadMedia(file: Express.Multer.File) {
    const extension = path.extname(file.originalname).toLowerCase();
    const folderName = 'PrivateStorage';
    const pathToSave = path.join(process.cwd(), folderName);

    try {
      await fs.access(pathToSave);
    } catch {
      await fs.mkdir(pathToSave, { recursive: true });
    }

    const fileName = `${randomUUID()}${extension}`;
    const fullPath = path.join(pathToSave, fileName);

    await fs.writeFile(fullPath, file.buffer);

    const insertedMedia = await this.db
      .insert(schema.media)
      .values({
        mediaUrl: fileName,
      })
      .returning();

    const mediaId = insertedMedia[0].id;

    return {
      id: mediaId,
      url: `/api/response/media/view/${mediaId}`,
    };
  }

  async deleteMedia(id: number) {
    const medium = await this.db
      .select()
      .from(schema.media)
      .where(eq(schema.media.id, id))
      .get();

    if (!medium) {
      throw new NotFoundException(`Item with ID ${id} was not found.`);
    }

    try {
      await this.db.delete(schema.media).where(eq(schema.media.id, id));
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      throw new InternalServerErrorException(
        `An error occurred during deletion: ${message}`,
      );
    }
  }

  async getMediaFile(id: number) {
    const medium = await this.db
      .select()
      .from(schema.media)
      .where(eq(schema.media.id, id))
      .get();

    if (!medium || !medium.mediaUrl) {
      throw new NotFoundException();
    }

    const folderName = 'PrivateStorage';
    const filePath = path.join(process.cwd(), folderName, medium.mediaUrl);

    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('File missing on server');
    }

    let contentType = 'application/octet-stream';
    const ext = path.extname(medium.mediaUrl).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.mp4') contentType = 'video/mp4';

    const buffer = await fs.readFile(filePath);
    return { buffer, contentType };
  }

  async getResponses(surveyId: number, authUser?: { email?: string }) {
    if (!authUser?.email) {
      throw new UnauthorizedException();
    }

    const currentUser = await this.db
      .select()
      .from(users)
      .where(eq(users.email, authUser.email))
      .get();

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, surveyId))
      .get();

    if (!survey || survey.userId !== currentUser.id) {
      throw new UnauthorizedException();
    }

    const allResponses = await this.db
      .select({
        id: schema.responses.id,
        responseData: schema.responses.responseData,
        submittedAt: schema.responses.submittedAt,
        respondentId: users.id,
        respondentName: users.name,
        respondentEmail: users.email,
      })
      .from(schema.responses)
      .leftJoin(users, eq(schema.responses.userId, users.id))
      .where(eq(schema.responses.surveyId, surveyId))
      .orderBy(desc(schema.responses.submittedAt));

    return allResponses.map((r) => ({
      id: r.id,
      responseData: r.responseData,
      submittedAt: r.submittedAt,
      respondent: r.respondentId
        ? {
            id: r.respondentId,
            name: r.respondentName,
            email: r.respondentEmail,
          }
        : null,
    }));
  }

  findAll() {
    return `This action returns all response`;
  }

  findOne(id: number) {
    return `This action returns a #${id} response`;
  }

  update(id: number, _: UpdateResponseDto) {
    return `This action updates a #${id} response`;
  }

  remove(id: number) {
    return `This action removes a #${id} response`;
  }
}
