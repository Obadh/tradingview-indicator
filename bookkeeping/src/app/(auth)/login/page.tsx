import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { prisma } from "@/lib/server/db";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const params = await searchParams;
  const userCount = await prisma.user.count();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Bookkeeping for your eenmanszaak. This software assists with bookkeeping — it does not
            replace professional tax advice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.registered && (
            <Alert variant="success">
              <AlertDescription>Account created. You can sign in now.</AlertDescription>
            </Alert>
          )}
          <LoginForm />
          {userCount === 0 && (
            <p className="text-sm text-muted-foreground">
              First time here?{" "}
              <Link className="text-primary underline" href="/register">
                Create the owner account
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
