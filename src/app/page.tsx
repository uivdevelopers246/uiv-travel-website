import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-4">UIV – Bootstrap</h1>
      <p className="text-gray-500">
        Next.js + Vercel + Supabase stack is live. Check <code>/api/health</code> for status.
      </p>
    </main>
  );
}
