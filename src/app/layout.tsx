import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Lava Jato Capuã", template: "%s | Lava Jato Capuã" },
  description: "Lavagem automotiva em Barra dos Coqueiros, SE. Agende pelo celular.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#081B33" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
