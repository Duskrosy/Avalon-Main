export type TrackerGroup = "local" | "international" | "pcdlf" | null;
export type OrganicPlatform = "facebook" | "instagram" | "tiktok" | "youtube" | null;

export type OrganicPostRow = {
  id: string;
  postUrl: string | null;
  thumbnailUrl: string | null;
  captionPreview: string | null;
  publishedAt: string;
  platform: OrganicPlatform;
  group: TrackerGroup;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  videoPlays: number | null;
};

export type AdRow = {
  adId: string;
  campaignName: string | null;
  adName: string | null;
  assetTitle: string | null;
  thumbnailUrl: string | null;
  firstDate: string;
  spend: number;
};

export type ContentItemLink =
  | { state: "unlinked" }
  | {
      state: "organic";
      publishedAt: string | null;
      postUrl: string | null;
      thumbnailUrl: string | null;
      platform: OrganicPlatform;
      impressions: number | null;
      reach: number | null;
      engagements: number | null;
      videoPlays: number | null;
    }
  | {
      state: "ad";
      campaignName: string | null;
      adName: string | null;
      metricDate: string | null;
      thumbnailUrl: string | null;
      assetTitle: string | null;
      spend: number | null;
      impressions: number | null;
      clicks: number | null;
      reach: number | null;
      conversions: number | null;
      conversionValue: number | null;
      ctr: number | null;
      roas: number | null;
    };

export type ContentItemAssigneeRow = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

export type ContentItemRow = {
  id: string;
  title: string;
  plannedWeekStart: string | null;
  group: TrackerGroup;
  contentType: string | null;
  creativeType: string | null;
  channelType: string | null;
  funnelStage: string | null;
  creativeAngle: string | null;
  productOrCollection: string | null;
  campaignLabel: string | null;
  promoCode: string | null;
  downloadLink: string | null;
  status: string | null;
  assignees: ContentItemAssigneeRow[];
  link: ContentItemLink;
};

export type TrackerFeedResponse = {
  organicPosts: OrganicPostRow[];
  ads: AdRow[];
  contentItems: ContentItemRow[];
};
