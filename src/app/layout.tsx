import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { AppNav } from "@/components/app-nav";
import { ScrollMemory } from "@/components/scroll-memory";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import "antd/dist/reset.css";
import "./globals.css";

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
  const body = (
    <>
      <ScrollMemory />
      <AppNav />
      <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:pl-[18rem] lg:pr-8 lg:pt-24">{children}</main>
    </>
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        {isClerkAuthEnabled() ? <ClerkProvider>{body}</ClerkProvider> : body}
      </body>
    </html>
  );
}
