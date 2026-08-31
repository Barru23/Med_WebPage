import { listAllDepartments } from "@/lib/admin/queries";
import ActivityForm from "../ActivityForm";

export const dynamic = "force-dynamic";

export default async function NewActivityPage() {
  const departments = await listAllDepartments();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl tracking-tight">Nova activitat</h1>
      <div className="mt-6">
        <ActivityForm departments={departments} />
      </div>
    </div>
  );
}
