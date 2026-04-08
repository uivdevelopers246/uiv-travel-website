"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRoleFlags, getUserRole, type UserRole } from "@/lib/auth/roles";
import { SettingsFab } from "@/components/admin/SettingsFab";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [role, setRole] = useState<UserRole>("guest");
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const loadRole = async () => {
      const nextRole = await getUserRole(supabase);
      if (active) {
        setRole(nextRole);
      }
    };

    void loadRole();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadRole();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const flags = getRoleFlags(role);
  const tripPath = role === "vendor" || role === "admin" ? "/my-listings" : "/my-trip";
  const tripLabel = role === "vendor" || role === "admin" ? "My Listings" : "My Trip";
  const accountPath = flags.canAccessAccount ? "/account" : "/auth/login";
  const accountLabel = flags.canAccessAccount ? "Account" : "Sign In";
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const primaryNavLinks = [
    {
      href: "/",
      label: "HOME",
      isActive: pathname === "/",
    },
    {
      href: "/vacation-planning",
      label: "VACATION PLANNING",
      isActive: pathname === "/vacation-planning" || pathname === "/accommodations",
    },
    {
      href: "/community",
      label: "OUR COMMUNITY",
      isActive: pathname === "/community",
    },
  ];

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 backdrop-blur-sm transition-colors duration-300 ${
          scrolled ? "bg-white/80" : "bg-white"
        }`}
      >
        <nav className="hidden px-8 py-6 min-[1250px]:block">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              {primaryNavLinks.slice(0, 2).map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 ${
                    link.isActive
                      ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8"
                      : ""
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <Link href="/" className="absolute left-1/2 -translate-x-1/2">
              <img
                src="/images/logos/LocalPinLongLogoCutOut.png"
                alt="LocalPin Logo"
                className="h-16 w-auto"
              />
            </Link>

            <div className="flex items-center gap-6">
              <Link
                href={primaryNavLinks[2].href}
                className={`text-sm font-medium transition-colors hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-8 ${
                  primaryNavLinks[2].isActive
                    ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-8"
                    : ""
                }`}
              >
                {primaryNavLinks[2].label}
              </Link>
              <Link
                href={tripPath}
                className="flex items-center gap-2 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
              >
                <img
                  src="/images/icons/AccountIcon.png"
                  alt="Account"
                  className="h-4 w-4"
                />
                <span>{tripLabel}</span>
              </Link>
              <Link
                href={accountPath}
                className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
              >
                {accountLabel}
              </Link>
              <Link
                href="/bookings"
                className="bg-gradient-to-r from-[#407FC2] to-[#193059] px-6 py-2 text-sm font-medium text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
              >
                Book Now
              </Link>
            </div>
          </div>
        </nav>

        <nav className="px-4 py-6 min-[1250px]:hidden">
          <div className="relative flex items-center justify-center">
            <Link href="/" className="absolute left-1/2 -translate-x-1/2">
              <img
                src="/images/logos/LocalPinShortLogoCutOut.png"
                alt="LocalPin Logo"
                className="h-16 w-auto"
              />
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(open => !open)}
              className="ml-auto p-2 text-gray-900 transition-colors hover:text-[#FBCA1A]"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
            >
              {mobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </header>

      {role === "admin" && pathname === "/" && <SettingsFab />}

      <div
        id="mobile-navigation-drawer"
        className={`fixed bottom-0 left-0 right-0 top-[60px] z-40 transform bg-gradient-to-br from-[#E8F1FA] via-[#C5E0F5] to-[#193059] transition-transform duration-300 ease-in-out min-[1250px]:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col px-6 py-6">
          {primaryNavLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMobileMenu}
              className={`mx-3 border-b-2 border-white/60 py-4 text-base font-medium transition-colors ${
                link.isActive
                  ? "text-[#407FC2] underline decoration-[#407FC2] underline-offset-4"
                  : "hover:text-[#407FC2] hover:underline hover:decoration-[#407FC2] hover:underline-offset-4"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="mx-3 space-y-3 border-t-2 border-white/60 pt-4">
            <Link
              href={tripPath}
              onClick={closeMobileMenu}
              className="flex items-center gap-2 py-2 text-base font-medium transition-colors hover:text-[#407FC2]"
            >
              <img
                src="/images/icons/AccountIcon.png"
                alt="Account"
                className="h-5 w-5"
              />
              <span>{tripLabel}</span>
            </Link>
            <Link
              href={accountPath}
              onClick={closeMobileMenu}
              className="block border border-gray-300 px-4 py-3 text-center text-base font-medium text-gray-900 transition-colors hover:bg-gray-100"
            >
              {accountLabel}
            </Link>
            <Link
              href="/bookings"
              onClick={closeMobileMenu}
              className="block bg-gradient-to-r from-[#407FC2] to-[#193059] px-4 py-3 text-center text-base font-medium text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2]"
            >
              Book Now
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
