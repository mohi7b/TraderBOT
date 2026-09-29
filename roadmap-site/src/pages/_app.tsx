import type { AppProps } from "next/app";

import { LocaleProvider } from "@/context/LocaleContext";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <LocaleProvider>
      <Component {...pageProps} />
    </LocaleProvider>
  );
}
