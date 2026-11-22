import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Radar de Mercado",
  description: "Bolsa e Polymarket em tempo real, com sinais explicados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
            <footer className="border-t border-line px-4 py-3 text-xs text-muted md:px-6">
              Sinais baseados em critérios técnicos. Não é recomendação de investimento.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
