"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-sm transition-colors duration-300 ${
        scrolled ? "bg-white/80" : "bg-white"
      }`}>
        {/* Desktop Navigation (1250px and up) */}
      <nav className="hidden min-[1250px]:block px-8 py-6">
        <div className="flex items-center justify-between">
          {/* Left Navigation */}
          <div className="flex items-center gap-8">
            <Link href="/" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              HOME
            </Link>
            <Link href="/accommodations" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/accommodations" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              ACCOMMODATIONS
            </Link>
            <Link href="/activities" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/activities" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              ACTIVITIES
            </Link>
            <Link href="/vacation-planning" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/vacation-planning" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              VACATION PLANNING
            </Link>
          </div>

          {/* Center Logo */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <img 
              src="/images/logos/LocalPinLongLogoCutOut.png" 
              alt="LocalPin Logo" 
              className="h-16 w-auto"
            />
          </Link>

          {/* Right Navigation */}
          <div className="flex items-center gap-6">
            <Link href="/community" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/community" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              OUR COMMUNITY
            </Link>
            <Link href="/contact" className={`text-sm font-medium hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 transition-colors ${
              pathname === "/contact" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8" : ""
            }`}>
              CONTACT
            </Link>
            <Link 
              href="/my-trip" 
              className="border border-gray-300 hover:bg-gray-100 text-gray-900 px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <img src="/images/icons/AccountIcon.png" alt="Account" className="w-4 h-4" />
              <span>My Trip</span>
            </Link>
            <Link 
              href="/auth/login" 
              className="border border-gray-300 hover:bg-gray-100 text-gray-900 px-4 py-2 text-sm font-medium transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/bookings" 
              className="bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white px-6 py-2 text-sm font-medium transition-all duration-300"
            >
              Book Now
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile/Tablet Navigation (0-1249px) */}
      <nav className="min-[1250px]:hidden px-4 py-6">
        <div className="flex items-center justify-center relative">
          {/* Logo - Centered */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <img 
              src="/images/logos/LocalPinShortLogoCutOut.png" 
              alt="LocalPin Logo" 
              className="h-16 w-auto"
            />
          </Link>

          {/* Hamburger Menu Button - Positioned on right */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-900 hover:text-[#FBCA1A] transition-colors ml-auto"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>
    </header>

      {/* Mobile Menu Drawer - Outside header for proper z-index stacking */}
      <div className={`fixed left-0 right-0 top-[60px] bottom-0 z-40 transform transition-transform duration-300 ease-in-out bg-gradient-to-br from-[#E8F1FA] via-[#C5E0F5] to-[#193059] min-[1250px]:hidden ${
        mobileMenuOpen ? "translate-x-0" : "translate-x-full"
      }`}>
          <div className="flex flex-col px-6 py-6">
            <Link href="/" className={`text-base font-medium py-4 transition-colors border-b-2 border-white/60 mx-3 ${
              pathname === "/" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              HOME
            </Link>
            <Link href="/accommodations" className={`text-base font-medium py-4 transition-colors border-b-2 border-white/60 mx-3 ${
              pathname === "/accommodations" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              ACCOMMODATIONS
            </Link>
            <Link href="/activities" className={`text-base font-medium py-4 transition-colors border-b-2 border-white/60 mx-3 ${
              pathname === "/activities" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              ACTIVITIES
            </Link>
            <Link href="/vacation-planning" className={`text-base font-medium py-4 transition-colors border-b-2 border-white/60 mx-3 ${
              pathname === "/vacation-planning" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              VACATION PLANNING
            </Link>
            <Link href="/community" className={`text-base font-medium py-4 transition-colors border-b-2 border-white/60 mx-3 ${
              pathname === "/community" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              OUR COMMUNITY
            </Link>
            <Link href="/contact" className={`text-base font-medium py-4 transition-colors mx-3 ${
              pathname === "/contact" ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4" : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
            }`}>
              CONTACT
            </Link>
            
            <div className="pt-4 border-t-2 border-white/60 mx-3 space-y-3">
              <Link 
                href="/my-trip" 
                className="flex items-center gap-2 py-2 text-base font-medium hover:text-[#407FC2] transition-colors"
              >
                <img src="/images/icons/AccountIcon.png" alt="Account" className="w-5 h-5" />
                <span>My Trip</span>
              </Link>
              <Link 
                href="/auth/login" 
                className="block text-center border border-gray-300 hover:bg-gray-100 text-gray-900 px-4 py-3 text-base font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link 
                href="/bookings" 
                className="block text-center bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white px-4 py-3 text-base font-medium transition-all duration-300"
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
    </>
  );
}
