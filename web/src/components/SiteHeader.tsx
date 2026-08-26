import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <img src="/brand/idea-commons-mark.png" alt="" />
          <span>Idea Commons</span>
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
