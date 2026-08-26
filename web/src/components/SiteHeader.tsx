import Link from "next/link";
import { getCurrentIdentity } from "@/server/identity";
import { SiteNav } from "@/components/SiteNav";

export async function SiteHeader() {
  const identity = await getCurrentIdentity();
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <img src="/brand/idea-commons-mark.png" alt="" />
          <span>Idea Commons</span>
        </Link>
        <SiteNav
          identityName={identity.displayName}
          identityTone={identity.key === "anonymous" ? "neutral" : "ready"}
        />
      </div>
    </header>
  );
}
