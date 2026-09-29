import { Head, Html, Main, NextScript } from "next/document";

/**
 * Icons live here (not in a page) so every route gets them from the first HTML
 * response. Assets come from `npm run images:build`; the `<Html lang="en">` below
 * is only the pre-hydration default — `LocaleContext` rewrites both `lang` and
 * `dir` on the client as soon as a locale other than English is chosen.
 */
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#000000" />
        <meta name="color-scheme" content="dark" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
