const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.sitePage.findUnique({ where: { slug: 'about' } });
  if (existing) {
    console.log('About page already exists, skipping...');
    return;
  }

  const aboutContent = `
<h2>About Solid Voyage</h2>
<p>Solid Voyage is a <strong>premium maritime freight intelligence platform</strong> designed for vessel operators, chartering teams, and commercial shipping professionals who need precise, data-driven voyage analysis.</p>

<h2>What We Do</h2>
<p>We provide a comprehensive suite of tools that transform complex maritime operations data into actionable business intelligence:</p>
<ul>
<li><strong>Voyage Planning &amp; Analysis</strong> — Calculate TCE (Time Charter Equivalent), evaluate voyage profitability, and compare scenarios across multiple freight rate units (per MT, per TEU, Lump Sum, Worldscale).</li>
<li><strong>Route Optimization</strong> — Smart routing through strategic passages (Suez, Panama, Cape of Good Hope) with SECA compliance, weather adjustments, and multi-fuel cost modeling.</li>
<li><strong>Fleet Scheduling</strong> — Gantt-style timeline visualization of fleet deployment, vessel availability, and idle time analysis for better asset utilization.</li>
<li><strong>AIS Fleet Tracking</strong> — Real-time vessel position monitoring with automatic status detection, speed tracking, and ETA calculations.</li>
<li><strong>Market Intelligence</strong> — Customizable market data benchmarks for fuel prices, port costs, and freight rates that organizations can tailor to their operations.</li>
<li><strong>EU ETS Compliance</strong> — Automated carbon emission calculations with EU Emissions Trading Scheme cost integration for regulatory compliance.</li>
</ul>

<h2>Our Mission</h2>
<p>Maritime shipping moves over <strong>80% of global trade</strong>, yet many operators still rely on spreadsheets and manual calculations for critical voyage decisions. Solid Voyage bridges this gap by providing institutional-grade analytics in an intuitive, modern interface.</p>

<blockquote>We believe that better data leads to better decisions, and better decisions lead to more profitable and sustainable shipping operations.</blockquote>

<h2>Built for Maritime Professionals</h2>
<p>Solid Voyage is built by people who understand the maritime industry. Our platform supports:</p>
<ul>
<li><strong>Multi-tenant organizations</strong> — Each company operates in its own secure workspace with custom branding and role-based access control.</li>
<li><strong>Approval workflows</strong> — Structured voyage approval chains from analysts to directors.</li>
<li><strong>Vessel profile management</strong> — AI-powered document parsing for rapid vessel specification onboarding.</li>
<li><strong>Laytime calculations</strong> — Demurrage and despatch tracking with customizable rate structures.</li>
<li><strong>PDF reporting</strong> — Professional voyage reports for stakeholder communication and audit trails.</li>
</ul>

<h2>Technology</h2>
<p>Solid Voyage is built on a modern technology stack:</p>
<ul>
<li><strong>Next.js 16</strong> with React 19 for a fast, responsive user experience</li>
<li><strong>Neon PostgreSQL</strong> for reliable, scalable data storage</li>
<li><strong>Clerk Authentication</strong> for enterprise-grade security</li>
<li><strong>Real-time AIS integration</strong> for live fleet monitoring</li>
<li><strong>AI-powered features</strong> via OpenAI for intelligent vessel parsing and cargo analysis</li>
</ul>

<h2>Get Started</h2>
<p>Whether you are a shipowner managing a fleet, a charterer evaluating fixtures, or a commercial operator optimizing voyage economics — Solid Voyage gives you the tools to make confident, data-backed decisions.</p>
<p><a href="/">Return to the homepage</a> to learn more, or <a href="/pages/contact">contact us</a> to schedule a demo.</p>
`;

  await prisma.sitePage.create({
    data: {
      slug: 'about',
      title: 'About',
      content: aboutContent,
      metaDesc: 'Learn about Solid Voyage — premium maritime freight intelligence platform for voyage planning, fleet management, and commercial shipping analytics.',
      isPublished: true,
      sortOrder: 1,
      updatedBy: 'system',
    },
  });

  console.log('About page created successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
