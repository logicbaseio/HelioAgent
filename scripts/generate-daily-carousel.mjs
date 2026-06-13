#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = "/Users/Hamzaa/Documents/Helio";
const CONTENT = path.join(ROOT, "Content");
const STATE_FILE = path.join(CONTENT, "daily_carousels/.state/title-theme.json");
const TEMPLATE_HTML = path.join(CONTENT, "helio_aeo_carousel.html");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function getNextTitleTheme() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return raw.lastTitleTheme === "dark" ? "light" : "dark";
  } catch {
    // Last published carousel in this thread used dark title slide.
    return "light";
  }
}

function saveTitleTheme(theme) {
  ensureDir(path.dirname(STATE_FILE));
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ lastTitleTheme: theme, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

async function main() {
  const date = today();
  const outDir = path.join(CONTENT, "daily_carousels", date);
  ensureDir(outDir);

  const titleTheme = getNextTitleTheme();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`file://${TEMPLATE_HTML}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  const topic = {
    hook: "SEO vs AEO/GEO: how modern teams allocate for compounding growth.",
    cta: "Use this model in your next quarterly content plan.",
  };

  const slideContent = {
    s0: { eyebrow: "HELIO Value Series", hl: "SEO vs AEO/GEO:\nhow modern teams\nallocate for\ncompounding growth." },
    s1: { eyebrow: "Operating Principle", hl: "SEO captures\nactive demand.\nAEO/GEO shape\nassisted demand." },
    s2: { eyebrow: "SEO Mandate", hl: "Own intent\nclusters,\ntechnical health,\nand topical authority." },
    s3: { eyebrow: "AEO Mandate", hl: "Publish direct,\nexpert-backed\nanswers to\nbuyer questions." },
    s4: { eyebrow: "GEO Mandate", hl: "Be quotable in\ngenerative\nsummaries\nand overviews." },
    s5: { eyebrow: "Resource Model", hl: "A practical split\nfor most B2B\ncontent teams." },
    s6: { eyebrow: "Measurement", hl: "Track rankings,\ncitation share,\nand qualified\npipeline impact." },
    s7: { eyebrow: "HELIO Framework", hl: "One system.\nThree channels.\nHigher visibility.\nBetter conversion." },
  };

  await page.evaluate(
    ({ content, titleTheme }) => {
      const setText = (el, text) => {
        if (!el || !text) return;
        el.innerHTML = text.replace(/\n/g, "<br>");
      };

      // Fix broken template artifact where @keyframes text appears as a node.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const removeNodes = [];
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.nodeValue && n.nodeValue.includes("@keyframes ticker")) removeNodes.push(n);
      }
      removeNodes.forEach((n) => n.remove());

      // Enforce readable text colors on light slides.
      const style = document.createElement("style");
      style.textContent = `
        .light .hl, .light .body, .light .eyebrow, .light .tag, .light .li span, .light .li-num, .light .pill-lbl, .light .pill-num { color:#080808 !important; }
        .light .li { border-color:rgba(8,8,8,0.18) !important; }
      `;
      document.head.appendChild(style);

      // Strict alternation from title slide: s0 theme, then flip each slide.
      for (let i = 0; i < 8; i++) {
        const slide = document.getElementById(`s${i}`);
        if (!slide) continue;
        const dark = titleTheme === "dark" ? i % 2 === 0 : i % 2 === 1;
        slide.classList.remove("dark", "light");
        slide.classList.add(dark ? "dark" : "light");
      }

      Object.entries(content).forEach(([id, v]) => {
        const s = document.getElementById(id);
        if (!s) return;
        setText(s.querySelector(".eyebrow"), v.eyebrow);
        setText(s.querySelector(".hl"), v.hl);
      });

      const bodyMap = {
        s1: "Search still drives discovery, but AI now shapes shortlists before users click through.",
        s2: "Prioritize indexable architecture, internal linking, and depth on high-intent topics.",
        s3: "Answer buyer objections explicitly with concise, attributable, and expert-reviewed responses.",
        s4: "Structure perspective content so LLMs can quote it accurately in generated summaries.",
        s6: "Use one dashboard that joins rankings, citation share, and assisted pipeline quality.",
      };
      Object.entries(bodyMap).forEach(([id, txt]) => setText(document.querySelector(`#${id} .body`), txt));

      const listMap = {
        s7: [
          ["→", "Create one editorial system feeding SEO, AEO, and GEO together"],
          ["→", "Tie weekly updates to real buyer questions from sales and support"],
          ["→", "Measure outcomes by qualified pipeline, not vanity traffic alone"],
        ],
      };
      Object.entries(listMap).forEach(([id, items]) => {
        const lst = document.querySelector(`#${id} .lst`);
        if (!lst) return;
        lst.innerHTML = "";
        items.forEach(([n, t]) => {
          const li = document.createElement("div");
          li.className = "li";
          li.innerHTML = `<span class="li-num" style="color:inherit">${n}</span><span style="color:inherit">${t}</span>`;
          lst.appendChild(li);
        });
      });

      // Remove existing mascot overlays completely as requested.
      document.querySelectorAll(".helio-mascot-overlay").forEach((n) => n.remove());

      // Creative pointer cards on slide 6 (index s5).
      const s5 = document.getElementById("s5");
      const s5Body = s5?.querySelector(".content");
      if (s5Body) {
        let cards = s5Body.querySelector(".cards");
        if (!cards) {
          cards = document.createElement("div");
          cards.className = "cards";
          cards.style.display = "grid";
          cards.style.gridTemplateColumns = "1fr";
          cards.style.gap = "10px";
          cards.style.marginTop = "16px";
          s5Body.appendChild(cards);
        }
        cards.innerHTML = "";
        [
          ["60%", "SEO: technical + intent clusters + evergreen pages"],
          ["25%", "AEO: expert Q&A answers mapped to buyer friction"],
          ["15%", "GEO: quotable summaries + perspective content"],
        ].forEach(([n, t]) => {
          const c = document.createElement("div");
          c.style.border = "1px solid rgba(8,8,8,0.22)";
          c.style.background = "rgba(8,8,8,0.04)";
          c.style.padding = "12px 14px";
          c.style.borderRadius = "4px";
          c.innerHTML = `<div style=\"font-size:34px;font-weight:800;line-height:1;color:#080808;\">${n}</div><div style=\"font-size:15px;line-height:1.35;color:#101010;margin-top:4px;\">${t}</div>`;
          cards.appendChild(c);
        });
      }

      // Keep subtle orbit motifs where relevant (title and final slide).
      [0, 7].forEach((idx) => {
        const slide = document.getElementById(`s${idx}`);
        if (!slide) return;
        const orbit = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        orbit.setAttribute("viewBox", "0 0 220 220");
        orbit.setAttribute("width", "160");
        orbit.setAttribute("height", "160");
        orbit.style.position = "absolute";
        orbit.style.right = "20px";
        orbit.style.bottom = idx === 0 ? "24px" : "30px";
        orbit.style.opacity = "0.16";
        orbit.style.zIndex = "6";
        orbit.innerHTML = `
          <circle cx="110" cy="110" r="98" fill="none" stroke="${slide.classList.contains("dark") ? "#C8FF00" : "#080808"}" stroke-width="1" stroke-dasharray="6 8"/>
          <circle cx="110" cy="110" r="62" fill="none" stroke="${slide.classList.contains("dark") ? "#C8FF00" : "#080808"}" stroke-width="1" stroke-dasharray="4 7"/>
          <circle cx="110" cy="110" r="28" fill="none" stroke="${slide.classList.contains("dark") ? "#C8FF00" : "#080808"}" stroke-width="1"/>
        `;
        slide.appendChild(orbit);
      });
    },
    { content: slideContent, titleTheme },
  );

  const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
  for (let i = 0; i < total; i++) {
    await page.evaluate(({ idx, totalSlides }) => {
      document.querySelectorAll(".slide").forEach((el, j) => el.classList.toggle("active", j === idx));
      const counter = document.getElementById("counter");
      if (counter) counter.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
    }, { idx: i, totalSlides: total });
    const slide = page.locator(`#s${i}`);
    await slide.waitFor({ state: "visible" });
    const base = `HELIO_Fresh_${date}_Slide_${String(i + 1).padStart(2, "0")}`;
    await slide.screenshot({ path: path.join(outDir, `${base}.png`), type: "png" });
    await slide.screenshot({ path: path.join(outDir, `${base}.jpg`), type: "jpeg", quality: 95 });
  }

  const caption = [
    "Value-first AEO framework for operators.",
    "",
    "This carousel breaks down a practical weekly loop to improve how AI systems discover, trust, and cite your business.",
    "",
    topic.cta,
    "",
    "#AEO #SEO #GEO #BusinessGrowth #ContentStrategy #Helio",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "caption.txt"), caption, "utf8");
  fs.writeFileSync(
    path.join(outDir, "generation-meta.json"),
    JSON.stringify({ date, titleTheme, topic }, null, 2),
    "utf8",
  );

  saveTitleTheme(titleTheme);
  await browser.close();
  console.log(JSON.stringify({ outDir, titleTheme }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
