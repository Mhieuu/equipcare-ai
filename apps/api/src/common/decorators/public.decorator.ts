import { SetMetadata } from '@nestjs/common';

/**
 * Marker cho endpoint public — không cần JWT.
 * JwtAuthGuard kiểm tra metadata `isPublic` để skip.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
