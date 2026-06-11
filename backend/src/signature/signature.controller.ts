import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SignatureService } from './signature.service';
import { NotificationService } from '../notification/notification.service';
import { SignDto } from './dto/sign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@Controller('signature')
export class SignatureController {
  constructor(
    private readonly signatureService: SignatureService,
    private readonly notificationService: NotificationService,
  ) {}

  /** Authentifié — consultation du bon via token (connexion SSO requise).
   *  Le détail du bon n'est renvoyé qu'au destinataire du lien (ou en mode
   *  présentiel) : un autre compte authentifié reçoit un statut minimal. */
  @Get(':token')
  @UseGuards(JwtAuthGuard)
  async getBonInfo(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.signatureService.getBonInfoByToken(token, user?.email);
  }

  /** Aperçu PDF du document exact qui sera signé (avant signature). */
  @Get(':token/preview')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async preview(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { pdf, filename } = await this.signatureService.getPreviewPdfByToken(token, user?.email);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
  }

  /**
   * Protected — must be authenticated via SSO
   * Rate-limited : 10 req / 60s par IP pour prévenir le bruteforce de tokens
   */
  @Post(':token/sign')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async sign(
    @Param('token') token: string,
    @Body() dto: SignDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    // Use X-Real-IP (set by nginx to $remote_addr) — cannot be spoofed by clients
    const ip =
      (req.headers['x-real-ip'] as string)?.trim() ??
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

    // Send confirmation email (fire and forget). it_cachet never reaches this
    // endpoint; the three token-based types each get their correct label.
    const type = result.signature.type as 'mise_disposition' | 'restitution' | 'pv_cloture';
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
