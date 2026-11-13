import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useRef } from "react";
import { sanitizeAnnouncementHtml } from "../announcement-utils";

const toolbarGroups = [
  [
    { name: "undo", label: "Undo" },
    { name: "redo", label: "Redo" },
  ],
  [
    { name: "bold", label: "Bold" },
    { name: "italic", label: "Italic" },
    { name: "underline", label: "Underline" },
    { name: "strikethrough", label: "Strikethrough" },
    { name: "inline-code", label: "Inline code" },
    { name: "clear-format", label: "Clear formatting" },
  ],
  [
    { name: "list-bulleted", label: "Bulleted list" },
    { name: "list-numbered", label: "Numbered list" },
  ],
  [
    { name: "link", label: "Add link" },
    { name: "image", label: "Add image" },
    { name: "code", label: "Code block" },
    { name: "quotes", label: "Block quote" },
  ],
] as const;

const extensions = [
  StarterKit.configure({ link: false, underline: false }),
  Link.configure({ openOnClick: false, autolink: false }),
  Underline,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  Color.configure({ types: ["textStyle"] }),
  Image.configure({ allowBase64: false }),
  Placeholder.configure({ placeholder: "รายละเอียดประกาศ" }),
];

const iconPath = (name: string) => `/announcement-editor/${name}.svg`;

function ToolbarButton({
  editor,
  name,
  label,
  active,
  onClick,
}: {
  editor: Editor;
  name: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const disabled =
    (name === "undo" && !editor.can().undo()) ||
    (name === "redo" && !editor.can().redo());

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded p-1 text-grey-700 transition-colors hover:bg-grey-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <img src={iconPath(name)} alt="" aria-hidden="true" />
    </button>
  );
}

export function AnnouncementEditor({
  initialContent,
  onChange,
  readOnly = false,
  id,
}: {
  initialContent: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
  id?: string;
}) {
  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => onChange?.(editor.getHTML()),
    [onChange],
  );
  const savedSelection = useRef<{ from: number; to: number } | null>(null);
  const editor = useEditor({
    extensions,
    content: sanitizeAnnouncementHtml(initialContent),
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": "รายละเอียดประกาศ",
        class: "announcement-editor-content",
      },
    },
  });

  if (!editor) {
    return <div className="min-h-36 rounded-md border border-neutral-200 bg-white" />;
  }

  const setBlock = (value: string) => {
    if (value === "paragraph") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
  };

  const setLink = () => {
    const entered = window.prompt("URL ของลิงก์");
    if (!entered) return;
    const value = entered.trim();
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
        window.alert("ลิงก์ต้องใช้ http, https หรือ mailto");
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.href }).run();
    } catch {
      window.alert("กรุณาระบุ URL ที่ถูกต้อง");
    }
  };

  const setImage = () => {
    const entered = window.prompt("URL ของรูปภาพ (HTTPS)");
    if (!entered) return;
    try {
      const url = new URL(entered.trim());
      if (url.protocol !== "https:") {
        window.alert("รูปภาพต้องใช้ URL แบบ HTTPS");
        return;
      }
      editor.chain().focus().setImage({ src: url.href, alt: "" }).run();
    } catch {
      window.alert("กรุณาระบุ URL รูปภาพที่ถูกต้อง");
    }
  };

  const currentBlock = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : "paragraph";

  return (
    <div className="announcement-editor overflow-hidden rounded-md border border-neutral-200 bg-white">
      {!readOnly && (
        <div
          className="flex min-h-11 flex-wrap items-center gap-2 border-b border-neutral-200 p-2"
          role="toolbar"
          aria-label="Rich text formatting"
        >
          <div className="flex items-center gap-0.5">
            {toolbarGroups[0].map(({ name, label }) => (
              <ToolbarButton
                key={name}
                editor={editor}
                name={name}
                label={label}
                onClick={() =>
                  name === "undo" ? editor.chain().focus().undo().run() : editor.chain().focus().redo().run()
                }
              />
            ))}
          </div>
          <label className="sr-only" htmlFor="announcement-text-style">
            Text style
          </label>
          <select
            id="announcement-text-style"
            value={currentBlock}
            onChange={(event) => setBlock(event.target.value)}
            className="h-7 max-w-32 rounded px-2 font-body text-body-xs text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <option value="paragraph">Normal text</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          <label className="sr-only" htmlFor="announcement-text-align">
            Text alignment
          </label>
          <select
            id="announcement-text-align"
            value={
              editor.getAttributes("paragraph").textAlign ??
              editor.getAttributes("heading").textAlign ??
              "left"
            }
            onChange={(event) =>
              editor.chain().focus().setTextAlign(event.target.value).run()
            }
            className="h-7 max-w-24 rounded px-1 font-body text-body-xs text-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <option value="left">Align left</option>
            <option value="center">Align center</option>
            <option value="right">Align right</option>
            <option value="justify">Justify</option>
          </select>
          <label className="flex size-7 cursor-pointer items-center justify-center rounded hover:bg-grey-100">
            <span className="sr-only">Text color</span>
            <input
              type="color"
              aria-label="Text color"
              defaultValue="#212529"
              onPointerDown={() => {
                savedSelection.current = {
                  from: editor.state.selection.from,
                  to: editor.state.selection.to,
                };
              }}
              onChange={(event) => {
                const chain = editor.chain();
                if (savedSelection.current) {
                  chain.setTextSelection(savedSelection.current);
                }
                chain.focus().setColor(event.target.value).run();
              }}
              className="size-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          {toolbarGroups.slice(1).map((group, groupIndex) => (
            <div key={groupIndex} className="flex items-center gap-0.5">
              {group.map(({ name, label }) => (
                <ToolbarButton
                  key={name}
                  editor={editor}
                  name={name}
                  label={label}
                  active={
                    name === "bold"
                      ? editor.isActive("bold")
                      : name === "italic"
                        ? editor.isActive("italic")
                        : name === "underline"
                          ? editor.isActive("underline")
                          : name === "strikethrough"
                            ? editor.isActive("strike")
                            : name === "inline-code"
                              ? editor.isActive("code")
                              : name === "list-bulleted"
                                ? editor.isActive("bulletList")
                                : name === "list-numbered"
                                  ? editor.isActive("orderedList")
                                  : name === "link"
                                    ? editor.isActive("link")
                                    : name === "code"
                                      ? editor.isActive("codeBlock")
                                      : name === "quotes"
                                        ? editor.isActive("blockquote")
                                        : false
                  }
                  onClick={() => {
                    if (name === "bold") editor.chain().focus().toggleBold().run();
                    else if (name === "italic") editor.chain().focus().toggleItalic().run();
                    else if (name === "underline") editor.chain().focus().toggleUnderline().run();
                    else if (name === "strikethrough") editor.chain().focus().toggleStrike().run();
                    else if (name === "inline-code") editor.chain().focus().toggleCode().run();
                    else if (name === "clear-format") {
                      editor.chain().focus().unsetAllMarks().clearNodes().run();
                    } else if (name === "list-bulleted") {
                      editor.chain().focus().toggleBulletList().run();
                    } else if (name === "list-numbered") {
                      editor.chain().focus().toggleOrderedList().run();
                    } else if (name === "link") setLink();
                    else if (name === "image") setImage();
                    else if (name === "code") editor.chain().focus().toggleCodeBlock().run();
                    else if (name === "quotes") editor.chain().focus().toggleBlockquote().run();
                    else editor.chain().focus().setHorizontalRule().run();
                  }}
                />
              ))}
            </div>
          ))}
          <button
            type="button"
            aria-label="Insert horizontal rule"
            title="Insert horizontal rule"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-grey-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <span className="h-px w-4 bg-grey-700" aria-hidden="true" />
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
