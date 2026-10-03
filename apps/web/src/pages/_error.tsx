// Custom Pages Router error page. Required to satisfy Next 14's dual-router
// build: even when only using the App Router, Next still pre-renders the
// legacy `/_error` page (for 404/500) and injects a default implementation
// that imports `<Html>` from `next/document`. That default collides with the
// App Router root layout, causing the build to fail.
//
// Providing this explicit `_error.tsx` overrides the default, which prevents
// Next.js from generating the broken fallback.

import type { NextPage } from 'next';

type Props = { statusCode?: number };

const Error: NextPage<Props> = ({ statusCode }) => {
  return (
    <p style={{ padding: 24, fontFamily: 'system-ui' }}>
      {statusCode ? `Lỗi ${statusCode}` : 'Đã xảy ra lỗi'}
    </p>
  );
};

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode ?? 500 : 404;
  return { statusCode };
};

export default Error;
