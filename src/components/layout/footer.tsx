"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#193059] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo */}
          <div className="flex items-center">
            <img 
              src="/images/logos/LocalPinLongLogoCutOut.png" 
              alt="LocalPin Logo" 
              className="h-12 w-auto brightness-0 invert"
            />
          </div>

          {/* Contact Link */}
          <div className="flex flex-col items-center md:items-end gap-4">
            <Link 
              href="/contact" 
              className="text-lg font-medium hover:text-[#FBCA1A] transition-colors"
            >
              Contact Us
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
