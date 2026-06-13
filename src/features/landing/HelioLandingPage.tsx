import { FormEvent, useEffect, useMemo, useState } from "react";
import "./helio-landing.css";

type WaitlistForm = {
  name: string;
  email: string;
  phone: string;
  country: string;
  heardFrom: string[];
};

type FeatureCard = {
  icon: string;
  title: string;
  detail: string;
};

const HEARD_FROM_OPTIONS = [
  "X / Twitter",
  "LinkedIn",
  "Instagram",
  "YouTube",
  "Friend / Referral",
  "Google Search",
  "Community / Discord",
  "Other"
];

const FEATURE_CARDS: FeatureCard[] = [
  {
    icon: "◉",
    title: "Technical Audit",
    detail: "Crawl integrity, Core Web Vitals, indexation blockers, and schema breakpoints monitored continuously."
  },
  {
    icon: "⌁",
    title: "Keyword Intel",
    detail: "Tracks ranking movement, intent shifts, and opportunity clusters before competitors capture demand."
  },
  {
    icon: "▣",
    title: "Content Engine",
    detail: "Turns SERP gaps into mission-ready briefs with priority scores, internal linking targets, and timelines."
  },
  {
    icon: "△",
    title: "On-Page SEO",
    detail: "Automates metadata, heading hierarchy checks, cannibalization alerts, and template-level quality controls."
  },
  {
    icon: "✦",
    title: "Backlink Manager",
    detail: "Monitors authority signals, detects link decay, and proposes outreach tasks tied to ranking upside."
  },
  {
    icon: "▤",
    title: "Analytics + Reports",
    detail: "Connects Search Console and GA4 to quantify traffic lift, visibility share, and mission outcomes."
  }
];

const INITIAL_FORM: WaitlistForm = {
  name: "",
  email: "",
  phone: "",
  country: "",
  heardFrom: []
};

export default function HelioLandingPage() {
  const [form, setForm] = useState<WaitlistForm>(INITIAL_FORM);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length > 1 &&
      form.email.trim().length > 3 &&
      form.phone.trim().length > 5 &&
      form.country.trim().length > 1 &&
      form.heardFrom.length > 0
    );
  }, [form]);

  useEffect(() => {
    if (!isModalOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEscape);
    };
  }, [isModalOpen]);

  const toggleHeardFrom = (option: string) => {
    setForm((current) => {
      const exists = current.heardFrom.includes(option);
      const next = exists
        ? current.heardFrom.filter((item) => item !== option)
        : [...current.heardFrom, option];
      return { ...current, heardFrom: next };
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || status === "loading") return;

    setStatus("loading");
    setMessage("Submitting your request to the HELIO queue...");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to process waitlist signup right now.");
      }

      setStatus("success");
      setMessage("You are in. We logged your details and sent confirmation to HELIO ops.");
      setForm(INITIAL_FORM);
    } catch (error) {
      const err = error as Error;
      setStatus("error");
      setMessage(err.message || "Unexpected issue while submitting the form.");
    }
  };

  return (
    <div className="helio-page">
      <div className="scanlines" aria-hidden="true" />

      <header className="topbar terminal-frame">
        <span className="brand">HELIO</span>
        <span className="topbar-meta">MISSION CONTROL / SEO AGENT v1.0</span>
        <span className="status-pill">ONLINE</span>
      </header>

      <main className="hero terminal-frame">
        <div className="hero-copy-block">
          <p className="eyebrow">EARLY ACCESS // COMMAND PROTOCOL</p>
          <h1>
            Outrank competitors on autopilot,
            <span className="shimmer-text"> with HELIO running SEO 24/7.</span>
          </h1>
          <p className="lead">
            HELIO detects technical issues, prioritizes growth actions, deploys mission packs,
            and compounds search traffic without manual coordination overhead.
          </p>

          <div className="cta-row">
            <button className="join-btn" type="button" onClick={() => setIsModalOpen(true)}>
              Join Waitlist
            </button>
            <a href="#autonomous-seo" className="ghost-link">
              Read The Mission Brief
            </a>
          </div>

          <div className="terminal-line">
            <span className="prompt">$</span>
            <span className="typed">helio agent run --goal "grow non-brand clicks +45%"</span>
            <span className="typed-mobile" aria-hidden="true">
              <span className="typed-mobile-line line-1">helio agent run --goal</span>
              <span className="typed-mobile-line line-2">"grow non-brand clicks +45%"</span>
            </span>
          </div>
        </div>

        <aside className="orbit-panel mascot-panel" aria-label="HELIO mascot animation">
          <div className="mascot-glow" />
          <img src="/helio-mascot-cutout.png" alt="HELIO Mascot" className="hero-mascot" />
          <div className="mascot-action action-a">SCANNING SERP</div>
          <div className="mascot-action action-b">PATCHING PAGES</div>
          <div className="mascot-action action-c">SHIPPING MISSIONS</div>
          <p className="orbit-caption">HELIO MASCOT / LIVE AUTONOMY LOOP</p>
        </aside>
      </main>

      <section id="autonomous-seo" className="terminal-story">
        <article className="terminal-frame story-head">
          <p className="section-kicker">I / LIVE TERMINAL LOOP</p>
          <h2>HELIO continuously detects, decides, and deploys without manual bottlenecks.</h2>
        </article>

        <article className="terminal-frame animated-console" aria-label="HELIO mission terminal output">
          <div className="console-topline">
            <span className="console-dot" />
            <span className="console-dot" />
            <span className="console-dot" />
            <span>MISSION_STREAM.log</span>
          </div>
          <div className="console-body">
            <p className="line shimmer-green">[SCAN] Crawling domain and indexation graph...</p>
            <p className="line">[ALERT] 42 pages blocked by template-level metadata conflict</p>
            <p className="line shimmer-blue">[INTEL] 18 high-intent query clusters uncovered</p>
            <p className="line">[PLAN] Prioritizing fixes by traffic impact and implementation cost</p>
            <p className="line shimmer-green">[DEPLOY] Mission pack shipped to Content + SEO Ops queues</p>
            <p className="line">[REPORT] Visibility share +12.4% projected over next cycle</p>
          </div>
          <div className="console-scan" aria-hidden="true" />
        </article>

        <div className="workflow-grid compact-grid">
          <article className="terminal-frame workflow-card">
            <p className="section-kicker">II / DETECT</p>
            <p>Realtime crawl + indexation checks catch breakpoints before traffic drops.</p>
          </article>
          <article className="terminal-frame workflow-card">
            <p className="section-kicker">III / DECIDE</p>
            <p>Opportunity scoring ranks what to fix now based on click and revenue upside.</p>
          </article>
          <article className="terminal-frame workflow-card">
            <p className="section-kicker">IV / DEPLOY</p>
            <p>Mission packs push execution briefs, owners, and success metrics into your flow.</p>
          </article>
        </div>
      </section>

      <section className="feature-terminal terminal-frame">
        <div className="feature-head">
          <p className="section-kicker">V / HELIO MODULE GRID</p>
          <h2>Terminal-native capability stack built for autonomous SEO operations.</h2>
        </div>
        <div className="feature-grid">
          {FEATURE_CARDS.map((feature, index) => (
            <article key={feature.title} className="terminal-frame module-card" style={{ animationDelay: `${index * 120}ms` }}>
              <div className="module-head">
                <span className="module-icon" aria-hidden="true">
                  {feature.icon}
                </span>
                <p className="module-title">{feature.title}</p>
              </div>
              <p>{feature.detail}</p>
              <div className="module-pulse" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="end-cta">
        <p className="section-kicker">VI / OPEN A MISSION</p>
        <h2>
          Activate your
          <span className="shimmer-text"> HELIO command center.</span>
        </h2>
        <p>
          One system to monitor, prioritize, and execute SEO at mission speed. Move from reactive
          reporting to autonomous growth operations with measurable weekly lift.
        </p>

        <article className="terminal-frame command-shell">
          <div className="shell-top">
            <span className="shell-dot" />
            <span className="shell-dot" />
            <span className="shell-dot" />
            <span>~/helio • bash</span>
          </div>
          <div className="shell-body shimmer-shell">
            <p>$ helio init mission-control</p>
            <p>✓ Integrations connected (GSC, GA4, Trends, GitHub)</p>
            <p>$ helio scan --domain yoursite.com</p>
            <p>✓ Priority map generated (technical, content, authority)</p>
            <p>$ helio deploy --mode autonomous</p>
            <p>✓ Weekly execution loop online</p>
          </div>
        </article>

        <div className="end-actions">
          <button className="join-btn" type="button" onClick={() => setIsModalOpen(true)}>
            Join Waitlist
          </button>
          <a className="docs-btn" href="https://github.com" target="_blank" rel="noreferrer">
            View GitHub Repo
          </a>
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Join HELIO waitlist">
          <section className="terminal-frame modal-panel">
            <div className="modal-header">
              <p>JOIN_WAITLIST.sh</p>
              <button type="button" className="close-btn" onClick={() => setIsModalOpen(false)}>
                CLOSE
              </button>
            </div>

            <form className="waitlist-form" onSubmit={onSubmit}>
              <label>
                Name
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Enter full name"
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="name@company.com"
                  required
                />
              </label>

              <label>
                Phone Number
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+1 555 555 1234"
                  required
                />
              </label>

              <label>
                Country
                <input
                  type="text"
                  value={form.country}
                  onChange={(event) => setForm({ ...form, country: event.target.value })}
                  placeholder="Country"
                  required
                />
              </label>

              <fieldset>
                <legend>Where did you hear about HELIO?</legend>
                <div className="checkbox-grid">
                  {HEARD_FROM_OPTIONS.map((option) => {
                    const id = `heard-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                    return (
                      <label key={option} htmlFor={id} className="check-option">
                        <input
                          id={id}
                          type="checkbox"
                          checked={form.heardFrom.includes(option)}
                          onChange={() => toggleHeardFrom(option)}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <button type="submit" disabled={!canSubmit || status === "loading"}>
                {status === "loading" ? "Processing..." : "Join Waitlist"}
              </button>

              <p className={`form-status ${status}`}>{message}</p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
