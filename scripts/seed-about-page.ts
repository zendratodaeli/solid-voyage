/**
 * Seed Script — Create the "About" site page
 *
 * Usage:  npx tsx scripts/seed-about-page.ts
 *
 * This inserts a fully formatted About page into the SitePage table.
 * If a page with slug "about" already exists, it will update it.
 */

// Load environment variables FIRST
import * as dotenv from "dotenv";
dotenv.config();

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const ABOUT_PAGE_HTML = `
<h1>About Solid Voyage</h1>

<p><strong>Premium Maritime Freight Intelligence — Built for the People Who Move the World's Cargo.</strong></p>

<p>Solid Voyage is a comprehensive voyage profitability and freight recommendation platform designed for maritime professionals. We combine real-time market data, intelligent route planning, and AI-powered decision support to help shipbrokers, chartering managers, vessel operators, and fleet owners make smarter, faster, and more profitable freight decisions — every single day.</p>

<hr>

<h2>Our Mission</h2>

<p>The maritime freight market moves fast. Decisions that once took hours of spreadsheet modeling now need to happen in minutes. Solid Voyage was born out of a simple conviction: <strong>maritime professionals deserve modern, purpose-built tools</strong> — not repurposed generic software.</p>

<p>Our mission is to give every chartering desk, operations team, and fleet management office a single platform where they can model voyages, evaluate freight opportunities, manage fleet schedules, and make data-backed decisions with full confidence.</p>

<hr>

<h2>What We Do</h2>

<p>Solid Voyage is an end-to-end maritime intelligence platform. Here's what's inside:</p>

<h3>Voyage Economics &amp; Profitability</h3>
<p>Model any voyage in minutes. Get full transparency on TCE (Time Charter Equivalent), break-even freight, P&amp;L projections, bunker cost breakdowns, and total voyage economics — across bulk carriers, tankers, container ships, gas carriers, and more.</p>

<h3>Freight Recommendations &amp; Decision Support</h3>
<p>Don't just calculate — decide. Our recommendation engine provides clear <strong>fix / negotiate / reject</strong> signals with confidence scoring, risk assessments (bunker volatility, weather, market alignment), and sensitivity analysis so you understand exactly how your bottom line reacts to changing conditions.</p>

<h3>Route Planner</h3>
<p>Plan multi-leg routes with real navigational intelligence. Our route planner integrates strategic passage routing (Suez, Panama, Kiel Canal, and more), ECA/SECA zone compliance, and accurate sea-lane distances — visualized on an interactive map with full waypoint control.</p>

<h3>AIS Fleet Dashboard</h3>
<p>Track your fleet in real time. See live vessel positions, voyage status, and port activity on a unified map — with optional auto-refresh for continuous operational monitoring.</p>

<h3>Fleet Schedule (Gantt Timeline)</h3>
<p>Visualize your fleet's deployment at a glance. Our Gantt-style timeline shows vessel availability, active voyages, idle periods, and upcoming commitments — with advanced filtering, sorting, and saved filter presets for rapid operational planning.</p>

<h3>Laytime &amp; Demurrage Calculator</h3>
<p>Calculate laytime, demurrage, and despatch with precision. Supports SHINC, SHEX, SSHEX, and SHEXUU terms, NOR tendering, reversible laytime, and detailed time-sheet event tracking.</p>

<h3>AI Copilot</h3>
<p>An AI assistant that understands maritime operations. Parse cargo inquiry emails, match vessels to fixtures, explore "what-if" scenarios, and get instant answers — all within a conversational interface powered by large language models.</p>

<h3>Fleet Performance Analytics</h3>
<p>Monitor KPIs across your fleet: voyage profitability trends, fuel consumption patterns, utilization rates, and carbon intensity metrics — all in one analytics dashboard.</p>

<h3>Scenario Comparison</h3>
<p>Run multiple what-if scenarios against the same voyage. Adjust speed, fuel prices, port days, and weather margins to see exactly how each variable impacts your TCE and voyage P&amp;L.</p>

<h3>EU ETS &amp; Carbon Compliance</h3>
<p>Stay ahead of regulations. Solid Voyage automatically calculates CO₂ emissions per voyage, applies EU ETS carbon pricing, and computes CII (Carbon Intensity Indicator) ratings using IMO MEPC.308 emission factors.</p>

<h3>Market Data Management</h3>
<p>Maintain global fuel benchmarks, carbon emission factors, and freight rate references — with organization-level overrides so each team works with the numbers that matter to them.</p>

<hr>

<h2>Built for Maritime Professionals</h2>

<table>
<thead>
<tr>
<th>Role</th>
<th>How Solid Voyage Helps</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Shipbrokers &amp; Chartering Managers</strong></td>
<td>Evaluate fixtures instantly. Compare break-even freight to offered rates, assess margins, and get clear fix/reject recommendations.</td>
</tr>
<tr>
<td><strong>Vessel Operators</strong></td>
<td>Model realistic voyage economics with speed and consumption analysis, weather risk adjustments, crane usage, and port delay impact.</td>
</tr>
<tr>
<td><strong>Owners &amp; Fleet Management</strong></td>
<td>See profit summaries, best/base/worst scenarios, fleet-wide KPIs, and decision confidence indicators — all in one view.</td>
</tr>
<tr>
<td><strong>Commercial Teams</strong></td>
<td>Use the AI Copilot to parse cargo inquiry emails, match the best vessel, and generate voyage estimates in seconds.</td>
</tr>
</tbody>
</table>

<hr>

<h2>Designed for Teams &amp; Organizations</h2>

<p>Solid Voyage is built for multi-tenant operations from the ground up. Each organization gets its own workspace with:</p>

<ul>
<li><strong>Role-based access</strong> — Invite team members with appropriate permissions.</li>
<li><strong>Voyage sharing &amp; approval chains</strong> — Share individual voyages with specific teammates and configure multi-level approval workflows (Operator → Manager → Director).</li>
<li><strong>Organization-specific market data</strong> — Override global benchmarks with your own fuel prices and carbon factors.</li>
<li><strong>Custom theming</strong> — Brand your workspace with your organization's accent color and display currency (USD, EUR, GBP, NOK).</li>
<li><strong>Audit logging</strong> — Full activity trail for every vessel and voyage change.</li>
</ul>

<hr>

<h2>The Technology Behind It</h2>

<p>Solid Voyage is built on a modern, performance-first technology stack:</p>

<ul>
<li><strong>Next.js</strong> with React — for blazing-fast, server-rendered pages and real-time interactions.</li>
<li><strong>Neon (Serverless PostgreSQL)</strong> — a scalable, globally distributed database.</li>
<li><strong>Clerk Authentication</strong> — enterprise-grade identity, SSO, and team management.</li>
<li><strong>Commercial Navigation APIs</strong> — for industry-standard sea-lane distances and passage routing.</li>
<li><strong>AI SDK</strong> — powering the maritime AI Copilot with structured tool calls and contextual reasoning.</li>
<li><strong>Leaflet Maps</strong> — interactive, high-performance map visualizations for routes and fleet tracking.</li>
</ul>

<p>Every calculation is transparent. Every number is auditable. No black boxes.</p>

<hr>

<h2>Our Commitment</h2>

<p>We believe the maritime industry deserves software that's as sophisticated as the trade it supports. That means:</p>

<ul>
<li><strong>Accuracy first.</strong> Every TCE, every break-even freight, every emission factor is calculated using industry-standard formulas and IMO-recognized coefficients.</li>
<li><strong>Transparency always.</strong> Full cost breakdowns, assumption logs, and calculation audit trails — so you know exactly how every number was derived.</li>
<li><strong>Speed matters.</strong> From page load to calculation result, everything is optimized to keep up with the pace of a chartering desk.</li>
<li><strong>Your data, your control.</strong> Organization data is fully isolated. Your voyages, vessels, and market data are never shared across tenants.</li>
</ul>

<hr>

<h2>Ready to Make Smarter Freight Decisions?</h2>

<p>Join maritime professionals who trust Solid Voyage for voyage profitability intelligence.</p>
`.trim();

async function main() {
  console.log("🚀 Seeding About page...");

  const existing = await prisma.sitePage.findUnique({
    where: { slug: "about" },
  });

  if (existing) {
    const updated = await prisma.sitePage.update({
      where: { slug: "about" },
      data: {
        title: "About",
        content: ABOUT_PAGE_HTML,
        metaDesc:
          "Solid Voyage is a premium maritime freight intelligence platform for shipbrokers, chartering managers, vessel operators, and fleet owners. Voyage economics, route planning, AI copilot, and more.",
        isPublished: true,
        sortOrder: 10,
        icon: "Info",
        updatedBy: "system-seed",
      },
    });
    console.log(`✅ Updated existing About page (id: ${updated.id})`);
  } else {
    const created = await prisma.sitePage.create({
      data: {
        slug: "about",
        title: "About",
        content: ABOUT_PAGE_HTML,
        metaDesc:
          "Solid Voyage is a premium maritime freight intelligence platform for shipbrokers, chartering managers, vessel operators, and fleet owners. Voyage economics, route planning, AI copilot, and more.",
        isPublished: true,
        sortOrder: 10,
        icon: "Info",
        updatedBy: "system-seed",
      },
    });
    console.log(`✅ Created About page (id: ${created.id})`);
  }

  console.log("📄 Page will be available at: /pages/about");
}

main()
  .catch((err) => {
    console.error("❌ Failed to seed About page:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
