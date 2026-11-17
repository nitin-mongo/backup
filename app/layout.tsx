import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MongoDB Atlas Backup Cost Analysis",
  description: "MongoDB Atlas backup costs across invoice months and clusters, including AWS S3 estimates.",
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
