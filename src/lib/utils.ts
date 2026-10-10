import { createCn } from "cn/config";

/**
 * Class-name merging aware of the custom type scale, so `text-display-xl` (a size) and
 * `text-milk` (a color) never cancel each other out.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["display-xxl", "display-xl", "display-l", "title", "lead", "body", "label", "meta", "tag"],
        },
      ],
    },
  },
});
