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

    // 1. IMPROVED PROMPT: Real examples, no literal placeholders
    const prompt = `
Analyze the request: '${userTopic}'.
Generate a comprehensive survey form.

ALLOWED QUESTION TYPES:
multiple_choice, long_text, short_text, email, heading, paragraph,
choice_matrix, checkbox, dropdown, switch, contact, phone_number, file_uploader

PAGINATION RULES:
1. DEFAULT to a SINGLE PAGE.
2. ONLY create multiple pages if the user explicitly asks.

REQUIRED JSON STRUCTURE (Output exactly this format with real sample data):
{
  "title": "A creative title for the survey",
  "pages": [
    {
      "id": "page_1",
      "questions": [
        {
          "id": "q_1",
          "type": "short_text",
          "order": 1,
          "question": "What is your primary goal?",
          "options": [],
          "required": true
        },
        {
          "id": "q_2",
          "type": "multiple_choice",
          "order": 2,
          "question": "Which of these applies to you?",
          "options": ["Option A", "Option B", "Option C"],
          "required": false
        }
      ]
    }
  ]
}

CONTENT RULES:
- Minimum 10 questions.
- Options array must have items ONLY for choice questions (multiple_choice, dropdown, checkbox, choice_matrix). Otherwise, it must be an empty array [].
- "required" must always be a boolean (true or false).
`;

    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
    });

    // 2. FORCE JSON MODE: This prevents the AI from wrapping the output in ```json ... ```
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const aiResponse = response.text ?? '{}';

    try {
      // Because we forced application/json, we can parse safely
      const parsed = JSON.parse(aiResponse) as AiFormResult;
      const title = parsed.title ?? dto.title ?? 'Generated Survey';

      // Handle the case where AI returns 'pages' array or directly returns the array
      let pages: any[] = Array.isArray(parsed.pages)
        ? parsed.pages
        : Array.isArray(parsed)
          ? parsed
          : [];

      // 3. BULLETPROOFING: Inject real UUIDs and enforce data types here!
      interface Question {
        id: string;
        type: string;
        order: number;
        question: string;
        required: boolean;
        options: string[];
        [key: string]: unknown;
      }

      interface Page {
        id: string;
        questions: Question[];
        [key: string]: unknown;
      }

      pages = pages.map((page: Page) => ({
        ...page,
        id: randomUUID(),
        questions: (page.questions || []).map((q: Question, index: number) => ({
          ...q,
          id: randomUUID(),
          order: index + 1,
          required: q.required === true,
          options: Array.isArray(q.options) ? q.options : [],
        })),
      })) as Page[];

      await this.db
        .update(schema.surveys)
        .set({
          title,
          formData: JSON.stringify(pages),
        })
        .where(eq(schema.surveys.id, surveyId));

      return {
        message: 'Form generated successfully',
        surveyId,
        newTitle: title,
      };
    } catch (error) {
      throw new BadRequestException({
        message: 'AI generation failed or produced invalid data',
        raw: aiResponse,
        error: error.message,
      });
    }
  }
}
