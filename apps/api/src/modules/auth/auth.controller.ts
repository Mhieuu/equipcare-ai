import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { AuthTokenDto } from './dto/auth-token.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AppError } from '@equipcare/backend-core';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

const REFRESH_COOKIE = 'equipcare_rt';
const REFRESH_TTL_DAYS = 14;

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Auth controller — 4 endpoint theo Doc02 §7 / Doc05 §7.
 *
 * - POST /auth/login           → access token (body) + refresh token (HttpOnly cookie)
 * - POST /auth/refresh         → rotate (HttpOnly cookie → HttpOnly cookie mới)
 * - POST /auth/logout          → revoke session hiện tại
 * - POST /auth/change-password (auth) → đổi pass + revoke all sessions
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập — trả access token + set refresh cookie' })
  @ApiResponse({ status: 200, type: AuthTokenDto })
  @ApiResponse({ status: 401, description: 'Sai thông tin đăng nhập' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenDto> {
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const { token, refreshToken } = await this.auth.login(dto.loginName, dto.password, meta);
    this.setRefreshCookie(res, refreshToken);
    return token;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token (rotate refresh cookie)' })
  @ApiCookieAuth(REFRESH_COOKIE)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenDto> {
    const refreshToken = this.readRefreshCookie(req);
    if (!refreshToken) {
      throw AppError.unauthorized('Thiếu refresh token');
    }
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const { token, refreshToken: newRefresh } = await this.auth.refresh(refreshToken, meta);
    this.setRefreshCookie(res, newRefresh);
    return token;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất — revoke refresh session hiện tại' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = this.readRefreshCookie(req);
    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đổi mật khẩu (Doc02 §FR-AUTH-04) — revoke all sessions' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  // -------------------------------------------------------------------------
  private readRefreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOpts());
  }

  private cookieOpts() {
    return {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax' as const,
      path: '/auth',
      maxAge: REFRESH_TTL_DAYS * 24 * 3600 * 1000,
    };
  }
}
