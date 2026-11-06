import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Lava Jato Capuã", template: "%s | Lava Jato Capuã" },
  description: "Lavagem automotiva em Barra dos Coqueiros, SE. Agende pelo celular.",
  applicationName: "Lava Jato Capuã",
  appleWebApp: { capable: true, title: "LJC", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: { title: "Lava Jato Capuã", description: "Agende sua lavagem pelo celular.", images: ["/icons/icon-512.png"], locale: "pt_BR", type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#081B33" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
