import Head from "next/head";

import Header from "@/components/Header";
import SnapToggle from "@/components/SnapToggle";
import { useLocale } from "@/context/LocaleContext";
import Hero from "@/sections/Hero";
import Roadmap from "@/sections/Roadmap";
import Token from "@/sections/Token";

export default function Home() {
  const { content, dir } = useLocale();

  return (
    <>
      <Head>
        <title>{content.meta.documentTitle}</title>
        <meta name="description" content={content.hero.subtitle} />
      </Head>

      {/* The header stays LTR: only the content below mirrors in RTL languages. */}
      <Header />
      <main dir={dir} className="bg-black text-white">
        <Hero />
        <Token />
        <Roadmap />
      </main>
      <SnapToggle />
    </>
  );
}
