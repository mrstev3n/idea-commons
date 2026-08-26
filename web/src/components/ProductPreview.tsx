import { CLAIM_TYPE_LABELS } from "@/lib/labels";
import type { PublishedIdeaSummary } from "@/server/queries";

const PREVIEW_BLURBS: Record<string, string> = {
  fact: "Cité, vérifiable, jamais présumé.",
  hypothesis: "À éprouver dans un contexte réel.",
  estimate: "Chiffré, avec son degré d'incertitude.",
  recommendation: "Prescriptif, distinct d'un fait.",
  validation_question: "Ce qu'il reste à trancher.",
};

export function ProductPreview({ featured }: { featured?: PublishedIdeaSummary }) {
  const pills = Object.entries(CLAIM_TYPE_LABELS);

  return (
    <div className="preview" aria-hidden="true">
      <div className="preview__chrome">
        <p className="preview__chrome-title">
          {featured ? featured.title : "Aperçu d'une fiche"}
        </p>
      </div>
      <div className="preview__pills">
        {pills.map(([type, label]) => (
          <span key={type} className="preview__pill">
            {label}
          </span>
        ))}
      </div>
      <div className="preview__grid">
        {pills.map(([type, label]) => (
          <article key={type} className="preview__card" data-claim-type={type}>
            <strong>{label}</strong>
            <p>
              {featured && type === "fact"
                ? featured.oneLineSummary
                : (PREVIEW_BLURBS[type] ?? label)}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
