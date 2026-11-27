import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyntaxGraph | AST-Driven Hybrid GraphRAG",
  description: "AST Property Graph & Agentic Codebase Intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
