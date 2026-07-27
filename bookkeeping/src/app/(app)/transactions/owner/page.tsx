import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OwnerFlowForm } from "./owner-form";

export const metadata = { title: "Owner contribution / withdrawal / transfer" };

export default function OwnerFlowPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Money between you and the business</h1>
        <p className="text-sm text-muted-foreground">
          These entries never affect your profit — they only move money.
        </p>
      </div>
      <Alert variant="info">
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Owner contribution (privéstorting):</strong> you move private money into the
              business — for example to cover startup costs. Not income.
            </li>
            <li>
              <strong>Owner withdrawal (privéopname):</strong> you take business money for private
              use — your “salary” as a sole proprietor. Not an expense.
            </li>
            <li>
              <strong>Transfer between own accounts:</strong> moving money between your own business
              and personal accounts. Neither income nor expense.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
      <OwnerFlowForm />
    </div>
  );
}
