import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  KeyRound,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const guideSections = [
  { id: "getting-started", label: "Getting started" },
  { id: "sites", label: "Sites & crawls" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "site-details", label: "Site details" },
  { id: "insights", label: "Topic insights & reports" },
  { id: "ask", label: "Ask your sites" },
  { id: "costs", label: "Cost tracker" },
  { id: "team", label: "Team & audit" },
  { id: "api", label: "API access" },
  { id: "account", label: "Account & access" },
];

function GuideImage({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-border-subtle bg-background">
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        loading={priority ? "eager" : "lazy"}
        className="h-auto w-full"
      />
      <figcaption className="border-t border-border-subtle px-4 py-2.5 text-xs text-foreground-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

function GuideSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border-subtle py-9 first:pt-0">
      <div className="flex items-start gap-4">
        <span className="pill flex h-8 w-8 shrink-0 items-center justify-center bg-accent/15 text-xs font-semibold text-accent">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">{intro}</p>
          <div className="mt-5 space-y-4 text-sm leading-6">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Step({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <div className="mt-1 text-foreground-muted">{children}</div>
    </div>
  );
}

export default function UserGuidePage() {
  return (
    <main className="guide-page min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium">
            <BookOpen size={17} className="text-accent" />
            Product guide
          </Link>
          <Link
            href="/dashboard"
            className="pill inline-flex items-center gap-2 bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Open dashboard <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            In this guide
          </p>
          <nav aria-label="Guide sections" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {guideSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="shrink-0 rounded-lg px-3 py-2 text-xs text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground lg:text-sm"
              >
                {section.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 hidden rounded-xl border border-border-subtle bg-surface p-4 lg:block">
            <p className="text-xs font-medium">Need to get started?</p>
            <p className="mt-1 text-xs leading-5 text-foreground-muted">
              Add a website from the Sites page to create your first crawl.
            </p>
            <Link href="/dashboard" className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">
              Go to Sites <ArrowRight size={12} />
            </Link>
          </div>
        </aside>

        <article className="min-w-0">
          <div className="mb-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Profound · llms.txt workspace
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              User guide
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-foreground-muted">
              A walkthrough of the website crawler, generated llms.txt files, company insights,
              team administration, and API integrations. The screenshots use fictional sample data.
            </p>
            <GuideImage
              src="/guide/homepage.png"
              alt="Profound llms.txt homepage with URL entry and rotating quote"
              caption="Homepage — paste a site URL to begin. You can explore the flow before creating an account."
              priority
            />
          </div>

          <GuideSection
            id="getting-started"
            number="01"
            title="Getting started"
            intro="The app turns a website into llms.txt and llms-full.txt files, then keeps the site monitored for changes."
          >
            <Step title="Create an account">
              Start from the homepage or choose Sign up. Enter your email and password, then open the
              verification email in the same browser where you started. After verification, the app
              creates your workspace and returns you to the site you entered.
            </Step>
            <Step title="Add your first website">
              Paste a full URL or domain on the homepage, or enter it in the Sites page and choose
              Add. Adding a site queues an initial crawl. The first account in a workspace is its
              admin.
            </Step>
            <Step title="Understand crawl status">
              <span className="font-medium text-foreground">Queued</span> means the worker has not
              started yet; <span className="font-medium text-foreground">Crawling</span> shows live
              page progress; <span className="font-medium text-foreground">Ready</span> means
              generation succeeded; and <span className="font-medium text-foreground">Error</span>{" "}
              means the last run needs attention. The Sites page polls for updates while open.
            </Step>
          </GuideSection>

          <GuideSection
            id="sites"
            number="02"
            title="Sites & crawls"
            intro="The Sites dashboard is your inventory of monitored websites and the quickest place to add, search, sort, or remove a generation."
          >
            <Step title="Add, find, and organize sites">
              Use the add field for a new domain, search by domain, and sort by date added, last
              checked, or number of pages crawled. CSV and JSON report buttons export site health,
              crawl coverage, settings, and topic terms.
            </Step>
            <Step title="Follow a crawl">
              Select a site card to open its detail page. While work is underway, the card shows
              progress and the current activity. A failed site can be retried from its detail page;
              the retry button queues a fresh crawl.
            </Step>
            <Step title="Choose a page limit">
              New sites default to a maximum of 100 pages. You can raise the limit in a site’s
              crawl settings; higher limits send more requests, may take longer and cost more, and
              can cause some sites to throttle or block the crawler.
            </Step>
            <Step title="Delete a generation">
              Use the trash icon to remove a site, generated files, crawl history, and its topic
              terms. A running crawl must finish before deletion is allowed. Usage and cost history
              are retained.
            </Step>
            <GuideImage
              src="/guide/sites.png"
              alt="Sites dashboard with sample monitored websites and crawl status"
              caption="Sites — status, page count, last checked time, reports, search, and sorting."
            />
          </GuideSection>

          <GuideSection
            id="leaderboard"
            number="03"
            title="Leaderboard"
            intro="See which workspace members have generated the most site outputs."
          >
            <Step title="Compare contribution">
              Members are ranked by the number of sites they created, with the leading contributors
              shown first. Display names are used when available; otherwise the member email is
              shown. The leaderboard is visible to signed-in workspace users.
            </Step>
            <GuideImage
              src="/guide/leaderboard.png"
              alt="Leaderboard ranking sample workspace members by sites generated"
              caption="Leaderboard — compare each member’s generated site count."
            />
          </GuideSection>

          <GuideSection
            id="site-details"
            number="04"
            title="Site details, files & coverage"
            intro="Open a site to inspect its generated files, crawl settings, page coverage, and changes between successful runs."
          >
            <Step title="Tune crawl settings">
              Choose Edit settings to change the page cap (1–5,000), include subdomains, or add
              newline-separated URL patterns. Include patterns act as an allow-list; exclude
              patterns take precedence. Settings cannot be edited during a crawl. Save changes,
              then choose Recheck now to apply them.
            </Step>
            <Step title="Inspect coverage">
              The coverage summary separates discovered, crawled, skipped, and failed URLs. Scroll
              through recorded URL outcomes to understand why a page was skipped or failed; the
              report can record up to 5,000 discovered URLs.
            </Step>
            <Step title="Read and download output">
              Use the llms.txt and llms-full.txt views to inspect the latest generation. Download
              either file, switch between available versions, and select a changed path to inspect
              its section. The Merkle tree visualization highlights changes detected in the most
              recent crawl.
            </Step>
            <GuideImage
              src="/guide/site-detail.png"
              alt="Site detail screen showing crawl settings, files, and coverage"
              caption="Site detail — output versions, per-site settings, coverage, and change inspection."
            />
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-foreground-muted">
              A single page fetch has a 15-second timeout; the whole queued crawl has a 30-minute
              worker timeout. If progress stops, check that the worker is healthy. A failed crawl
              can be retried once the issue is addressed.
            </div>
          </GuideSection>

          <GuideSection
            id="insights"
            number="05"
            title="Topic insights & reports"
            intro="Explore salient terms extracted from crawled page titles and descriptions, compare their frequency across sites, and review changes over time."
          >
            <Step title="Company-wide leaderboard">
              Topic rows are ranked by total mentions across company sites. Select a term to reveal
              its trend and the sites/pages where it appears. On mobile, details expand directly
              below the selected row.
            </Step>
            <Step title="Recent terms by site">
              This panel shows per-site terms—even terms outside the company-wide top 30—and is
              internally scrollable when the list grows. It covers the six most recently crawled
              ready sites. Topic data is refreshed when crawls finish; use Refresh to fetch the
              latest data manually.
            </Step>
            <Step title="Download reports">
              Use Download CSV or Download JSON to export company site status, crawl coverage,
              configuration, and topic insights.
            </Step>
            <GuideImage
              src="/guide/topic-insights.png"
              alt="Topic insights screen with a company topic ranking and recent terms by site"
              caption="Topic insights — aggregated terms, individual-site terms, and report downloads."
            />
          </GuideSection>

          <GuideSection
            id="ask"
            number="06"
            title="Ask your sites"
            intro="Ask a natural-language question across the company’s generated site content and receive an answer with source pages."
          >
            <Step title="Run a query">
              Try a focused question such as “Which sites mention pricing?” or ask a broader
              question. Choose Ask to search. Matching source links appear beneath the answer so
              you can open the original pages.
            </Step>
            <Step title="Reuse recent questions">
              Recent questions are stored in this browser and shown as quick actions. Select one to
              run it again, or remove it with the x on its chip. This local history is not shared
              with teammates.
            </Step>
            <GuideImage
              src="/guide/ask-sites.png"
              alt="Ask your sites page showing a sample question and sourced answer"
              caption="Ask your sites — natural-language search with source attribution."
            />
          </GuideSection>

          <GuideSection
            id="costs"
            number="07"
            title="Cost tracker"
            intro="Review the workspace’s logged model usage for crawling, summarization, embeddings, and questions."
          >
            <Step title="Understand spend">
              The total card shows accumulated tracked spend. Charts break costs down by day and by
              purpose. The tracker reflects model usage recorded by the app; it is an estimate and
              may not exactly match provider billing.
            </Step>
            <GuideImage
              src="/guide/cost-tracker.png"
              alt="Cost tracker showing sample spend by day and purpose"
              caption="Cost tracker — cumulative spend with daily and usage-purpose breakdowns."
            />
          </GuideSection>

          <GuideSection
            id="team"
            number="08"
            title="Team & audit (admins)"
            intro="Workspace admins can invite collaborators, manage roles, and review administrative activity."
          >
            <Step title="Invite a teammate">
              Enter their email, select Admin or Member, and send the invitation. The secure link
              expires after 24 hours. The recipient follows the link, creates an account or logs in
              with the invited email, and joins the workspace. Pending invites can be revoked.
            </Step>
            <Step title="Manage roles">
              Admins can promote or demote members. A workspace must always retain at least one
              admin, so the sole admin cannot demote themselves. Members can work with company
              sites and analytics but cannot access admin controls.
            </Step>
            <Step title="Review activity">
              Recent activity lists administrative events such as invitations, role changes, and
              key actions, with actor, resource, details, and timestamp.
            </Step>
            <GuideImage
              src="/guide/team-audit.png"
              alt="Team and audit page showing invitation controls, roles, and activity"
              caption="Team & audit — invitations, workspace roles, and the administrative activity log."
            />
          </GuideSection>

          <GuideSection
            id="api"
            number="09"
            title="API access (admins)"
            intro="Create company-scoped API keys for external integrations and explore the available REST endpoints."
          >
            <Step title="Create and protect keys">
              Give each key a recognizable name and choose Create key. Copy the secret immediately:
              it is displayed only once. Store it in a secrets manager, never in source control or
              browser code. Revoke a key here if it is exposed or no longer needed.
            </Step>
            <Step title="Authenticate requests">
              Send the key in the HTTP Authorization header as a Bearer token. Requests use the
              company scope of the key. For example:
              <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-4 text-xs leading-5 text-foreground-muted">{`curl "$API_BASE_URL/api/sites" \\
  -H "Authorization: Bearer $PROFOUND_API_KEY"`}</pre>
            </Step>
            <Step title="Explore endpoints">
              The API access page lists site, crawl, report, analytics, search, and team endpoints
              with an interactive OpenAPI reference. Crawl creation returns immediately; poll the
              site or jobs endpoint to follow progress. Managing keys and workspace roles still
              requires an admin’s signed-in session.
            </Step>
            <GuideImage
              src="/guide/api-access.png"
              alt="API access page showing key creation and API reference"
              caption="API access — securely manage keys and explore the REST API."
            />
          </GuideSection>

          <GuideSection
            id="account"
            number="10"
            title="Account, access & common questions"
            intro="A few notes on sign-in, email links, and the way workspace data is refreshed."
          >
            <Step title="Session and sign-out">
              The browser keeps your sign-in session across restarts and refreshes it automatically.
              Choose Log out in the sidebar to end the session and return to the homepage.
            </Step>
            <Step title="Email links">
              Verification and invitation links return to the environment where they were created.
              If a link lands on the wrong host, ask an admin to check the environment’s configured
              callback URL and its Supabase redirect allow-list.
            </Step>
            <Step title="Why a new site may not show terms yet">
              Terms are calculated after a successful crawl from the page titles and descriptions.
              A site still queued, crawling, or failed has no new terms to show. The Topic insights
              page checks crawl status every five seconds while open and refreshes after completion.
            </Step>
            <Step title="Who can access admin pages?">
              API access and Team & audit are available to workspace admins. If you need an admin
              role, ask an existing admin to update your workspace membership.
            </Step>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard" className="pill inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                <Activity size={15} /> Open Sites
              </Link>
              <Link href="/dashboard/analytics" className="pill inline-flex items-center gap-2 border border-border-subtle px-4 py-2 text-sm hover:bg-surface-raised">
                <BarChart3 size={15} /> Topic insights
              </Link>
              <Link href="/dashboard/team" className="pill inline-flex items-center gap-2 border border-border-subtle px-4 py-2 text-sm hover:bg-surface-raised">
                <UsersRound size={15} /> Team settings
              </Link>
              <Link href="/dashboard/api" className="pill inline-flex items-center gap-2 border border-border-subtle px-4 py-2 text-sm hover:bg-surface-raised">
                <KeyRound size={15} /> API access
              </Link>
              <span className="inline-flex items-center gap-2 px-2 text-xs text-foreground-muted">
                <Search size={14} /> Help your team find the right source.
              </span>
              <span className="inline-flex items-center gap-2 px-2 text-xs text-foreground-muted">
                <ShieldCheck size={14} /> Keys and admin access stay protected.
              </span>
            </div>
          </GuideSection>

          <footer className="py-8 text-xs text-foreground-muted">
            Screenshots in this guide use fictional sample content; live workspace data can differ.
          </footer>
        </article>
      </div>
    </main>
  );
}
