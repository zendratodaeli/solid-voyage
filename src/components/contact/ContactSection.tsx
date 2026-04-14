"use client";

/**
 * Contact Section — Client wrapper that lazy-loads the contact form.
 * Used by the CMS /pages/contact server component.
 */

import { ContactForm } from "@/components/contact/ContactForm";

export function ContactSection() {
  return (
    <div className="mt-12 pt-10 border-t border-border/30">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Send Us a Message</h2>
        <p className="text-sm text-muted-foreground">
          Fill out the form below and we will get back to you as soon as possible.
        </p>
      </div>
      <div className="max-w-2xl">
        <ContactForm />
      </div>
    </div>
  );
}
