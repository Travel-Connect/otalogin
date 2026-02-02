import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OTAログイン支援ツール',
  description: 'OTA自動ログイン支援ポータル',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
