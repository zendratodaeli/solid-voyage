"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "already" | "expired" | "error">("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing confirmation token. Please use the link from your email.");
      return;
    }

    fetch(`/api/newsletter/confirm?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          if (data.alreadyConfirmed) {
            setStatus("already");
          } else {
            setStatus("success");
          }
          setEmail(data.email || "");
          setMessage(data.message);
        } else if (res.status === 410) {
          setStatus("expired");
          setMessage(data.error);
        } else {
          setStatus("error");
          setMessage(data.error || "Something went wrong.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [token]);

  const icons = {
    loading: (
      <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
        <svg className="h-8 w-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    ),
    success: (
      <div className="h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6">
        <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
    already: (
      <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6">
        <svg className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    expired: (
      <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
        <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    error: (
      <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    ),
  };

  const titles = {
    loading: "Confirming...",
    success: "You're Confirmed!",
    already: "Already Confirmed",
    expired: "Link Expired",
    error: "Something Went Wrong",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card/80 backdrop-blur border border-border rounded-2xl p-8 text-center shadow-xl">
        {icons[status]}
        <h1 className="text-2xl font-bold mb-3">{titles[status]}</h1>
        <p className="text-muted-foreground text-sm mb-6">{message}</p>
        {email && status === "success" && (
          <p className="text-xs text-muted-foreground mb-6">
            Subscribed as <strong className="text-foreground">{email}</strong>
          </p>
        )}
        <Link
          href="/"
          className="inline-flex items-center px-6 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmSubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
