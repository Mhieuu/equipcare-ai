// Legacy Pages Router document. App Router của dự án không sử dụng Pages
// Router, nhưng Next.js 14 vẫn tự sinh một `/_error` page để fallback cho các
// request không match App Router route. Trong quá trình prerender, Next.js
// import `<Html>` từ default `_document` (mà project này không có) dẫn đến
// lỗi `<Html> should not be imported outside of pages/_document`.
//
// Cung cấp file này để Next.js dùng nó thay vì tự sinh default, tránh
// prerender error cho `/404` và `/500`. Pages Router routes sẽ không được
// định nghĩa — chỉ có `_app` và `_document` để thỏa mãn Next.js's dual
// router build.

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="vi">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
