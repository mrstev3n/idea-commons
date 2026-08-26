import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/identity";
import { getEditorialCase } from "@/server/queries";
import { processOutboxOnce } from "@/server/worker";

export const dynamic = "force-dynamic";

/**
 * Statut d'analyse par polling (transport alpha IC-07). Le worker outbox est
 * avancé de façon opportuniste à chaque interrogation : en production, un
 * worker durable indépendant assumerait cette consommation.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) {
    return NextResponse.json({ message: "Authentification requise." }, { status: 401 });
  }

  await processOutboxOnce();

  const { id } = await params;
  const detail = await getEditorialCase(identity, id);
  if (!detail) {
    return NextResponse.json({ message: "Introuvable." }, { status: 404 });
  }

  return NextResponse.json(
    {
      generationStatus: detail.generation?.status ?? null,
      terminalState: detail.generation?.terminalState ?? null,
      candidateId: detail.candidate?.id ?? null,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
