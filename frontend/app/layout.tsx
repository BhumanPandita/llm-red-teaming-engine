import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Red-Team Console",
  description: "Adversarial LLM red-teaming engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <header className="border-b border-border bg-panel">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-gradient-to-br from-accent to-critical flex items-center justify-center font-mono text-sm font-bold text-white">
                RT
              </div>
              <div>
                <div className="font-semibold tracking-tight">RAG Red-Team Console</div>
                <div className="text-xs text-muted font-mono">Adversarial LLM vulnerability engine</div>
              </div>
            </a>
            <div className="text-xs text-muted font-mono">POC v0.1</div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
