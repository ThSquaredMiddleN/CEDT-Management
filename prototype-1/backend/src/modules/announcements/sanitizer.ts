import sanitizeHtml from "sanitize-html";

const HEX_COLOR = /^#[\da-f]{3,8}$/i;
const RGB_COLOR = /^rgba?\([\d\s.,%]+\)$/i;

export function sanitizeAnnouncementContent(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "em",
      "h1",
      "h2",
      "h3",
      "hr",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "strong",
      "u",
      "ul",
    ],
    allowedAttributes: {
      a: ["href", "rel", "target"],
      img: ["alt", "src", "title"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        color: [HEX_COLOR, RGB_COLOR],
        "text-align": [/^(left|center|right|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
  });
}
