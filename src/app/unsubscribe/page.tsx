"use client";

/**
 * Public Unsubscribe Page
 * 
 * Accessible via /unsubscribe?token=xxx from newsletter email links.
 * Calls the API and shows the result.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { MailX, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnsubscribePage() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setErrorMsg("Missing unsubscribe token. Please use the link from your email.");
      return;
    }

    fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          if (data.email) setEmail(data.email);
          setStatus(data.message?.includes("already") ? "already" : "success");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Failed to unsubscribe.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
          {status === "loading" && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Processing...</h1>
              <p className="text-muted-foreground">Unsubscribing you from the newsletter.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Unsubscribed</h1>
              <p className="text-muted-foreground mb-1">
                You&apos;ve been successfully unsubscribed from the Solid Voyage newsletter.
              </p>
              {email && (
                <p className="text-sm text-muted-foreground/60 mb-6">{email}</p>
              )}
              <p className="text-sm text-muted-foreground">
                You won&apos;t receive any more newsletters. If this was a mistake, you can re-subscribe anytime.
              </p>
            </>
          )}

          {status === "already" && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
                <MailX className="h-8 w-8 text-amber-500" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Already Unsubscribed</h1>
              <p className="text-muted-foreground">
                You&apos;re already unsubscribed from the newsletter. No action needed.
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Something Went Wrong</h1>
              <p className="text-muted-foreground">{errorMsg}</p>
            </>
          )}

          <div className="mt-8">
            <Link href="/">
              <Button variant="outline" className="gap-2">
                ← Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
