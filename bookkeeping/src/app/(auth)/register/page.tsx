import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/server/db";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create owner account" };

export default async function RegisterPage() {
  const userCount = await prisma.user.count();
  if (userCount > 0 || process.env.ALLOW_REGISTRATION === "false") {
    redirect("/login");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create the owner account</CardTitle>
        <CardDescription>
          This is a single-user application: registration closes automatically after this account
          is created. Use a long, unique password (a short sentence works well).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
