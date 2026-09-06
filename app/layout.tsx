import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '偏见试验场 BIAS ARENA — 相信你的第一直觉',
  description: '两份作品，一个选择。图像、文字与网页的匿名对决。',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
