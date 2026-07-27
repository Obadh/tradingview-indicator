"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Receipt,
  TrendingUp,
  ArrowLeftRight,
  Landmark,
  FileOutput,
  Percent,
  BarChart3,
  Monitor,
  Clock,
  Mail,
  Search,
  PackageOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review inbox", icon: Inbox },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/income", label: "Income", icon: TrendingUp },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/invoices", label: "Invoices", icon: FileOutput },
  { href: "/vat", label: "VAT", icon: Percent },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/assets", label: "Assets", icon: Monitor },
  { href: "/time", label: "Time tracking", icon: Clock },
  { href: "/letters", label: "Official letters", icon: Mail },
  { href: "/search", label: "Search", icon: Search },
  { href: "/export", label: "Export administration", icon: PackageOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="overflow-x-auto md:overflow-visible">
      <ul className="flex gap-1 p-2 md:flex-col">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
