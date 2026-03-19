import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { SignatureService } from './signature.service';
import { NotificationService } from '../notification/notification.service';
import { SignDto } from './dto/sign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('signature')
export class SignatureController {
  constructor(
    private readonly signatureService: SignatureService,
    private readonly notificationService: NotificationService,
  ) {}

  /** Public — get bon info from token (no auth required) */
  @Get(':token')
  async getBonInfo(@Param('token') token: string) {
    return this.signatureService.getBonInfoByToken(token);
  }

  /**
   * Protected — must be authenticated via SSO
   * Rate-limited : 10 req / 60s par IP pour prévenir le bruteforce de tokens
   */
  @Post(':token/sign')
  @UseGuards(ThrottlerGuard, JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async sign(
    @Param('token') token: string,
    @Body() dto: SignDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const result = await this.signatureService.sign(
      token,
      dto.signatureDataUrl,
      dto.mentionLuApprouve,
      user.email,
      ip,
      userAgent,
    );

    // Send confirmation email (fire and forget)
    const type = result.signature.type as 'mise_disposition' | 'restitution';
    this.notificationService
      .sendSignatureConfirmation(result.bon, type)
      .catch(() => {/* ignore email errors */});

    return {
      ok: true,
      bon: result.bon,
      signature: {
        id: result.signature.id,
        type: result.signature.type,
        signedAt: result.signature.signedAt,
        signerEmail: result.signature.signerEmail,
        mentionLuApprouve: result.signature.mentionLuApprouve,
        isInPerson: result.signature.isInPerson,
      },
    };
  }
}
