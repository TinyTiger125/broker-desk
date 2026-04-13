import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Sans_KR, Noto_Sans_SC, Plus_Jakarta_Sans } from "next/font/google";
import { AppNav } from "@/components/app-nav";
import { ScrollMemory } from "@/components/scroll-memory";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const notoJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  weight: ["400", "500", "700"],
  preload: false,
});

const notoSc = Noto_Sans_SC({
  variable: "--font-noto-sc",
  weight: ["400", "500", "700"],
  preload: false,
});

const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "700"],
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t(locale, "app.title"),
    description: t(locale, "app.description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${jakarta.variable} ${notoJp.variable} ${notoSc.variable} ${notoKr.variable} antialiased`}>
        <ScrollMemory />
        <AppNav />
        <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:pl-[18rem] lg:pr-8 lg:pt-24">{children}</main>
      </body>
    </html>
  );
}
