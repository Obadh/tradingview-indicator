import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/context";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (existing) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl p-4 py-8">
      <h1 className="text-2xl font-semibold">Set up your business</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Answer what you know — everything can be changed later in Settings. Fields with unfamiliar
        terms have a short explanation.
      </p>
      <OnboardingForm />
    </main>
  );
}
