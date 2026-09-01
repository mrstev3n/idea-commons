/**
 * Development-only integration boundary.
 *
 * Product components must not import DialKit directly. Keeping the dynamic
 * import behind this server-side environment check lets local tuning tools
 * evolve without turning them into a production UI contract.
 */
export async function DevelopmentTools() {
  if (process.env.NODE_ENV !== "development") return null;

  const { DevelopmentDialRoot } = await import("./DevelopmentDialRoot");
  return <DevelopmentDialRoot />;
}
