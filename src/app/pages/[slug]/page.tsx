/**
 * Public Page Renderer — Dynamic CMS Pages
 *
 * Renders published site pages at /pages/[slug] URLs (e.g., /pages/privacy-policy, /pages/contact).
 * Content is managed by the Super Admin through the CMS.
 */

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactSection } from "@/components/contact/ContactSection";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Generate SEO metadata from CMS page data.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const page = await prisma.sitePage.findUnique({
      where: { slug },
      select: { title: true, metaDesc: true },
    });

    if (!page) {
      return { title: "Page Not Found | Solid Voyage" };
    }

    return {
      title: `${page.title} | Solid Voyage`,
      description: page.metaDesc || `${page.title} — Solid Voyage maritime platform.`,
    };
  } catch {
    return { title: "Solid Voyage" };
  }
}

export const dynamic = "force-dynamic";

export default async function PublicPage({ params }: PageProps) {
  const { slug } = await params;

  // Fetch the page
  let page;
  try {
    page = await prisma.sitePage.findUnique({
      where: { slug },
    });
  } catch {
    notFound();
  }

  if (!page || !page.isPublished) {
    notFound();
  }

  // Fetch platform settings for branding
  let platformName = "Solid Voyage";
  let footerText = "Premium Maritime Freight Intelligence.";
  let logoUrl: string | null = null;
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "platform_settings" },
    });
    if (settings) {
      platformName = settings.platformName;
      footerText = settings.footerText || footerText;
      logoUrl = settings.logoUrl;
    }
  } catch {
    // Use defaults
  }

  // Fetch published pages for footer navigation
  let footerPages: { slug: string; title: string }[] = [];
  try {
    footerPages = await prisma.sitePage.findMany({
      where: { isPublished: true },
      select: { slug: true, title: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
  } catch {
    // Use empty
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900 flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {logoUrl ? (
                <img src={logoUrl} alt={platformName} className="h-7 w-7 rounded-md object-contain" />
              ) : (
                <Image src="/logo.svg" alt={platformName} width={28} height={28} className="rounded-md" />
              )}
              <span className="text-lg font-bold">{platformName}</span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="flex-1 py-12 px-4">
        <article className="max-w-4xl mx-auto">
          {/* Page Header */}
          <header className="mb-10">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              {page.title}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Last updated:{" "}
                {new Date(page.updatedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="mt-6 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
          </header>

          {/* Rich Text Content */}
          <div
            className="prose prose-invert max-w-none
              [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-8
              [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6
              [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4
              [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-foreground/90
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
              [&_li]:mb-2 [&_li]:text-foreground/90
              [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-6
              [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
              [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-6
              [&_hr]:my-8 [&_hr]:border-border
              [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary/80
              [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-6
              [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2
              [&_mark]:bg-yellow-500/30 [&_mark]:text-foreground [&_mark]:px-1 [&_mark]:rounded"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />

          {/* Contact Form — only rendered on /pages/contact */}
          {slug === "contact" && <ContactSection />}
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4 mt-auto">
        <div className="max-w-4xl mx-auto">
          {/* Footer Page Links */}
          {footerPages.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              {footerPages.map((fp) => (
                <Link
                  key={fp.slug}
                  href={`/pages/${fp.slug}`}
                  className={`text-sm transition-colors duration-200 ${
                    fp.slug === slug
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fp.title}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt={platformName} className="h-6 w-6 rounded-md object-contain" />
              ) : (
                <Image src="/logo.svg" alt={platformName} width={24} height={24} className="rounded-md" />
              )}
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
