import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "오늘도 — 네가 해낸 하루를 기억할게",
  description: "하지 못한 것보다 해낸 것을 먼저 기억해주는 데스크톱 목표 메이트.",
  openGraph: {
    title: "오늘도 꽤 잘했어.",
    description: "네가 해낸 하루를 내가 기억할게.",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "오늘도 목표 메이트" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "오늘도 꽤 잘했어.",
    description: "네가 해낸 하루를 내가 기억할게.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
