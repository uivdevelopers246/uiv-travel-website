"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#193059] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo */}
          <Link href="/" aria-label="LocalPin home" className="flex items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <img 
              src="/images/logos/LocalPinLongLogoCutOut.png" 
              alt="LocalPin Logo" 
              className="h-12 w-auto brightness-0 invert"
            />
          </Link>

          {/* Contact Link */}
          <div className="flex flex-col items-center md:items-end gap-4">
            <Link 
              href="/contact" 
              className="text-lg font-medium hover:text-[#FBCA1A] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Contact (coming soon)
            </Link>
            <p className="text-white/60 text-sm">
              © {new Date().getFullYear()} LocalPin. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
