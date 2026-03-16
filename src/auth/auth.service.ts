import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { UserService } from '../users/users.service';
import { User } from '../database/schema';
import {
  LoginDTO,
  GoogleLoginDTO,
  RegisterAccountDTO,
  ChangePasswordDTO,
  UpdateProfileDTO,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  public mapToReplyDto(user: User) {
    return {
      id: user.id, // Turso Auto-increment ID is a number
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };
  }

  private generateJwtToken(email: string) {
    return this.jwtService.sign({ sub: email, email });
  }

  async login(dto: LoginDTO) {
    const user = await this.userService.findByEmail(dto.email);

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(dto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      token: this.generateJwtToken(user.email),
      userReply: this.mapToReplyDto(user),
    };
  }

  async loginGoogle(dto: GoogleLoginDTO) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) throw new Error();

      let user = await this.userService.findByEmail(payload.email);

      if (!user) {
        user = await this.userService.create({
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          password: null,
          avatar: payload.picture,
        });
      }

      return {
        token: this.generateJwtToken(user.email),
        userReply: this.mapToReplyDto(user),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  async register(dto: RegisterAccountDTO) {
    const existingUser = await this.userService.findByEmail(dto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const newUser = await this.userService.create({
      email: dto.email,
      name: dto.name,
      avatar: dto.avatar,
      password: hashedPassword,
    });

    return this.mapToReplyDto(newUser);
  }

  async changePassword(email: string, dto: ChangePasswordDTO) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');

    if (!user.password) {
      throw new BadRequestException(
        'You signed in with Google. You cannot change password here.',
      );
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new BadRequestException('Incorrect current password');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userService.update(user);
  }

  async updateProfile(email: string, dto: UpdateProfileDTO) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');

    if (dto.name) user.name = dto.name;
    if (dto.avatar) user.avatar = dto.avatar;

    await this.userService.update(user);
    return this.mapToReplyDto(user);
  }

  async deleteAccount(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    await this.userService.remove(user);
  }
}
