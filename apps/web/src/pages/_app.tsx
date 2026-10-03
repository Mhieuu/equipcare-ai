// Legacy Pages Router app shell. Required for Next.js 14 to satisfy its
// dual-router build (App Router + Pages Router for fallback `/404`, `/500`).
// Without this, `next build` fails because it auto-generates a default
// `_app` that imports `<Html>` outside of a `_document` context.

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
