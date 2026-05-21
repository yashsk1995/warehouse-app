import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { User, UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(username: string, password: string, role: UserRole = 'USER'): Promise<User> {
    const rounds = Number(this.cfg.get<number>('BCRYPT_ROUNDS') ?? 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    return this.prisma.user.create({ data: { username, passwordHash, role } });
  }
}
