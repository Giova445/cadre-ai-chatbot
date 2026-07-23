import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadre AI — Support Assistant",
  description:
    "Ask about Cadre AI's services, AI Maturity Index, and how to get started. Answers are grounded in Cadre's knowledge base.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
