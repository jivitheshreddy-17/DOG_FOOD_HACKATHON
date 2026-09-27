import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "DOGFOOD 2026 — Hackathon Platform",
  description: "Self-hostable, air-gapped hackathon submission and judging platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
