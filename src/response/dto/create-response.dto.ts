import { IsObject } from 'class-validator';
export class CreateResponseDto {
  @IsObject({ message: 'responseData must be a valid JSON object' })
  responseData?: Record<string, any>;
}
