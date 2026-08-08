"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnector } from "./WalletConnector";
import { useRemittanceWallet } from "./RemittanceWalletContext";

const NAV_LINKS = [
  { href: "/app",           label: "Dashboard"     },
  { href: "/payroll",       label: "Payroll"       },
  { href: "/escrow",        label: "Milestones"    },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/remit",         label: "Remit"         },
];

const NAV_STYLE = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  background: "rgba(245,244,240,0.75)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
} as const;

export function NavBar() {
  const pathname = usePathname();
  const isRemit  = pathname === "/remit";
  const { wallet } = useRemittanceWallet();

  return (
    <div className="sticky top-0 z-50 px-4 pt-4 pb-2 pointer-events-none">
      <div className="pointer-events-auto max-w-6xl mx-auto">
        <nav
          className="flex items-center justify-between gap-4 px-5 py-3 rounded-2xl border border-black/[0.06]"
          style={NAV_STYLE}
        >
          <Link href="/" className="font-pixel text-xs tracking-[0.25em] text-black/70 hover:text-black transition-colors shrink-0">
            ARCITTANCE
          </Link>

          <div className="hidden md:flex items-center gap-1 lg:gap-2 min-w-0">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href || (href !== "/app" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 rounded-xl text-[11px] tracking-wide transition-colors duration-200 ${
                    active
                      ? "bg-black/[0.06] text-black"
                      : "text-black/50 hover:text-black hover:bg-black/[0.03]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="shrink-0">
            {isRemit ? (
              wallet ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-black/[0.07] bg-white text-[11px] tracking-wide">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="Connected" />
                  <span className="font-mono">
                    {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] tracking-wide text-black/35 hidden sm:inline">
                  Sign in below
                </span>
              )
            ) : (
              <WalletConnector />
            )}
          </div>
        </nav>

        {/* Mobile nav links */}
        <div className="md:hidden mt-2 flex gap-1 overflow-x-auto pb-1 pointer-events-auto">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/app" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 px-3 py-2 rounded-xl text-[11px] tracking-wide border transition-colors ${
                  active
                    ? "bg-black/[0.06] text-black border-black/10"
                    : "text-black/45 border-black/[0.06] bg-white/50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
