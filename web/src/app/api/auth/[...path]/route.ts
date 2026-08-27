import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

async function unavailable(): Promise<Response> {
  return Response.json({ error: "authentication_not_configured" }, { status: 503 });
}

function handlers() {
  try {
    return getAuth().handler();
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers()?.GET(request, context) ?? unavailable();
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers()?.POST(request, context) ?? unavailable();
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers()?.PUT(request, context) ?? unavailable();
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers()?.DELETE(request, context) ?? unavailable();
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers()?.PATCH(request, context) ?? unavailable();
}
