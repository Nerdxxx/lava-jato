import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Lava Jato Capuã | Lavagem Automotiva em Barra dos Coqueiros", template: "%s | Lava Jato Capuã" },
  description: "Agende sua lavagem externa ou completa no Lava Jato Capuã, em Barra dos Coqueiros, Sergipe.",
  keywords: ["lava jato", "lavagem automotiva", "Barra dos Coqueiros", "Capuã", "Sergipe", "lavagem de moto", "lavagem completa"],
  applicationName: "Lava Jato Capuã",
  appleWebApp: { capable: true, title: "LJC", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: "Lava Jato Capuã | Lavagem Automotiva em Barra dos Coqueiros",
    description: "Agende sua lavagem externa ou completa no Lava Jato Capuã, em Barra dos Coqueiros, Sergipe.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Lava Jato Capuã" }],
    locale: "pt_BR",
    type: "website",
    siteName: "Lava Jato Capuã",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#081B33" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} data-scroll-behavior="smooth">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
