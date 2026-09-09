import { listAllDepartments } from "@/lib/admin/queries";
import DepartmentsList from "./DepartmentsList";
import AddDepartmentForm from "./AddDepartmentForm";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  await requireAdminPage();
  const departments = await listAllDepartments();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl tracking-tight">Departaments</h1>
      <p className="mt-1 font-mono text-xs text-ink/70">
        Nom en tres idiomes, foto, arrossega per reordenar.
      </p>

      <div className="mt-6">
        <DepartmentsList initial={departments} />
      </div>

      <div className="mt-6">
        <AddDepartmentForm />
      </div>
    </div>
  );
}
