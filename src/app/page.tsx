import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { 
  Ship, 
  TrendingUp, 
  Shield, 
  BarChart3, 
  ArrowRight,
  Anchor,
  Calculator,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { isPaidOrg } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { NewsletterForm } from "@/components/newsletter/NewsletterForm";

function toUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve the best org slug for dash redirects.
 * Premium → custom name slug, Free → Clerk's slug.
 */
async function resolveOrgSlug(orgName: string, orgSlug: string | null): Promise<string> {
  const paid = await isPaidOrg();
  return paid ? toUrlSlug(orgName) : (orgSlug ?? toUrlSlug(orgName));
}

export default async function HomePage() {
  const { userId, orgId } = await auth();
  
  // Resolve the dashboard link for authenticated users
  let dashboardHref = "/personal/dashboard";
  if (userId && orgId) {
    try {
      const client = await clerkClient();
      const org = await client.organizations.getOrganization({ organizationId: orgId });
      const slug = await resolveOrgSlug(org.name, org.slug);
      dashboardHref = `/${slug}/dashboard`;
    } catch {
      dashboardHref = "/personal/dashboard";
    }
  } else if (userId) {
    // User signed in but no active org — check their memberships
    // This handles newly invited users who haven't had their active org set yet
    try {
      const client = await clerkClient();
      const memberships = await client.users.getOrganizationMembershipList({ userId });
      if (memberships.data.length > 0) {
        // Use the most recently joined org (likely the invitation org)
        const latestOrg = memberships.data[0].organization;
        const slug = latestOrg.slug ?? toUrlSlug(latestOrg.name);
        dashboardHref = `/${slug}/dashboard`;
      }
    } catch {
      dashboardHref = "/personal/dashboard";
    }
  }

  // NOTE: Middleware handles the fast redirect to /{org}/dashboard.
  // Authenticated users reaching this page used /?landing to view it intentionally.

  // Fetch published CMS pages for footer
  let footerPages: { slug: string; title: string }[] = [];
  let platformName = "Solid Voyage";
  let footerText = "Premium Maritime Freight Intelligence.";
  try {
    [footerPages, ] = await Promise.all([
      prisma.sitePage.findMany({
        where: { isPublished: true },
        select: { slug: true, title: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      prisma.platformSettings.findUnique({ where: { id: "platform_settings" } }).then((s: { platformName: string; footerText: string | null } | null) => {
        if (s) {
          platformName = s.platformName;
          footerText = s.footerText || footerText;
        }
      }),
    ]);
  } catch {
    // Use defaults — DB might not have run migration yet
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-sm fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt="Solid Voyage" width={32} height={32} className="rounded-md" />
              <span className="text-xl font-bold">Solid Voyage</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {userId ? (
                <Link href={dashboardHref}>
                  <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2">
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/sign-in">
                    <Button variant="ghost">Sign In</Button>
                  </Link>
                  <Link href="/sign-up">
                    <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-sm text-muted-foreground">
              Premium Maritime Intelligence
            </span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Freight Decisions
            </span>
            <br />
            <span>Powered by Data</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
            The industry-leading voyage profitability and freight recommendation platform 
            built for shipbrokers, chartering managers, and vessel operators.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4">
            {userId ? (
              <Link href={dashboardHref}>
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2 h-14 px-8 text-lg">
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/sign-up">
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2 h-14 px-8 text-lg">
                  Start Free Trial
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            )}
            <Button size="lg" variant="outline" className="gap-2 h-14 px-8 text-lg">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Complete Voyage Intelligence
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every tool you need to make confident freight decisions, from break-even 
              calculations to risk-adjusted recommendations.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon={<Calculator className="h-8 w-8" />}
              title="Voyage Economics"
              description="Complete TCE, break-even freight, and P&L calculations with full transparency"
              gradient="from-blue-500/20 to-blue-600/5"
            />
            <FeatureCard 
              icon={<TrendingUp className="h-8 w-8" />}
              title="Freight Recommendations"
              description="AI-powered freight suggestions with market alignment and risk assessment"
              gradient="from-emerald-500/20 to-emerald-600/5"
            />
            <FeatureCard 
              icon={<Shield className="h-8 w-8" />}
              title="Risk Intelligence"
              description="Weather risk awareness, bunker volatility, and operational risk factors"
              gradient="from-amber-500/20 to-amber-600/5"
            />
            <FeatureCard 
              icon={<BarChart3 className="h-8 w-8" />}
              title="Sensitivity Analysis"
              description="Understand how bunker prices, speed, and time affect your bottom line"
              gradient="from-purple-500/20 to-purple-600/5"
            />
          </div>
        </div>
      </section>

      {/* Role-based Views */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent to-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Platform, Multiple Perspectives
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Whether you&apos;re a shipbroker, vessel operator, or owner, see the data 
              that matters most to your role.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <RoleCard 
              icon={<Users className="h-6 w-6" />}
              role="Shipbroker / Chartering"
              focus="Fixing Decisions"
              highlights={[
                "Break-even vs target freight",
                "Margin impact slider",
                "Fix / negotiate / reject signals"
              ]}
            />
            <RoleCard 
              icon={<Anchor className="h-6 w-6" />}
              role="Vessel Operator"
              focus="Operational Realism"
              highlights={[
                "Speed and consumption analysis",
                "Weather risk adjustments",
                "Delay cost impact"
              ]}
            />
            <RoleCard 
              icon={<TrendingUp className="h-6 w-6" />}
              role="Owner / Management"
              focus="Profit & Risk"
              highlights={[
                "Voyage profit summary",
                "Best / base / worst scenarios",
                "Decision confidence indicator"
              ]}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Make Smarter Freight Decisions?
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            Join maritime professionals who trust Solid Voyage for voyage profitability intelligence.
          </p>
          {userId ? (
            <Link href={dashboardHref}>
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2 h-14 px-8 text-lg">
                Go to Dashboard
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          ) : (
            <Link href="/sign-up">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2 h-14 px-8 text-lg">
                Get Started for Free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-8 rounded-2xl border border-border/50 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 backdrop-blur-sm">
            <h3 className="text-2xl font-bold mb-2">Stay in the Loop</h3>
            <p className="text-muted-foreground mb-6">
              Get maritime intelligence updates, platform news, and industry insights delivered to your inbox.
            </p>
            <NewsletterForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Dynamic CMS Page Links */}
          {footerPages.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              {footerPages.map((fp) => (
                <Link
                  key={fp.slug}
                  href={`/pages/${fp.slug}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {fp.title}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt={platformName} width={24} height={24} className="rounded-md" />
              <span className="font-semibold">{platformName}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {platformName}. {footerText}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  gradient 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  gradient: string;
}) {
  return (
    <div className={`p-6 rounded-2xl border border-border/50 bg-gradient-to-br ${gradient}`}>
      <div className="mb-4 text-primary">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function RoleCard({ 
  icon, 
  role, 
  focus, 
  highlights 
}: { 
  icon: React.ReactNode; 
  role: string; 
  focus: string;
  highlights: string[];
}) {
  return (
    <div className="p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <h3 className="font-semibold">{role}</h3>
          <p className="text-sm text-muted-foreground">Focus: {focus}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {highlights.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
