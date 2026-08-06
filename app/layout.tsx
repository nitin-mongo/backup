import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MongoDB Atlas Backup Cost Analysis",
  description: "18 months (Jan 2025 – Jul 2026) · 38 clusters · All backup-related charges incl. AWS S3 estimates",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ background: '#0c1117' }}>
      <body style={{ background: '#0c1117', minHeight: '100vh' }}>{children}</body>
    </html>
  );
}
