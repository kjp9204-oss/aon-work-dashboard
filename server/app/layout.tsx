import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AON 오늘의 센터",
  description: "에이온 운동센터의 업무와 일정을 함께 관리하는 공간입니다.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
