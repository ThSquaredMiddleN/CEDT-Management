export interface CuLinkItem {
  id: string;
  title: string;
  description: string;
  href?: string;
  iconSrc?: string;
}

/**
 * Static list of CU service links displayed on the /links page.
 * Add real `href` URLs and `iconSrc` asset paths when ready.
 */
export const CU_LINKS: CuLinkItem[] = [
  {
    id: "talent-journey",
    title: "Talent Journey",
    description: "Lorem ipsum dolor sit amet consectetur. Habitant ultrices feugiat",
  },
  {
    id: "ices",
    title: "ICES",
    description: "Lorem ipsum dolor sit amet consectetur. Habitant ultrices feugiat",
  },
  {
    id: "internship",
    title: "Internship",
    description: "Lorem ipsum dolor sit amet consectetur. Habitant ultrices feugiat",
  },
  {
    id: "elective",
    title: "Elective",
    description: "Lorem ipsum dolor sit amet consectetur. Habitant ultrices feugiat",
  },
];
