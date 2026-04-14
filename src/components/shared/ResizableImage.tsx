"use client";

/**
 * ResizableImage — Custom TipTap Image Extension
 *
 * Extends TipTap Image with:
 * - Delete (X) button on hover
 * - Drag-to-resize handle (bottom-right corner)
 * - Size preset buttons (25%, 50%, 75%, 100%)
 * - Horizontal alignment (left, center, right)
 * - Vertical spacing (compact, normal, spacious)
 * - Aspect ratio presets (Free, 16:9, 4:3, 3:2, 1:1, 2:1)
 * - Editable caption (figcaption)
 * - All values stored as node attributes for persistence
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useCallback, useRef } from "react";
import {
  X,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronsUpDown,
  Minus,
  Equal,
  ChevronsDown,
  RectangleHorizontal,
  Type,
} from "lucide-react";

// ─── Node Extension ─────────────────────────────────────────────
export const ResizableImage = Node.create({
  name: "image",

  group: "block",
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      align: { default: "center" },
      spacing: { default: "normal" },
      aspectRatio: { default: null },
      caption: { default: null },
    };
  },

  parseHTML() {
    return [
      // Parse <figure> wrapping
      {
        tag: "figure",
        contentElement: "img",
        getAttrs(dom) {
          const element = dom as HTMLElement;
          const img = element.querySelector("img");
          const figcaption = element.querySelector("figcaption");
          if (!img) return false;

          const style = img.getAttribute("style") || "";
          const figStyle = element.getAttribute("style") || "";

          let align = "center";
          const checkStyle = figStyle || style;
          if (checkStyle.includes("margin-right: auto") && !checkStyle.includes("margin-left: auto")) {
            align = "left";
          } else if (checkStyle.includes("margin-left: auto") && !checkStyle.includes("margin-right: auto")) {
            align = "right";
          }

          const spacing = img.getAttribute("data-spacing") || element.getAttribute("data-spacing") || "normal";
          const arMatch = style.match(/aspect-ratio:\s*([\d/]+)/);
          const aspectRatio = arMatch ? arMatch[1] : null;
          const caption = figcaption?.textContent || null;

          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            title: img.getAttribute("title"),
            width: img.style.width || element.style.width || null,
            align,
            spacing,
            aspectRatio,
            caption,
          };
        },
      },
      // Fallback: bare <img>
      {
        tag: "img[src]",
        getAttrs(dom) {
          const element = dom as HTMLElement;
          const style = element.getAttribute("style") || "";

          let align = "center";
          if (style.includes("margin-right: auto") && !style.includes("margin-left: auto")) {
            align = "left";
          } else if (style.includes("margin-left: auto") && !style.includes("margin-right: auto")) {
            align = "right";
          }

          const spacing = element.getAttribute("data-spacing") || "normal";
          const arMatch = style.match(/aspect-ratio:\s*([\d/]+)/);
          const aspectRatio = arMatch ? arMatch[1] : null;

          return { align, spacing, aspectRatio };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, align, spacing, aspectRatio, caption, ...rest } = HTMLAttributes;

    // Image styles
    const imgStyles: string[] = [];
    imgStyles.push(width ? `width: ${width}` : "max-width: 100%");
    imgStyles.push("max-width: 100%");
    imgStyles.push("display: block");
    imgStyles.push("border-radius: 0.5rem");

    if (aspectRatio) {
      imgStyles.push(`aspect-ratio: ${aspectRatio}`, "object-fit: cover");
    }

    // Figure styles (alignment + spacing)
    const figStyles: string[] = [];
    figStyles.push(width ? `width: ${width}` : "max-width: 100%");
    figStyles.push("max-width: 100%");

    if (align === "left") {
      figStyles.push("margin-left: 0", "margin-right: auto");
    } else if (align === "right") {
      figStyles.push("margin-left: auto", "margin-right: 0");
    } else {
      figStyles.push("margin-left: auto", "margin-right: auto");
    }

    const spacingMap: Record<string, string> = {
      compact: "0.5rem",
      normal: "1rem",
      spacious: "2.5rem",
    };
    const vSpace = spacingMap[spacing] || spacingMap.normal;
    figStyles.push(`margin-top: ${vSpace}`, `margin-bottom: ${vSpace}`);

    // Build <figure> with optional <figcaption>
    const children: (string | Record<string, unknown> | (string | Record<string, unknown>)[])[] = [
      [
        "img",
        mergeAttributes(rest, {
          style: imgStyles.join("; ") + ";",
          "data-spacing": spacing || "normal",
        }),
      ],
    ];

    if (caption) {
      children.push([
        "figcaption",
        {
          style: "text-align: center; font-size: 0.875rem; color: #9ca3af; margin-top: 0.5rem; font-style: italic;",
        },
        caption,
      ]);
    }

    return [
      "figure",
      { style: figStyles.join("; ") + ";", class: "image-figure" },
      ...children,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

// ─── Size Presets ────────────────────────────────────────────────
const SIZE_PRESETS = [
  { label: "S", value: "25%", tooltip: "Small (25%)" },
  { label: "M", value: "50%", tooltip: "Medium (50%)" },
  { label: "L", value: "75%", tooltip: "Large (75%)" },
  { label: "Full", value: "100%", tooltip: "Full width" },
] as const;

// ─── Alignment Options ──────────────────────────────────────────
const ALIGN_OPTIONS = [
  { value: "left", icon: AlignLeft, tooltip: "Align left" },
  { value: "center", icon: AlignCenter, tooltip: "Align center" },
  { value: "right", icon: AlignRight, tooltip: "Align right" },
] as const;

// ─── Spacing Options ────────────────────────────────────────────
const SPACING_OPTIONS = [
  { value: "compact", icon: Minus, tooltip: "Compact spacing" },
  { value: "normal", icon: Equal, tooltip: "Normal spacing" },
  { value: "spacious", icon: ChevronsDown, tooltip: "Spacious spacing" },
] as const;

// ─── Aspect Ratio Options ───────────────────────────────────────
const ASPECT_RATIO_OPTIONS = [
  { label: "Free", value: null, tooltip: "Original ratio (no constraint)" },
  { label: "16:9", value: "16/9", tooltip: "Widescreen (16:9)" },
  { label: "4:3", value: "4/3", tooltip: "Standard (4:3)" },
  { label: "3:2", value: "3/2", tooltip: "Photo (3:2)" },
  { label: "1:1", value: "1/1", tooltip: "Square (1:1)" },
  { label: "2:1", value: "2/1", tooltip: "Ultra-wide (2:1)" },
] as const;

// ─── Alignment class map ────────────────────────────────────────
const alignClassMap: Record<string, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

// ─── Spacing class map ──────────────────────────────────────────
const spacingClassMap: Record<string, string> = {
  compact: "my-2",
  normal: "my-4",
  spacious: "my-10",
};

// ─── NodeView Component ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResizableImageView({ node, updateAttributes, deleteNode, selected }: any) {
  const {
    src,
    alt,
    width,
    align = "center",
    spacing = "normal",
    aspectRatio = null,
    caption = null,
  } = node.attrs;
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(caption || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const showControls = hovered || selected || resizing;

  // Build aspect ratio label for the indicator pill
  const ratioLabel = aspectRatio
    ? aspectRatio.replace("/", ":")
    : "Free";

  // ─── Caption Handlers ─────────────────────────────────────────
  const startEditCaption = useCallback(() => {
    setCaptionText(caption || "");
    setEditingCaption(true);
    setTimeout(() => captionInputRef.current?.focus(), 50);
  }, [caption]);

  const saveCaption = useCallback(() => {
    updateAttributes({ caption: captionText.trim() || null });
    setEditingCaption(false);
  }, [captionText, updateAttributes]);

  // ─── Drag-to-resize ───────────────────────────────────────────
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);

      const container = containerRef.current;
      if (!container) return;

      const parentWidth =
        container.parentElement?.parentElement?.clientWidth ||
        container.parentElement?.clientWidth ||
        container.clientWidth;
      const img = container.querySelector("img");
      startXRef.current = e.clientX;
      startWidthRef.current = img?.clientWidth || parentWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        const newWidth = Math.max(80, startWidthRef.current + delta);
        const pct = Math.round((newWidth / parentWidth) * 100);
        const clampedPct = Math.min(100, Math.max(10, pct));
        updateAttributes({ width: `${clampedPct}%` });
      };

      const onMouseUp = () => {
        setResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper
      className={`relative flex ${alignClassMap[align] || "justify-center"} ${spacingClassMap[spacing] || "my-4"}`}
      data-drag-handle
    >
      <div
        ref={containerRef}
        className="relative inline-block group"
        style={{ width: width || "100%", maxWidth: "100%" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => !resizing && !editingCaption && setHovered(false)}
      >
        {/* The Image */}
        <img
          src={src}
          alt={alt || caption || ""}
          className={`rounded-lg w-full block transition-shadow ${
            showControls ? "ring-2 ring-primary/50 shadow-lg" : ""
          }`}
          style={{
            ...(aspectRatio
              ? { aspectRatio: aspectRatio, objectFit: "cover" as const }
              : {}),
          }}
          draggable={false}
        />

        {/* Caption Display (always visible if set) */}
        {caption && !editingCaption && (
          <p
            className="text-center text-sm text-muted-foreground mt-2 italic cursor-pointer hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              startEditCaption();
            }}
            title="Click to edit caption"
          >
            {caption}
          </p>
        )}

        {/* Caption Editor (inline) */}
        {editingCaption && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              ref={captionInputRef}
              type="text"
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCaption();
                if (e.key === "Escape") setEditingCaption(false);
              }}
              onBlur={saveCaption}
              placeholder="Enter caption..."
              className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-center italic text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        )}

        {/* Overlay Controls (visible on hover/selection) */}
        {showControls && (
          <>
            {/* ─── Floating Toolbar ────────────────────────────── */}
            <div className="absolute -top-[72px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 z-20">

              {/* Row 1: Size + Align + Spacing + Caption + Delete */}
              <div className="flex items-center gap-0.5 bg-black/80 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-xl border border-white/10">

                {/* Size Presets */}
                {SIZE_PRESETS.map((preset) => {
                  const isActive =
                    width === preset.value || (!width && preset.value === "100%");
                  return (
                    <button
                      key={preset.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ width: preset.value });
                      }}
                      className={`px-1.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-white/70 hover:text-white hover:bg-white/15"
                      }`}
                      title={preset.tooltip}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="w-px h-4 bg-white/20 mx-0.5" />

                {/* Alignment */}
                {ALIGN_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = align === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ align: opt.value });
                      }}
                      className={`p-1 rounded transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-white/70 hover:text-white hover:bg-white/15"
                      }`}
                      title={opt.tooltip}
                      type="button"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="w-px h-4 bg-white/20 mx-0.5" />

                {/* Vertical Spacing */}
                {SPACING_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = spacing === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ spacing: opt.value });
                      }}
                      className={`p-1 rounded transition-colors ${
                        isActive
                          ? "bg-blue-500 text-white"
                          : "text-white/70 hover:text-white hover:bg-white/15"
                      }`}
                      title={opt.tooltip}
                      type="button"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="w-px h-4 bg-white/20 mx-0.5" />

                {/* Caption Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editingCaption) {
                      saveCaption();
                    } else {
                      startEditCaption();
                    }
                  }}
                  className={`p-1 rounded transition-colors ${
                    caption
                      ? "bg-violet-500 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/15"
                  }`}
                  title={caption ? "Edit caption" : "Add caption"}
                  type="button"
                >
                  <Type className="h-3.5 w-3.5" />
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-white/20 mx-0.5" />

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNode();
                  }}
                  className="p-1 rounded text-red-400 hover:text-white hover:bg-red-500/80 transition-colors"
                  title="Remove image"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Row 2: Aspect Ratio */}
              <div className="flex items-center gap-0.5 bg-black/80 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-xl border border-white/10">
                <RectangleHorizontal className="h-3 w-3 text-white/50 mr-0.5" />
                {ASPECT_RATIO_OPTIONS.map((opt) => {
                  const isActive =
                    (opt.value === null && !aspectRatio) ||
                    aspectRatio === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAttributes({ aspectRatio: opt.value });
                      }}
                      className={`px-1.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        isActive
                          ? "bg-amber-500 text-white"
                          : "text-white/70 hover:text-white hover:bg-white/15"
                      }`}
                      title={opt.tooltip}
                      type="button"
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resize Handle — Bottom Right */}
            <div
              onMouseDown={onResizeStart}
              className="absolute bottom-1 right-1 h-6 w-6 rounded-bl-lg rounded-tr-lg bg-primary/80 text-primary-foreground flex items-center justify-center cursor-nwse-resize hover:bg-primary transition-colors shadow-lg z-10"
              title="Drag to resize"
              style={{ bottom: caption && !editingCaption ? "2rem" : "0.25rem" }}
            >
              <Maximize2 className="h-3 w-3 rotate-90" />
            </div>

            {/* Info Indicator — Bottom Center */}
            <div
              className="absolute left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white/90 text-[10px] font-mono px-2 py-0.5 rounded-full z-10 flex items-center gap-1.5"
              style={{ bottom: caption && !editingCaption ? "2rem" : "0.5rem" }}
            >
              <span>{width || "100%"}</span>
              <span className="text-white/40">·</span>
              <ChevronsUpDown className="h-2.5 w-2.5 inline text-white/50" />
              <span className="text-white/60 capitalize">{spacing}</span>
              <span className="text-white/40">·</span>
              <RectangleHorizontal className="h-2.5 w-2.5 inline text-white/50" />
              <span className="text-white/60">{ratioLabel}</span>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
