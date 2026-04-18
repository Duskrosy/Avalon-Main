-- VALUE MIGRATION — DO NOT PUSH UNTIL REVIEWED
-- Maps old content_type values to new taxonomy (content_type + creative_type).
-- Review the row counts below before pushing:
--   SELECT content_type, count(*) FROM creative_content_items GROUP BY content_type;

-- old 'video' → ads content, video format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'video'
  WHERE content_type = 'video';

-- old 'still' → ads content, stills format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'stills'
  WHERE content_type = 'still';

-- old 'ad_creative' → ads content, asset format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'asset'
  WHERE content_type = 'ad_creative';

-- organic stays organic; default creative_type = video (update per row if needed)
UPDATE public.creative_content_items
  SET creative_type = 'video'
  WHERE content_type = 'organic' AND creative_type IS NULL;

-- old 'offline' → offline_other content, asset format
UPDATE public.creative_content_items
  SET content_type = 'offline_other', creative_type = 'asset'
  WHERE content_type = 'offline';

-- old 'other' → offline_other content, asset format
UPDATE public.creative_content_items
  SET content_type = 'offline_other', creative_type = 'asset'
  WHERE content_type = 'other';
