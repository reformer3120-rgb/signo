import type { Metadata, Viewport } from "next";
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

// 폰에서도 웹과 동일한 전체 레이아웃을 한 화면에 맞춰 표시 (컨테이너 폭 고정).
// head에 <meta>를 직접 쓰면 Next 기본 viewport 태그가 뒤에 붙어 무시되므로 이 방식이어야 함.
export const viewport: Viewport = {
  width: 1152,
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
