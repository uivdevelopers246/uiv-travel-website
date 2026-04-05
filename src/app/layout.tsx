import type { Metadata } from "next";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Footer } from "@/components/layout/footer";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "UIV Travel",
  description: "Your travel companion for unforgettable adventures",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfairDisplay.variable} ${sourceSans.variable} antialiased font-sans`}
        style={{ fontFamily: 'var(--font-source-sans)' }}
      >
        {children}
        <Footer />
      </body>
    </html>
  );
}
