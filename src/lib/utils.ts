import { createCn } from "cn/config";

/**
 * Class-name merging aware of the custom type scale and radii, so `text-display-xl` (a size) and
 * `text-milk` (a color) never cancel each other out, and `rounded-pill` replaces `rounded-lg`.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      /* rounded-pill and rounded-tag replace shadcn's rounded-* defaults instead of stacking on them. */
      rounded: [{ rounded: ["pill", "tag"] }],
      "font-size": [
        {
          text: ["display-xxl", "display-xl", "display-l", "title", "lead", "body", "label", "meta", "tag"],
        },
      ],
    },
  },
});
