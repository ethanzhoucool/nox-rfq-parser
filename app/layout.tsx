import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RFQ Parser · Nox Metals",
  description: "Turn messy buyer RFQs and POs into validated Nox Metals API requests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
