import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { AuthTokensDto } from '@warehouse/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<AuthTokensDto> {
    const user = await this.users.findByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.username, user.role, user.createdAt);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const hash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // rotate
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(
      record.user.id,
      record.user.username,
      record.user.role,
      record.user.createdAt,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken
      .update({ where: { tokenHash: hash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  private async issueTokens(
    userId: string,
    username: string,
    role: string,
    createdAt: Date,
  ): Promise<AuthTokensDto> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, username, role },
      { expiresIn: this.cfg.get<string>('JWT_ACCESS_TTL') ?? '15m' },
    );
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTtl = this.cfg.get<string>('JWT_REFRESH_TTL') ?? '30d';
    const expiresAt = new Date(Date.now() + this.parseDurationMs(refreshTtl));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        username,
        role: role as any,
        createdAt: createdAt.toISOString(),
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDurationMs(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhd])$/);
    if (!m) return 30 * 24 * 60 * 60 * 1000;
    const n = Number(m[1]);
    const unit = m[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return n * multipliers[unit];
  }
}
