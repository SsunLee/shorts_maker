import type { InstagramTemplate } from "@/lib/instagram-types";

export const INSTAGRAM_FEED_STORAGE_KEY = "shorts-maker:instagram:generated-feed:v1";
export const INSTAGRAM_FEED_MAX_ROWS_KEY = "shorts-maker:instagram:feed:max-rows:v1";
export const INSTAGRAM_FEED_DRAFT_KEY = "shorts-maker:instagram:feed:draft:v1";
export const INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY = "shorts-maker:instagram:template-edit-draft:v1";

export type InstagramFeedDraft = {
  selectedItemId?: string;
  caption?: string;
  source?: "instagram-news";
};

export type InstagramTemplateEditDraft = {
  createdAt: string;
  source?: "instagram-feed";
  focusPageId?: string;
  template: InstagramTemplate;
  sampleData?: Record<string, string>;
};
