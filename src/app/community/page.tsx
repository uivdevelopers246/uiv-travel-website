import { Header } from "@/components/layout/header";
import Link from "next/link";

export default function CommunityPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-[#E8F1FA] via-[#C5E0F5] to-[#193059] flex items-center justify-center pt-20">
        <div className="text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-[#193059] mb-4" style={{ fontFamily: 'var(--font-playfair)' }}>
            Our Community
          </h1>
          <p className="text-xl text-[#193059]/80 mb-2">
            Coming Soon
          </p>
          <p className="text-lg text-[#193059]/60 mb-8 max-w-md mx-auto">
            Connect with fellow travelers, share experiences, and discover insider tips from our vibrant community of Barbados enthusiasts.
          </p>
          <Link 
            href="/"
            className="inline-block px-8 py-3 bg-gradient-to-r from-[#407FC2] to-[#193059] hover:from-[#193059] hover:to-[#407FC2] text-white rounded-full text-lg font-medium transition-all duration-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    </>
  );
}
