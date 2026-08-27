import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { getCurrentIdentity } from "@/server/identity";

export async function SiteHeader() {
  const identity = await getCurrentIdentity();
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <img src="/brand/idea-commons-mark.png" alt="" />
          <span>Idea Commons</span>
        </Link>
        <SiteNav accountName={identity.authUserId ? identity.displayName : null} />
      </div>
    </header>
  );
}
