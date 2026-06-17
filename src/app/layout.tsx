import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import I18nProvider from '@/components/layout/I18nProvider';
import StoreHydration from '@/components/StoreHydration';
import { ToastContainer } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: "学科智引",
  description: "基于 RAG 的垂类大模型助学助教平台。",
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
        <ToastContainer />
      </body>
    </html>
  );
}
