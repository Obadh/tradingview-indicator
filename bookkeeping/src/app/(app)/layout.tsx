import Link from "next/link";
import { requireBusiness } from "@/lib/server/context";
import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { business, user } = await requireBusiness();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2"
      >
        Skip to main content
      </a>
      <aside className="border-b bg-card md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block">
          <Link href="/dashboard" className="font-semibold">
            {business.tradeName || business.legalName}
          </Link>
          <p className="hidden text-xs text-muted-foreground md:mt-1 md:block">
            Bookkeeping assistant — not tax advice
          </p>
        </div>
        <NavLinks />
        <div className="hidden p-4 md:block">
          <form action={logoutAction}>
            <Button variant="outline" size="sm" className="w-full" type="submit">
              Sign out {user.name ? `(${user.name})` : ""}
            </Button>
          </form>
        </div>
      </aside>
      <main id="main-content" className="min-w-0 flex-1 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
