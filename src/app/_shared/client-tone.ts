export type SemanticNoticeTone = "success" | "warning" | "error";

export function getSemanticNoticeClasses(tone: SemanticNoticeTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "error":
    default:
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
}
