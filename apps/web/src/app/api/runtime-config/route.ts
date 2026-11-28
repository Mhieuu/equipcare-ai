import { NextResponse } from 'next/server';

/**
 * Runtime config — trả cấu hình cho trình duyệt.
 *
 * Vì sao cần: biến `NEXT_PUBLIC_*` được Next.js **inline vào JS bundle lúc
 * build** (webpack DefinePlugin). Nghĩa là nếu build image Docker với
 * `NEXT_PUBLIC_API_URL` chưa đúng, mọi request từ trình duyệt sẽ đi tới
 * URL sai — và sửa lại phải build lại image.
 *
 * Route handler này chạy ở **runtime**, đọc `process.env` của container đang
 * chạy, nên đổi URL API chỉ cần restart container là xong, không cần rebuild.
 *
 * ⚠️ Vì sao đọc `process.env.API_URL` (không có prefix `NEXT_PUBLIC_`):
 *   Next.js chỉ inline biến có prefix `NEXT_PUBLIC_`. Biến server-side
 *   không có prefix được đọc nguyên runtime → chắc chắn lấy đúng giá trị
 *   của container đang chạy.
 *
 *   `NEXT_PUBLIC_API_URL` vẫn được hỗ trợ làm fallback để tương thích
 *   với cấu hình cũ.
 *
 * Chỉ trả về biến công khai — không rò rỉ secret.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  return NextResponse.json(
    { apiUrl },
    {
      headers: {
        // Không cache để đổi env có hiệu lực ngay sau restart.
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
