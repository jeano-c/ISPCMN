import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express'; // Added 'type' to fix TS1272
import { AuthService } from './auth.service';
import { UserService } from '../users/users.service'; // Fixed path to 'users'
import {
  LoginDTO,
  GoogleLoginDTO,
  RegisterAccountDTO,
  ChangePasswordDTO,
  UpdateProfileDTO,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtUser } from './interfaces/jwt-user.interface';

@Controller('api/User')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  private setTokenCookie(res: Response, token: string) {
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  @Post('login')
  async login(
    @Body() dto: LoginDTO,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, userReply } = await this.authService.login(dto);
    this.setTokenCookie(res, token);
    return userReply;
  }

  @Post('login-google')
  async loginGoogle(
    @Body() dto: GoogleLoginDTO,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, userReply } = await this.authService.loginGoogle(dto);
    this.setTokenCookie(res, token);
    return userReply;
  }

  @Post('register')
  async register(@Body() dto: RegisterAccountDTO) {
    const userReply = await this.authService.register(dto);
    return { message: 'Account created successfully', user: userReply };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: Request) {
    const email = (req.user as JwtUser)?.email;
    if (!email) throw new UnauthorizedException('Invalid token claims');

    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');

    return this.authService.mapToReplyDto(user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });
    return { message: 'Logged out successfully' };
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() dto: ChangePasswordDTO, @Req() req: Request) {
    const email = (req.user as JwtUser)?.email;
    if (!email) throw new UnauthorizedException();

    await this.authService.changePassword(email, dto);
    return { message: 'Password changed successfully' };
  }

  @Put('update-profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Body() dto: UpdateProfileDTO, @Req() req: Request) {
    const email = (req.user as JwtUser)?.email;
    if (!email) throw new UnauthorizedException();

    const updatedUser = await this.authService.updateProfile(email, dto);
    return { message: 'Profile updated', user: updatedUser };
  }

  @Delete('delete-account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = (req.user as JwtUser)?.email;
    if (!email) throw new UnauthorizedException();

    await this.authService.deleteAccount(email);
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });
    return { message: 'Account deleted successfully' };
  }
}
