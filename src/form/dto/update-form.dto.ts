export class UpdateFormDto {
  userId: number;
  title?: string;
  formData?: Record<string, unknown>;
  allowMultipleSubmissions?: boolean;
  isPublished?: boolean;
  hasReviewPage?: boolean;
}
