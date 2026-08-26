import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource-variable/fraunces/standard.css";
import "@fontsource-variable/fraunces/standard-italic.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@/design/tokens.css";
import "@/design/base.css";
import "@/design/components.css";
import "@/design/motion.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: {
    default: "Idea Commons",
    template: "%s · Idea Commons",
  },
  description:
    "Découvre des idées. Adapte-les à ton contexte. Transforme-les en projet. Catalogue ouvert d'idées structurées, sourcées et traçables.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body>
        <a href="#contenu" className="skip-link">
          Aller au contenu principal
        </a>
        <SiteHeader />
        <main id="contenu">{children}</main>
        <footer className="site-footer">
          <div className="site-footer__grid">
            <div className="site-footer__intro">
              <Link href="/" className="site-footer__brand">
                Idea Commons
              </Link>
              <p>
                Des sources publiques deviennent des idées structurées, traçables et
                discutables.
              </p>
              <p className="site-footer__license">Contenu public · CC BY-SA 4.0</p>
            </div>
            <nav aria-label="Explorer dans le pied de page">
              <h2>Explorer</h2>
              <Link href="/#tendances">Tendances</Link>
              <Link href="/#themes">Thèmes</Link>
              <Link href="/#idees-publiees">Idées récentes</Link>
              <Link href="/#collections">Collections</Link>
              <Link href="/pricing">Tarifs</Link>
            </nav>
            <nav aria-label="À propos dans le pied de page">
              <h2>À propos</h2>
              <Link href="/a-propos#mission">Pourquoi Idea Commons</Link>
              <Link href="/a-propos#fonctionnement">Comment ça marche</Link>
              <Link href="/a-propos#contribuer">Contribuer</Link>
            </nav>
            <nav aria-label="Collections dans le pied de page">
              <h2>Collections</h2>
              <Link href="/idees/cartographie-ilots-chaleur">Climat urbain</Link>
              <Link href="/idees/ateliers-reparation-mediatheque">Réparer ensemble</Link>
            </nav>
            <div className="site-footer__principles">
              <h2>Principes</h2>
              <p>Lecture publique sans compte.</p>
              <p>Publication après revue humaine.</p>
              <p>Provenance visible sur chaque fiche.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
