import { IsArray } from 'class-validator';
export class CreateResponseDto {
  @IsArray({ message: 'responseData must be an array of answers' })
  responseData: any[]; // Changed from IsObject to IsArray
}
