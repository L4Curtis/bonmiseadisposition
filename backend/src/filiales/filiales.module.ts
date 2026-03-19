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
        destination: join(process.cwd(), '..', 'data', 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|svg|webp)$/i;
        cb(null, allowed.test(file.originalname));
      },
    }),
  ],
  controllers: [FilialesController],
  providers: [FilialesService],
  exports: [FilialesService],
})
export class FilialesModule {}
