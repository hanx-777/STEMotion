import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import I18nProvider from '@/components/layout/I18nProvider';
import StoreHydration from '@/components/StoreHydration';

export const metadata: Metadata = {
  title: "STEMotion",
  description: "Animated and interactive K-12 STEM experiments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <StoreHydration />
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
