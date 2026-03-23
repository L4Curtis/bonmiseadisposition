import { Module } from '@nestjs/common';
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
        // SVG intentionally excluded: SVG files can contain embedded JavaScript (XSS risk)
        const allowedExt = /\.(jpg|jpeg|png|gif|webp)$/i;
        const allowedMime = /^image\/(jpeg|png|gif|webp)$/;
        if (allowedExt.test(file.originalname) && allowedMime.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Type de fichier non autorisé. Formats acceptés : JPG, PNG, GIF, WebP'), false);
        }
      },
    }),
  ],
  controllers: [FilialesController],
  providers: [FilialesService],
  exports: [FilialesService],
})
export class FilialesModule {}
