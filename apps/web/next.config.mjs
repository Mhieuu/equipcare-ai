/** @type {import('next').NextConfig} */

/**
 * ⚠️ KHÔNG khai báo `env.NEXT_PUBLIC_API_URL` ở đây.
 *
 * Next.js **inline** mọi biến `NEXT_PUBLIC_*` vào JS bundle lúc `next build`.
 * Nếu khai báo trong `env`, giá trị bị đóng băng theo image → đổi URL API
 * phải build lại image mới có hiệu lực.
 *
 * Cách đúng cho môi trường container: route handler `GET /api/runtime-config`
 * đọc `process.env.NEXT_PUBLIC_API_URL` lúc **runtime** và trả về cho client;
 * `src/lib/api.ts` đọc endpoint đó một lần rồi cache.
 *
 * Vì biến được đọc bằng `process.env` trong code **server-side** (route handler)
 * nên Next.js vẫn lấy được giá trị runtime — chỉ phần gửi tới browser mới
 * cần đi qua runtime-config.
 */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
