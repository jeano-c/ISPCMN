import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { DRIZZLE } from 'src/database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { users } from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { FormAIDto } from './dto/FormAi.dto';

interface AiFormResult {
  title?: string;
  pages?: unknown;
}
@Injectable()
export class FormService {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  async create(createFormDto: CreateFormDto, email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = await this.db
      .insert(schema.surveys)
      .values({
        title: createFormDto.title,
        userId: user.id,
        publicId: crypto.randomUUID(),
      })
      .returning();
    return {
      message: 'Survey created',
      surveyId: survey[0].id,
      shareUrl: survey[0].publicId,
    };
  }

  async update(id: number, dto: UpdateFormDto, email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, id))
      .get();

    if (!survey || survey.userId !== user.id) {
      throw new NotFoundException('Survey not found');
    }

    const updateData: Partial<typeof schema.surveys.$inferInsert> = {};

    if (dto.title) {
      updateData.title = dto.title;
    }

    if (dto.formData) {
      updateData.formData = JSON.stringify(dto.formData);
    }

    if (dto.allowMultipleSubmissions !== undefined) {
      updateData.allowMultipleSubmissions = dto.allowMultipleSubmissions;
    }

    if (dto.isPublished !== undefined) {
      updateData.isPublished = dto.isPublished;
    }

    if (dto.hasReviewPage !== undefined) {
      updateData.hasReviewPage = dto.hasReviewPage;
    }

    await this.db
      .update(schema.surveys)
      .set(updateData)
      .where(eq(schema.surveys.id, id));

    return {
      message: 'Form updated successfully',
      surveyId: id,
    };
  }

  async findAll(email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const surveys = await this.db
      .select({
        id: schema.surveys.id,
        title: schema.surveys.title,
        isPublished: schema.surveys.isPublished,
        createdAt: schema.surveys.createdAt,
      })
      .from(schema.surveys)
      .where(eq(schema.surveys.userId, user.id))
      .orderBy(desc(schema.surveys.createdAt));

    const forms = await Promise.all(
      surveys.map(async (survey) => {
        const responses = await this.db
          .select()
          .from(schema.responses)
          .where(eq(schema.responses.surveyId, survey.id));

        return {
          ...survey,
          responseCount: responses.length,
        };
      }),
    );

    if (forms.length === 0) {
      return {
        message: 'You dont have any forms',
      };
    }

    return {
      data: forms,
    };
  }

  async findOne(id: number, email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, id))
      .get();

    if (!survey) {
      throw new NotFoundException('Form not found');
    }

    if (survey.userId !== user.id) {
      throw new ForbiddenException();
    }

    return {
      title: survey.title,
      formData: survey.formData
        ? (JSON.parse(survey.formData) as Record<string, unknown>)
        : null,
      publicId: survey.publicId,
      allowMultipleSubmissions: survey.allowMultipleSubmissions,
      isPublished: survey.isPublished,
      hasReviewPage: survey.hasReviewPage,
    };
  }

  async remove(id: number, email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, id))
      .get();

    if (!survey) {
      throw new NotFoundException('Form not found');
    }

    if (survey.userId !== user.id) {
      throw new ForbiddenException();
    }

    await this.db.delete(schema.surveys).where(eq(schema.surveys.id, id));
    return {
      message: 'Form deleted successfully',
    };
  }

  async getPublicForm(publicId: string, req: Request) {
    const survey = await this.db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.publicId, publicId))
      .get();

    if (!survey) {
      throw new NotFoundException('Form not found or link is invalid.');
    }

    let browserId: string;
    let setCookie = false;
    let userId: number | null = null;

    const cookieValue = req.cookies['survey_client_id'] as string | undefined;

    if (cookieValue) {
      browserId = cookieValue;
    } else {
      browserId = randomUUID();
      setCookie = true;
    }

    const email = (req.user as { email?: string })?.email;

    if (email) {
      const user = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (user) {
        userId = user.id;
      }
    }

    if (survey.allowMultipleSubmissions !== true) {
      let alreadySubmitted = false;

      if (userId) {
        const response = await this.db
          .select()
          .from(schema.responses)
          .where(
            and(
              eq(schema.responses.surveyId, survey.id),
              eq(schema.responses.userId, userId),
            ),
          )
          .get();

        alreadySubmitted = !!response;
      }

      if (alreadySubmitted) {
        throw new ConflictException(
          'You have already submitted a response to this form.',
        );
      }
    }

    return {
      status: 200,
      browserId,
      setCookie,
      data: {
        id: survey.id,
        title: survey.title,
        formData: survey.formData
          ? (JSON.parse(survey.formData) as Record<string, unknown>)
          : null,
        allowMultipleSubmissions: survey.allowMultipleSubmissions,
        createdAt: survey.createdAt,
        hasReviewPage: survey.hasReviewPage,
        isPublished: survey.isPublished,
      },
    };
  }

  async generateAiForm(dto: FormAIDto, email: string) {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = await this.db
      .insert(schema.surveys)
      .values({
        title: dto.title ?? 'Generated Survey',
        userId: user.id,
        publicId: randomUUID(),
      })
      .returning();

    const surveyId = survey[0].id;

    const userTopic = dto.promt;

    const prompt = `
You are an API that outputs strict JSON.
Analyze the request: '${userTopic}'.

ALLOWED QUESTION TYPES:
multiple_choice, long_text, short_text, email, heading, paragraph,
choice_matrix, checkbox, dropdown, switch, contact, phone_number, file_uploader

PAGINATION RULES:
1. DEFAULT to a SINGLE PAGE
2. ONLY create multiple pages if user explicitly asks
3. Simple forms stay ONE page

REQUIRED JSON STRUCTURE:
{
"title": "(Generate a creative title)",
"pages": [
  {
    "id": "(uuid)",
    "questions": [
      {
        "id": "(uuid)",
        "type": "(allowed_type)",
        "order": 1,
        "question": "(Question text)",
        "options": ["Opt 1","Opt 2"],
        "required": true
      }
    ]
  }
]
}

CONTENT RULES:
- Return raw JSON only
- Unique UUID for every id
- Options only for choice questions
- Include heading explaining survey
- Minimum 10 questions
`;

    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let aiResponse = response.text ?? '';

    aiResponse = aiResponse.replace('```json', '').replace('```', '').trim();

    try {
      const parsed = JSON.parse(aiResponse) as AiFormResult;

      const title = parsed.title ?? dto.title ?? 'Generated Survey';
      const formData = parsed.pages ?? parsed;

      await this.db
        .update(schema.surveys)
        .set({
          title,
          formData: JSON.stringify(formData),
        })
        .where(eq(schema.surveys.id, surveyId));

      return {
        message: 'Form generated successfully',
        surveyId,
        newTitle: title,
      };
    } catch {
      throw new BadRequestException({
        message: 'AI generation failed to produce valid JSON',
        raw: aiResponse,
      });
    }
  }
}
