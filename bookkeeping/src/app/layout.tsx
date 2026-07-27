import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Boekhouding — eenmanszaak bookkeeping",
    template: "%s · Boekhouding",
  },
  description:
    "Personal bookkeeping and document organization for a Dutch sole proprietor. Assists with bookkeeping; does not replace professional tax advice.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
