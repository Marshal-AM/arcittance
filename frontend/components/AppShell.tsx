"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "@/components/NavBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F4F0] text-[#111] font-sans antialiased">
      <NavBar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 md:px-12 lg:px-20 py-10 md:py-14">
        {children}
      </main>
      <footer className="border-t border-black/[0.06] py-8 px-6 md:px-12 lg:px-20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-pixel text-xs tracking-[0.25em] text-black/40">ARCITTANCE</span>
          <span className="text-xs text-black/25 tracking-wide">
            Arc Testnet · Chain ID 5042002
          </span>
        </div>
      </footer>
    </div>
  );
}
