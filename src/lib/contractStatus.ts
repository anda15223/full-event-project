export type ContractStatusInfo = {
  status: "green" | "amber" | "red" | "neutral";
  label: string;
};

export interface ContractStatusInput {
  contract_status: string | null;
  signed_at: string | null;
  contract_pdf_path: string | null;
  expires_at: string | null;
}

export function computeContractStatus(c: ContractStatusInput): ContractStatusInfo {
  const now = new Date();
  const isSigned = c.contract_status === "signed" || !!c.signed_at;
  const expired = c.expires_at && new Date(c.expires_at) < now;

  if (expired) return { status: "amber", label: "Expired" };
  if (isSigned) return { status: "green", label: "Signed" };
  if (c.contract_pdf_path) return { status: "amber", label: "Uploaded, awaiting signature" };
  if (c.contract_status === "draft") return { status: "neutral", label: "Draft" };
  return { status: "red", label: "Unsigned" };
}

export function statusBadgeClasses(status: ContractStatusInfo["status"]): string {
  switch (status) {
    case "green":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30";
    case "amber":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30";
    case "red":
      return "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}
