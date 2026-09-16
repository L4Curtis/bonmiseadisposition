import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FilialesController } from './filiales.controller';
import { FilialesService } from './filiales.service';

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: join(process.cwd(), 'data', 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        // JPEG/PNG uniquement : ce sont les deux seuls formats que PDFKit sait
        // dessiner (doc.image). GIF/WebP étaient acceptés à l'upload mais
        // rendaient le logo/cachet silencieusement absent du PDF. SVG reste
        // exclu (peut embarquer du JavaScript — risque XSS).
        const allowedExt = /\.(jpg|jpeg|png)$/i;
        const allowedMime = /^image\/(jpeg|png)$/;
        if (allowedExt.test(file.originalname) && allowedMime.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Format non supporté : JPEG ou PNG uniquement'), false);
        }
      },
    }),
  ],
  controllers: [FilialesController],
  providers: [FilialesService],
  exports: [FilialesService],
})
export class FilialesModule {}
