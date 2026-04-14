"use client";

/**
 * Contact Form — Public rich text contact form
 *
 * Uses a simplified TipTap editor for the message body.
 * Sends to admin via /api/contact.
 */

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Mail,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false, // Keep it simple — no headings in contact messages
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline cursor-pointer" },
      }),
      Placeholder.configure({
        placeholder: "Write your message here... You can format text with bold, italic, and lists.",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none focus:outline-none min-h-[140px] px-4 py-3 text-sm",
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !editor?.getText().trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: editor.getHTML(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Message sent successfully!");
        setName("");
        setEmail("");
        setSubject("");
        editor.commands.clearContent();
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to send message.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-green-400">Message Sent!</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setStatus("idle"); setMessage(""); }}
          className="mt-2"
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name & Email — 2 columns */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name" className="text-sm font-medium flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" /> Name
          </Label>
          <Input
            id="contact-name"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={status === "loading"}
            className="h-10 bg-background/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email" className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email
          </Label>
          <Input
            id="contact-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={status === "loading"}
            className="h-10 bg-background/50"
          />
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-2">
        <Label htmlFor="contact-subject" className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Subject
        </Label>
        <Input
          id="contact-subject"
          placeholder="What is your message about?"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          disabled={status === "loading"}
          className="h-10 bg-background/50"
        />
      </div>

      {/* Rich Text Message */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Message</Label>
        <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
          {/* Mini Toolbar */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-muted/20">
            <ToolbarBtn
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold"
              disabled={status === "loading"}
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic"
              disabled={status === "loading"}
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="Underline"
              disabled={status === "loading"}
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <ToolbarBtn
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title="Bullet list"
              disabled={status === "loading"}
            >
              <List className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
              disabled={status === "loading"}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <ToolbarBtn
              active={editor?.isActive("link")}
              onClick={() => {
                if (editor?.isActive("link")) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  const url = prompt("Enter URL:");
                  if (url) editor?.chain().focus().setLink({ href: url }).run();
                }
              }}
              title="Add link"
              disabled={status === "loading"}
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </ToolbarBtn>
          </div>
          {/* Editor */}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Error message */}
      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={status === "loading" || !name.trim() || !email.trim() || !subject.trim() || !editor?.getText().trim()}
        className="w-full h-11 gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Send Message
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Toolbar Button ──────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}
