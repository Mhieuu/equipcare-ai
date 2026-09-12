import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaModule — global provider của PrismaService.
 *
 * `@Global` để mọi module trong app đều inject được PrismaService mà không phải
 * import lại. M1 chỉ có 1 PrismaClient instance.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
