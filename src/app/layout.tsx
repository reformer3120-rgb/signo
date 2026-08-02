import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { SignoHeader } from "@/components/SignoHeader";
import { Nav } from "@/components/Nav";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIGNO · 실시간 AI 주식 시그널",
  description: "KRX 마켓 대시보드 — 수급·지수·프로그램매매·선물옵션·환율·국채금리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} ${grotesk.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* 초기 다크모드 플리커 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('signo-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-fg">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 flex flex-col gap-4">
          <SignoHeader />
          <Nav />
          {children}
          <footer className="py-4 text-center text-xs text-muted">
            SIGNO · KRX 마켓 대시보드 · 데이터: Yahoo · 네이버 · KIS
          </footer>
        </div>
      </body>
    </html>
  );
}
