"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useEffect, useId, useRef, useState } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { BorderBeam } from "border-beam";
import { FieldLabel, InputGroup, InputGroupInput } from "@/components/ui/Field";
import { logout } from "@/app/identite/actions";

const EXPLORE_GROUPS = [
  {
    title: "Thèmes",
    links: [
      { label: "Environnement", href: "/idees/cartographie-ilots-chaleur" },
      { label: "Société", href: "/idees/ateliers-reparation-mediatheque" },
    ],
    cta: { label: "Voir les idées publiées", href: "/#idees-publiees" },
  },
  {
    title: "Sources récentes",
    links: [
      { label: "Campagne d’été d’un collectif", href: "/idees/cartographie-ilots-chaleur" },
      { label: "Expérimentation en médiathèque", href: "/idees/ateliers-reparation-mediatheque" },
    ],
    cta: { label: "Proposer une source", href: "/editorial" },
  },
  {
    title: "Collections",
    links: [
      { label: "Climat urbain", href: "/idees/cartographie-ilots-chaleur" },
      { label: "Faire et réparer ensemble", href: "/idees/ateliers-reparation-mediatheque" },
    ],
    cta: { label: "Voir les collections", href: "/#collections" },
  },
  {
    title: "Parcours",
    links: [
      { label: "Comprendre une idée", href: "/idees/cartographie-ilots-chaleur" },
      { label: "Contribuer utilement", href: "/editorial" },
    ],
    cta: { label: "Ouvrir l’espace éditorial", href: "/editorial" },
  },
] as const;

const MOBILE_EXPLORE_LINKS = [
  ...EXPLORE_GROUPS[0].links,
  ...EXPLORE_GROUPS[1].links,
] as const;

const USE_CASES = [
  {
    label: "Trouver une idée de produit",
    description: "Partir d’un besoin observé pour faire émerger une piste concrète.",
    href: "/cas-d-utilisation#idee-produit",
  },
  {
    label: "Transformer un irritant en piste",
    description: "Décrire une friction et remonter aux faits qui permettent de l’explorer.",
    href: "/cas-d-utilisation#irritant",
  },
  {
    label: "Repenser un service ou une expérience",
    description: "Relier les usages, les sources et les idées qui éclairent une évolution.",
    href: "/cas-d-utilisation#service-experience",
  },
  {
    label: "Explorer les besoins d’un territoire",
    description: "Lire des signaux locaux pour mieux situer les besoins et les initiatives.",
    href: "/cas-d-utilisation#besoins-territoire",
  },
] as const;

const DESKTOP_MENUS = [
  {
    key: "about",
    label: "À propos",
    links: [
      {
        label: "Pourquoi Idea Commons",
        description: "Comprendre la promesse et ce que le Commons cherche à rendre possible.",
        href: "/a-propos#mission",
      },
      {
        label: "Comment ça marche",
        description: "Voir comment les sources deviennent des idées structurées et discutables.",
        href: "/a-propos#fonctionnement",
      },
      {
        label: "Contribuer",
        description: "Proposer une source, une idée ou participer à la veille du Commons.",
        href: "/a-propos#contribuer",
      },
      {
        label: "Principes et confidentialité",
        description: "Lire les repères d’usage, de provenance et de protection des espaces personnels.",
        href: "/a-propos#principes",
      },
    ],
  },
] as const;

const SEARCH_ITEMS = [
  {
    label: "Cartographie citoyenne des îlots de chaleur",
    meta: "Environnement · idée publiée",
    href: "/idees/cartographie-ilots-chaleur",
  },
  {
    label: "Ateliers de réparation ouverts en médiathèque",
    meta: "Société · idée publiée",
    href: "/idees/ateliers-reparation-mediatheque",
  },
] as const;

type DesktopMenu = "explorer" | "use-cases" | "about" | null;
type MenuLayout = { x: number; width: number };

export function SiteNav({ accountName }: { accountName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const desktopPanelId = useId();
  const mobilePanelId = useId();
  const navigationRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [desktopMenu, setDesktopMenu] = useState<DesktopMenu>(null);
  const [menuLayout, setMenuLayout] = useState<MenuLayout>({ x: 0, width: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const closeDesktop = () => setDesktopMenu(null);
  const closeAll = () => {
    closeDesktop();
    setSearchOpen(false);
    setMobileOpen(false);
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const measureMenuLayout = (menu: Exclude<DesktopMenu, null>, trigger: HTMLButtonElement) => {
    const navigation = navigationRef.current;
    const header = navigation?.closest<HTMLElement>(".site-header__inner");
    if (!navigation || !header) return;

    const headerRect = header.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();

    if (menu === "explorer" || menu === "use-cases") {
      setMenuLayout({ x: 0, width: headerRect.width });
      return;
    }

    const styles = getComputedStyle(header);
    const compactWidth = Number.parseFloat(styles.getPropertyValue("--menu-width-compact"));
    const edgeInset = Number.parseFloat(styles.getPropertyValue("--space-3"));
    const width = Math.min(compactWidth, headerRect.width - edgeInset * 2);
    const minX = edgeInset;
    const maxX = headerRect.width - edgeInset - width;
    const triggerX = triggerRect.left - headerRect.left;

    setMenuLayout({ x: Math.min(Math.max(triggerX, minX), maxX), width });
  };

  const openDesktopMenu = (menu: Exclude<DesktopMenu, null>, trigger: HTMLButtonElement) => {
    clearCloseTimer();
    activeTriggerRef.current = trigger;
    measureMenuLayout(menu, trigger);
    setSearchOpen(false);
    setDesktopMenu(menu);
  };

  const toggleDesktopMenu = (menu: Exclude<DesktopMenu, null>, trigger: HTMLButtonElement) => {
    if (desktopMenu === menu) {
      closeDesktop();
      return;
    }
    openDesktopMenu(menu, trigger);
  };

  const scheduleDesktopClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(closeDesktop, 180);
  };

  useEffect(() => {
    closeAll();
  }, [pathname]);

  useEffect(() => {
    if (!desktopMenu && !searchOpen && !mobileOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) closeAll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mobileOpen) {
        closeAll();
        mobileTriggerRef.current?.focus();
        return;
      }
      if (desktopMenu) {
        closeDesktop();
        activeTriggerRef.current?.focus();
        return;
      }
      if (searchOpen) {
        setSearchOpen(false);
        searchInputRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [desktopMenu, mobileOpen, searchOpen]);

  useEffect(() => {
    if (!desktopMenu) return;
    const updateLayout = () => {
      if (activeTriggerRef.current) measureMenuLayout(desktopMenu, activeTriggerRef.current);
    };
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [desktopMenu]);

  const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
  const searchResults = normalizedQuery
    ? SEARCH_ITEMS.filter((item) =>
        `${item.label} ${item.meta}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery),
      )
    : SEARCH_ITEMS;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstResult = searchResults[0];
    if (!firstResult) return;
    closeAll();
    router.push(firstResult.href);
  }

  const onIdentity = pathname.startsWith("/identite");

  return (
    <div
      className="site-navigation"
      ref={navigationRef}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleDesktopClose}
    >
      <nav aria-label="Navigation principale" className="site-header__nav">
        <button
          type="button"
          className="site-header__link site-header__menu-trigger"
          aria-expanded={desktopMenu === "explorer"}
          aria-controls={desktopPanelId}
          onMouseEnter={(event) => openDesktopMenu("explorer", event.currentTarget)}
          onClick={(event) => toggleDesktopMenu("explorer", event.currentTarget)}
        >
          Explorer
          <IconChevronDown
            className="site-header__chevron"
            width={16}
            height={16}
            stroke={1.75}
            aria-hidden="true"
            focusable="false"
          />
        </button>

        <button
          type="button"
          className="site-header__link site-header__menu-trigger"
          aria-expanded={desktopMenu === "use-cases"}
          aria-controls={desktopPanelId}
          onMouseEnter={(event) => openDesktopMenu("use-cases", event.currentTarget)}
          onClick={(event) => toggleDesktopMenu("use-cases", event.currentTarget)}
        >
          Cas d’utilisation
          <IconChevronDown
            className="site-header__chevron"
            width={16}
            height={16}
            stroke={1.75}
            aria-hidden="true"
            focusable="false"
          />
        </button>

        <Link
          className="site-header__link"
          href="/pricing"
          aria-current={pathname === "/pricing" ? "page" : undefined}
          onMouseEnter={scheduleDesktopClose}
          onFocus={closeDesktop}
        >
          Tarifs
        </Link>
        {DESKTOP_MENUS.map((menu) => (
          <button
            key={menu.key}
            type="button"
            className="site-header__link site-header__menu-trigger"
            aria-expanded={desktopMenu === menu.key}
            aria-controls={desktopPanelId}
            onMouseEnter={(event) => openDesktopMenu(menu.key, event.currentTarget)}
            onClick={(event) => toggleDesktopMenu(menu.key, event.currentTarget)}
          >
            {menu.label}
            <IconChevronDown
              className="site-header__chevron"
              width={16}
              height={16}
              stroke={1.75}
              aria-hidden="true"
              focusable="false"
            />
          </button>
        ))}
        <Link
          className="site-header__link"
          href="/blog"
          aria-current={pathname.startsWith("/blog") ? "page" : undefined}
          onMouseEnter={scheduleDesktopClose}
          onFocus={closeDesktop}
        >
          Blog
        </Link>
      </nav>

      <div className="site-header__actions">
        <div className="site-search">
          <form className="site-search-inline" onSubmit={submitSearch} role="search">
            <FieldLabel className="visually-hidden" htmlFor={`${desktopPanelId}-search-input`}>
              Rechercher dans les idées
            </FieldLabel>
            <BorderBeam
              className="site-search-beam"
              size="line"
              colorVariant="colorful"
              theme="dark"
              duration={3.1}
              borderRadius={999}
            >
              <InputGroup className="site-search-inline__field">
                <IconSearch
                  className="site-search-inline__icon"
                  width={16}
                  height={16}
                  stroke={1.75}
                  aria-hidden="true"
                  focusable="false"
                />
                <InputGroupInput
                  ref={searchInputRef}
                  id={`${desktopPanelId}-search-input`}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    closeDesktop();
                    setSearchOpen(true);
                  }}
                  type="search"
                  placeholder="Thème, source, idée…"
                  autoComplete="off"
                  aria-expanded={searchOpen}
                  aria-controls={`${desktopPanelId}-recherche`}
                />
              </InputGroup>
            </BorderBeam>
          </form>

          <div
            id={`${desktopPanelId}-recherche`}
            className="search-popover"
            hidden={!searchOpen}
          >
            <p className="search-popover__title">
              {normalizedQuery ? "Résultats" : "Idées publiées"}
            </p>
            <p className="visually-hidden" aria-live="polite">
              {searchResults.length === 0
                ? "Aucun résultat"
                : `${searchResults.length} résultat${searchResults.length > 1 ? "s" : ""}`}
            </p>
            <div className="search-popover__results">
              {searchResults.length > 0 ? searchResults.map((item) => (
                <Link href={item.href} key={item.href} onClick={closeAll}>
                  <strong>{item.label}</strong>
                  <span>{item.meta}</span>
                </Link>
              )) : <p>Aucune idée ne correspond encore à cette recherche.</p>}
            </div>
          </div>
        </div>
        {accountName ? (
          <form action={logout}>
            <button className="site-header__account" type="submit" aria-label={`Déconnecter ${accountName}`}>
              Se déconnecter
            </button>
          </form>
        ) : (
          <Link
            className="site-header__account"
            href="/identite"
            aria-current={onIdentity ? "page" : undefined}
            aria-label="Se connecter ou créer un compte"
          >
            Se connecter
          </Link>
        )}
      </div>

      <button
        ref={mobileTriggerRef}
        type="button"
        className="site-header__mobile-trigger"
        aria-expanded={mobileOpen}
        aria-controls={mobilePanelId}
        onClick={() => {
          closeDesktop();
          setMobileOpen((open) => !open);
        }}
      >
        {mobileOpen ? "Fermer" : "Menu"}
      </button>

      <div
        id={desktopPanelId}
        className="desktop-menu-surface"
        data-menu={desktopMenu || undefined}
        hidden={!desktopMenu}
        aria-label={
          desktopMenu === "explorer"
            ? "Explorer Idea Commons"
            : desktopMenu === "use-cases"
              ? "Cas d’utilisation Idea Commons"
              : desktopMenu === "about"
                ? "À propos d’Idea Commons"
                : undefined
        }
        onMouseEnter={clearCloseTimer}
        style={{
          "--menu-x": `${menuLayout.x}px`,
          "--menu-width": `${menuLayout.width}px`,
        } as CSSProperties}
      >
        {desktopMenu === "explorer" ? (
          <div className="mega-menu" key="explorer">
            <div className="mega-menu__groups">
              {EXPLORE_GROUPS.map((group) => (
                <section className="mega-menu__group" key={group.title}>
                  <h2>{group.title}</h2>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <Link href={link.href} onClick={closeAll}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                  <Link className="mega-menu__cta" href={group.cta.href} onClick={closeAll}>
                    {group.cta.label}
                  </Link>
                </section>
              ))}
            </div>
            <aside className="mega-menu__feature" aria-labelledby={`${desktopPanelId}-feature`}>
              <img src="/images/stock-climate-flood.webp" alt="Vue aérienne d’un territoire touché par une inondation" />
              <p className="mega-menu__eyebrow">Collection à la une</p>
              <h2 id={`${desktopPanelId}-feature`}>Climat urbain : comprendre les îlots de chaleur</h2>
              <p>Une idée publiée, ses sources et les affirmations qui restent à discuter.</p>
              <Link href="/idees/cartographie-ilots-chaleur" onClick={closeAll}>Découvrir la sélection</Link>
            </aside>
          </div>
        ) : desktopMenu === "use-cases" ? (
          <div className="use-case-menu" key="use-cases">
            <div className="use-case-menu__items">
              {USE_CASES.map((useCase) => (
                <Link href={useCase.href} key={useCase.href} onClick={closeAll}>
                  <strong>{useCase.label}</strong>
                  <span>{useCase.description}</span>
                </Link>
              ))}
            </div>
            <aside className="mega-menu__feature" aria-labelledby={`${desktopPanelId}-real-case`}>
              <div className="mega-menu__feature-mark" aria-hidden="true">
                <span>Oh</span>
                <span>Ah</span>
              </div>
              <p className="mega-menu__eyebrow">Cas réel</p>
              <h2 id={`${desktopPanelId}-real-case`}>Un soundboard d’emojis né d’un besoin en direct</h2>
              <p>Pendant un live ou un appel vidéo, certaines réactions gagnent à être entendues. Cette envie est devenue un soundboard où chaque emoji déclenche un son.</p>
              <Link href="/blog/soundboard-emojis" onClick={closeAll}>Lire le récit</Link>
            </aside>
          </div>
        ) : desktopMenu ? (
          <div className="nav-popover" key={desktopMenu}>
            <p className="nav-popover__title">
              {DESKTOP_MENUS.find((menu) => menu.key === desktopMenu)?.label}
            </p>
            {DESKTOP_MENUS.find((menu) => menu.key === desktopMenu)?.links.map((link) => (
              <Link href={link.href} key={link.label} onClick={closeAll}>
                <strong>{link.label}</strong>
                <span>{link.description}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div id={mobilePanelId} className="mobile-navigation" hidden={!mobileOpen}>
        <nav aria-label="Navigation mobile">
          <form className="mobile-navigation__search" onSubmit={submitSearch} role="search">
            <FieldLabel htmlFor={`${mobilePanelId}-search`}>Rechercher</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${mobilePanelId}-search`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Thème, source, idée…"
              />
            </InputGroup>
          </form>
          <section>
            <h2>Explorer</h2>
            {MOBILE_EXPLORE_LINKS.map((link) => (
              <Link href={link.href} key={link.label} onClick={closeAll}>{link.label}</Link>
            ))}
          </section>
          <section>
            <h2>Cas d’utilisation</h2>
            {USE_CASES.map((useCase) => (
              <Link href={useCase.href} key={useCase.href} onClick={closeAll}>{useCase.label}</Link>
            ))}
          </section>
          <section>
            <h2>Tarifs</h2>
            <Link href="/pricing" onClick={closeAll}>Comparer les offres</Link>
          </section>
          {DESKTOP_MENUS.map((menu) => (
            <section key={menu.key}>
              <h2>{menu.label}</h2>
              {menu.links.map((link) => (
                <Link href={link.href} key={link.label} onClick={closeAll}>{link.label}</Link>
              ))}
            </section>
          ))}
          <section>
            <h2>Blog</h2>
            <Link href="/blog" onClick={closeAll}>Lire le Blog</Link>
          </section>
          {accountName ? (
            <form action={logout}>
              <button className="mobile-navigation__account" type="submit">Se déconnecter</button>
            </form>
          ) : (
            <Link className="mobile-navigation__account" href="/identite" onClick={closeAll}>
              Se connecter
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
