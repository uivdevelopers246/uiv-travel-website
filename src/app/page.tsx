import { Header } from "@/components/layout/header";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img 
            src="/images/hero/BeachSunset.jpg" 
            alt="Beach Sunset" 
            className="w-full h-full object-cover object-top brightness-110 contrast-110"
          />
        </div>
        {/* Background overlay for better text contrast */}
        <div className="absolute inset-0 bg-black/10"></div>
        
        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-19">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-6" style={{ fontFamily: 'var(--font-playfair)' }}>
            <span className="text-[#FBCA1A]">Low Rates,</span>
            <br />
            <span className="text-white font-bold">High Tide</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-source-sans)' }}>
            Combining local insights and AI innovation, UnitedIV redefines how
            travelers plan and experience Barbados
          </p>
          
          <Link 
            href="/locallens"
            className="inline-block px-8 py-4 border-2 border-white/40 hover:border-white/60 text-white rounded-full text-lg font-medium transition-all hover:bg-white/10 backdrop-blur-sm"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Try LocalLens.ai
          </Link>
        </div>
      </section>

      {/* Additional Content Sections To Be Added*/}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Discover Barbados
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              More content coming soon...
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
