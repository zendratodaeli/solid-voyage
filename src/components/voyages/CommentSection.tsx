"use client";

/**
 * CommentSection — Rich text discussion for voyage calculations.
 *
 * Uses a compact TipTap editor with emoji picker for manager advisory input.
 * Comments are non-blocking — they don't affect the voyage workflow status.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Loader2,
  Trash2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Highlighter,
  Smile,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ─── Emoji Data ──────────────────────────────────────────────────────

const EMOJI_CATEGORIES = [
  {
    label: "Reactions",
    emojis: ["👍", "👎", "👏", "🙌", "💪", "🤝", "🎯", "💡", "🔥", "⭐", "✅", "❌", "⚠️", "💰", "📈", "📉"],
  },
  {
    label: "Maritime",
    emojis: ["🚢", "⚓", "🏗️", "⛽", "🌊", "🗺️", "📦", "🛢️", "🧭", "🌐", "🏴‍☠️", "⛵"],
  },
  {
    label: "Status",
    emojis: ["✨", "🎉", "🤔", "😊", "😟", "🚨", "📌", "📝", "🔔", "💬", "📊", "🏆"],
  },
];

// ─── Types ───────────────────────────────────────────────────────────

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentSectionProps {
  voyageId: string;
  currentUserId: string;
  currentUserName: string;
  permission: string;
}

// ─── Relative Time Helper ────────────────────────────────────────────

function fmtRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Emoji Picker ────────────────────────────────────────────────────

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="w-72 space-y-3">
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.label}>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">{category.label}</p>
          <div className="flex flex-wrap gap-1">
            {category.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center text-base transition-colors cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Compact Toolbar Button ──────────────────────────────────────────

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={cn("h-7 w-7 rounded", active && "bg-accent text-accent-foreground")}
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export function CommentSection({ voyageId, currentUserId, currentUserName, permission }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // TipTap editor — compact version for comments
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // No headings in comments
        horizontalRule: false,
        codeBlock: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Leave a comment…",
      }),
      Highlight.configure({ multicolor: false }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm max-w-none min-h-[60px] max-h-[200px] overflow-y-auto px-3 py-2 focus:outline-none [&_p]:mb-1 [&_p]:text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_li]:text-sm [&_strong]:font-semibold [&_em]:italic [&_mark]:bg-yellow-500/30 [&_mark]:px-0.5 [&_mark]:rounded",
      },
    },
    onUpdate: ({ editor: e }) => {
      setEditorIsEmpty(e.isEmpty);
    },
    immediatelyRender: false,
  });

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/voyages/${voyageId}/comments`);
      const data = await res.json();
      if (data.success) {
        setComments(data.data);
      }
    } catch {
      console.error("Failed to fetch comments");
    } finally {
      setIsLoading(false);
    }
  }, [voyageId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Submit comment
  const handleSubmit = async () => {
    if (!editor || editorIsEmpty) return;

    const content = editor.getHTML();
    setIsSubmitting(true);

    // Optimistic insert
    const tempComment: Comment = {
      id: `temp-${Date.now()}`,
      userId: currentUserId,
      userName: currentUserName,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setComments((prev) => [tempComment, ...prev]);
    editor.commands.clearContent();
    setEditorIsEmpty(true);

    try {
      const res = await fetch(`/api/voyages/${voyageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (data.success) {
        // Replace temp with real comment
        setComments((prev) =>
          prev.map((c) => (c.id === tempComment.id ? data.data : c))
        );
        toast.success("Comment posted");
      } else {
        // Rollback
        setComments((prev) => prev.filter((c) => c.id !== tempComment.id));
        toast.error(data.error || "Failed to post comment");
      }
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempComment.id));
      toast.error("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete comment
  const handleDelete = async (commentId: string) => {
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== commentId));

    try {
      const res = await fetch(
        `/api/voyages/${voyageId}/comments?commentId=${commentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.success) {
        setComments(prev);
        toast.error("Failed to delete comment");
      } else {
        toast.success("Comment deleted");
      }
    } catch {
      setComments(prev);
      toast.error("Failed to delete comment");
    }
  };

  // Insert emoji at cursor
  const handleEmojiSelect = (emoji: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
    setEmojiOpen(false);
  };

  const isAdmin = permission === "owner" || permission === "admin";

  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            Discussion
            {comments.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({comments.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comment Editor */}
          <div
            ref={editorContainerRef}
            className="rounded-lg border border-border bg-background overflow-hidden focus-within:border-primary/50 transition-colors"
          >
            {/* Mini Toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted/20">
              {editor && (
                <>
                  <ToolbarBtn
                    icon={Bold}
                    label="Bold"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive("bold")}
                  />
                  <ToolbarBtn
                    icon={Italic}
                    label="Italic"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive("italic")}
                  />
                  <ToolbarBtn
                    icon={UnderlineIcon}
                    label="Underline"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    active={editor.isActive("underline")}
                  />
                  <ToolbarBtn
                    icon={Highlighter}
                    label="Highlight"
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    active={editor.isActive("highlight")}
                  />
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <ToolbarBtn
                    icon={List}
                    label="Bullet List"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive("bulletList")}
                  />
                  <ToolbarBtn
                    icon={ListOrdered}
                    label="Numbered List"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive("orderedList")}
                  />
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <DropdownMenu open={emojiOpen} onOpenChange={setEmojiOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded"
                        type="button"
                      >
                        <Smile className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="p-3 w-auto"
                    >
                      <EmojiPicker onSelect={handleEmojiSelect} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              <div className="ml-auto">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !editor || editorIsEmpty}
                  className="h-7 gap-1.5 text-xs px-3"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Post
                </Button>
              </div>
            </div>

            {/* Editor Area */}
            <EditorContent editor={editor} />
          </div>

          {/* Comments List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-7 w-7 rounded-full bg-muted" />
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                  <div className="ml-9 space-y-1">
                    <div className="h-3 w-full bg-muted rounded" />
                    <div className="h-3 w-2/3 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-6">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No comments yet. Start a discussion about this voyage.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => {
                const isOwn = comment.userId === currentUserId;
                const canDelete = isOwn || isAdmin;

                return (
                  <div key={comment.id} className="group">
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                        {comment.userName.charAt(0).toUpperCase()}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate">
                            {comment.userName}
                            {isOwn && (
                              <span className="text-xs text-muted-foreground ml-1">(you)</span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {fmtRelativeTime(comment.createdAt)}
                          </span>
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(comment.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                        {/* Rich HTML content */}
                        <div
                          className="prose prose-invert prose-sm max-w-none text-sm [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_strong]:font-semibold [&_em]:italic [&_mark]:bg-yellow-500/30 [&_mark]:px-0.5 [&_mark]:rounded"
                          dangerouslySetInnerHTML={{ __html: comment.content }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
