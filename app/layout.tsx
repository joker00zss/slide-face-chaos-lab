import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0];
  const protocol = forwardedProtocol || (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "滑脸研究所 · AI 链式变脸实验";
  const description = "一张脸可直接进化，两张脸可滑动夺舍；只调用一次 AI 生成六宫格，其余对齐与 43 张过渡帧均在本地完成。";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 768, height: 431, alt: "滑脸研究所" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
