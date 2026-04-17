"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";
import { DeltaBadge } from "@/components/ui/delta-badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  last_synced_at: string;
  meta_account_id: string;
};

type Account = {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  primary_conversion_id: string | null;
  primary_conversion_name: string | null;
};

type CustomConversion = {
  id: string;
  name: string;
  pixel?: { id: string };
  custom_event_type?: string;
};

type AdStat = {
  campaign_id: string;
  meta_account_id: string;
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  metric_date: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  video_plays: number;
  video_plays_25pct: number;
  conversions: number;
  conversion_value: number;
  messaging_conversations: number;
  hook_rate: number | null;
  ctr: number | null;
  roas: number | null;
};

type CampaignTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  conversion_value: number;
  messaging_conversations: number;
  video_plays: number;
  video_plays_25pct: number;
  adCount: number;
};

type MetricCard = {
  id: string;
  label: string;
  formula: string;
  format: "currency" | "multiplier" | "percent" | "number" | "compact";
};

type AdRow = { ad_id: string; ad_name: string | null; adset_name: string | null } & CampaignTotals;

type ColDef = {
  id: string;
  label: string;
  render: (ad: AdRow, currency: string) => string;
  className?: (ad: AdRow) => string;
  /** Extract a raw numeric value for DeltaBadge comparison (built-in columns only). */
  deltaValue?: (ad: AdRow) => number | null;
  /** Set true for cost metrics where a decrease is good (e.g. CPM). */
  invertColor?: boolean;
};

type AdColumnConfig = {
  id: string;
  visible: boolean;
  custom?: boolean;
  label?: string;
  formula?: string;
  format?: MetricCard["format"];
};

type Props = {
  campaigns: Campaign[];
  accounts: Account[];
  stats: AdStat[];
  canSync: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   "bg-[var(--color-success-light)] text-[var(--color-success)]",
  PAUSED:   "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  ARCHIVED: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
  DELETED:  "bg-[var(--color-error-light)] text-red-400",
};

const SORT_OPTIONS = [
  { value: "spend",       label: "Spend (high→low)" },
  { value: "roas",        label: "ROAS (high→low)" },
  { value: "hook",        label: "Hook Rate (high→low)" },
  { value: "conversions", label: "Conversions (high→low)" },
  { value: "impressions", label: "Impressions (high→low)" },
  { value: "name",        label: "Name (A→Z)" },
];

const CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

const DEFAULT_METRIC_CARDS: MetricCard[] = [
  { id: "spend",       label: "Total Spend",  formula: "spend",                        format: "currency"   },
  { id: "conv_value",  label: "Conv. Value",  formula: "conversion_value",             format: "currency"   },
  { id: "roas",        label: "ROAS",         formula: "conversion_value / spend",     format: "multiplier" },
  { id: "impressions", label: "Impressions",  formula: "impressions",                  format: "compact"    },
  { id: "conversions", label: "Conversions",  formula: "conversions",                  format: "number"     },
];

const PRESET_FORMULAS: Array<{ label: string; formula: string; format: MetricCard["format"] }> = [
  { label: "ROAS",              formula: "conversion_value / spend",          format: "multiplier" },
  { label: "Cost Per Purchase", formula: "spend / conversions",               format: "currency"   },
  { label: "CTR",               formula: "clicks / impressions * 100",        format: "percent"    },
  { label: "Hook Rate (25%)",   formula: "video_plays_25pct / impressions * 100", format: "percent" },
  { label: "Hook Rate (3s)",    formula: "video_plays / impressions * 100",   format: "percent"    },
  { label: "CPM",               formula: "spend / impressions * 1000",        format: "currency"   },
  { label: "CPC",               formula: "spend / clicks",                    format: "currency"   },
  { label: "Conv. Rate",        formula: "conversions / clicks * 100",        format: "percent"    },
  { label: "Reach",             formula: "reach",                             format: "compact"    },
  { label: "Video Plays (3s)",  formula: "video_plays",                       format: "compact"    },
  { label: "25% Video Plays",   formula: "video_plays_25pct",                 format: "compact"    },
  { label: "Total Clicks",      formula: "clicks",                            format: "compact"    },
  { label: "Conv. Value",       formula: "conversion_value",                  format: "currency"   },
];

const VARIABLE_GROUPS = [
  {
    label: "Money",
    vars: [
      { name: "spend",            desc: "Total ad spend" },
      { name: "conversion_value", desc: "Revenue from conversions" },
    ],
  },
  {
    label: "Performance",
    vars: [
      { name: "impressions", desc: "Total impressions" },
      { name: "clicks",      desc: "Total link clicks" },
      { name: "reach",       desc: "Unique people reached" },
      { name: "conversions", desc: "Purchase count" },
    ],
  },
  {
    label: "Video",
    vars: [
      { name: "video_plays",       desc: "3-second video plays" },
      { name: "video_plays_25pct", desc: "25% completion plays" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);
}

// Safe recursive-descent formula parser — no eval / new Function (CSP-safe)
function evaluateFormula(formula: string, vars: Record<string, number>): number | null {
  let pos = 0;
  const s = formula.trim();

  const skipWs = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };

  const parseExpr = (): number => {
    let left = parseTerm();
    skipWs();
    while (pos < s.length && (s[pos] === "+" || s[pos] === "-")) {
      const op = s[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
      skipWs();
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    skipWs();
    while (pos < s.length && (s[pos] === "*" || s[pos] === "/")) {
      const op = s[pos++];
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
      skipWs();
    }
    return left;
  };

  const parseFactor = (): number => {
    skipWs();
    if (s[pos] === "-") { pos++; return -parseFactor(); }
    if (s[pos] === "+") { pos++; return parseFactor(); }
    if (s[pos] === "(") {
      pos++;
      const val = parseExpr();
      skipWs();
      if (s[pos] !== ")") throw new Error("Expected )");
      pos++;
      return val;
    }
    if (/[0-9.]/.test(s[pos] ?? "")) {
      let n = "";
      while (pos < s.length && /[0-9.]/.test(s[pos])) n += s[pos++];
      return parseFloat(n);
    }
    if (/[a-zA-Z_]/.test(s[pos] ?? "")) {
      let name = "";
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos])) name += s[pos++];
      if (!(name in vars)) throw new Error(`Unknown: ${name}`);
      return vars[name];
    }
    throw new Error(`Unexpected char: ${s[pos]}`);
  };

  try {
    if (!s) return null;
    const result = parseExpr();
    skipWs();
    if (pos !== s.length) return null;
    if (!isFinite(result) || isNaN(result)) return null;
    return result;
  } catch { return null; }
}

function formatMetricValue(value: number | null, format: MetricCard["format"], currency: string): string {
  if (value === null) return "—";
  switch (format) {
    case "currency":   return fmtMoney(value, currency);
    case "multiplier": return `${fmt(value)}x`;
    case "percent":    return `${fmt(value, 1)}%`;
    case "compact":    return fmtK(value);
    case "number":     return value.toLocaleString();
  }
}

// ─── Ad table column definitions ─────────────────────────────────────────────

const AD_COL_DEFS: ColDef[] = [
  { id: "spend",             label: "Spend",
    render: (ad, cur) => fmtMoney(ad.spend, cur),
    deltaValue: (ad) => ad.spend,
    invertColor: false },
  { id: "roas",              label: "ROAS",
    render: (ad) => { const r = ad.spend > 0 ? ad.conversion_value / ad.spend : null; return r != null ? `${fmt(r)}x` : "—"; },
    className: (ad) => { const r = ad.spend > 0 ? ad.conversion_value / ad.spend : null; return r != null && r >= 2 ? "text-[var(--color-success)] font-medium" : r != null && r < 1 ? "text-[var(--color-error)] font-medium" : "text-[var(--color-text-primary)] font-medium"; },
    deltaValue: (ad) => ad.spend > 0 ? ad.conversion_value / ad.spend : null,
    invertColor: false },
  { id: "hook_rate",         label: "Hook Rate",
    render: (ad) => { const h = ad.impressions > 0 ? (ad.video_plays_25pct / ad.impressions) * 100 : null; return h != null ? `${fmt(h, 1)}%` : "—"; },
    className: (ad) => { const h = ad.impressions > 0 ? (ad.video_plays_25pct / ad.impressions) * 100 : null; return h != null && h >= 4 ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]"; },
    deltaValue: (ad) => ad.impressions > 0 ? (ad.video_plays_25pct / ad.impressions) * 100 : null,
    invertColor: false },
  { id: "ctr",               label: "CTR",
    render: (ad) => { const c = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null; return c != null ? `${fmt(c, 2)}%` : "—"; },
    deltaValue: (ad) => ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null,
    invertColor: false },
  { id: "impressions",       label: "Impressions",
    render: (ad) => fmtK(ad.impressions) },
  { id: "clicks",            label: "Clicks",
    render: (ad) => fmtK(ad.clicks) },
  { id: "conversions",       label: "Conv.",
    render: (ad) => ad.conversions.toString(),
    deltaValue: (ad) => ad.conversions,
    invertColor: false },
  { id: "conversion_value",  label: "Conv. Value",
    render: (ad, cur) => fmtMoney(ad.conversion_value, cur) },
  { id: "reach",             label: "Reach",
    render: (ad) => fmtK(ad.reach ?? 0) },
  { id: "video_plays",       label: "Video 3s",
    render: (ad) => fmtK(ad.video_plays) },
  { id: "video_plays_25pct", label: "Video 25%",
    render: (ad) => fmtK(ad.video_plays_25pct) },
  { id: "cpm",               label: "CPM",
    render: (ad, cur) => { const v = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : null; return v != null ? fmtMoney(v, cur) : "—"; },
    deltaValue: (ad) => ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : null,
    invertColor: true },
  { id: "cpp",               label: "CPP",
    render: (ad, cur) => { const v = ad.conversions > 0 ? ad.spend / ad.conversions : null; return v != null ? fmtMoney(v, cur) : "—"; } },
  { id: "msg_convs",         label: "Results",
    render: (ad) => (ad.messaging_conversations ?? 0).toLocaleString() },
  { id: "cost_per_result",   label: "Cost/Result",
    render: (ad, cur) => { const v = (ad.messaging_conversations ?? 0) > 0 ? ad.spend / ad.messaging_conversations : null; return v != null ? fmtMoney(v, cur) : "—"; } },
];

// Default columns for Messenger-objective campaigns
const DEFAULT_AD_COLUMNS_MESSENGER: AdColumnConfig[] = [
  { id: "spend",            visible: true  },
  { id: "msg_convs",        visible: true  },
  { id: "cost_per_result",  visible: true  },
  { id: "ctr",              visible: true  },
  { id: "impressions",      visible: true  },
  { id: "clicks",           visible: true  },
  { id: "roas",             visible: false },
  { id: "hook_rate",        visible: false },
  { id: "conversions",      visible: false },
  { id: "conversion_value", visible: false },
  { id: "reach",            visible: false },
  { id: "video_plays",      visible: false },
  { id: "video_plays_25pct",visible: false },
  { id: "cpm",              visible: false },
  { id: "cpp",              visible: false },
];

const DEFAULT_AD_COLUMNS: AdColumnConfig[] = [
  { id: "spend",             visible: true  },
  { id: "roas",              visible: true  },
  { id: "hook_rate",         visible: true  },
  { id: "ctr",               visible: true  },
  { id: "impressions",       visible: true  },
  { id: "clicks",            visible: true  },
  { id: "conversions",       visible: true  },
  { id: "conversion_value",  visible: true  },
  { id: "reach",             visible: false },
  { id: "video_plays",       visible: false },
  { id: "video_plays_25pct", visible: false },
  { id: "cpm",               visible: false },
  { id: "cpp",               visible: false },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignsView({ campaigns, accounts, stats, canSync }: Props) {
  const { toast, setToast } = useToast();

  // Sync state
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Filter / sort state
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [sortBy,        setSortBy]        = useState<string>("spend");
  const [datePreset, setDatePreset] = useState<"today" | "yesterday" | "7" | "14" | "30" | "custom">("7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");

  // Live stats for "Today" — fetched from Meta directly, not from DB
  const [liveStats,    setLiveStats]    = useState<AdStat[] | null>(null);
  const [liveFetching, setLiveFetching] = useState(false);

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Demographics state
  const [demographics, setDemographics] = useState<Record<string, { gender: string; spend: number; impressions: number; conversions: number; messages: number }[]>>({});
  const [demographicsLoading, setDemographicsLoading] = useState<Set<string>>(new Set());

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountCurrencies, setAccountCurrencies] = useState<Record<string, string>>(
    Object.fromEntries(accounts.map((a) => [a.id, a.currency ?? "USD"]))
  );
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);

  // Custom conversion state
  const [customConversions, setCustomConversions] = useState<Record<string, CustomConversion[]>>({}); // accountId → list
  const [loadingConversions, setLoadingConversions] = useState<string | null>(null);
  const [accountConversions, setAccountConversions] = useState<Record<string, { id: string | null; name: string | null }>>(
    Object.fromEntries(accounts.map((a) => [a.id, { id: a.primary_conversion_id ?? null, name: a.primary_conversion_name ?? null }]))
  );
  const [savingConversion, setSavingConversion] = useState<string | null>(null);

  // Metric cards state (localStorage-persisted)
  const [metricCards, setMetricCards] = useState<MetricCard[]>(() => {
    if (typeof window === "undefined") return DEFAULT_METRIC_CARDS;
    try {
      const stored = localStorage.getItem("avalon_metric_cards");
      if (stored) return JSON.parse(stored) as MetricCard[];
    } catch { /* ignore */ }
    return DEFAULT_METRIC_CARDS;
  });

  // Customize modal state
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [editCards, setEditCards] = useState<MetricCard[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newFormula, setNewFormula] = useState("");
  const [newFormat, setNewFormat] = useState<MetricCard["format"]>("number");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const formulaInputRef = useRef<HTMLInputElement>(null);

  // Ad table columns state (localStorage-persisted) — separate configs for standard vs Messenger
  const [adColumns, setAdColumns] = useState<AdColumnConfig[]>(() => {
    if (typeof window === "undefined") return DEFAULT_AD_COLUMNS;
    try {
      const stored = localStorage.getItem("avalon_ad_columns");
      if (stored) return JSON.parse(stored) as AdColumnConfig[];
    } catch { /* ignore */ }
    return DEFAULT_AD_COLUMNS;
  });
  const [adColumnsMessenger, setAdColumnsMessenger] = useState<AdColumnConfig[]>(() => {
    if (typeof window === "undefined") return DEFAULT_AD_COLUMNS_MESSENGER;
    try {
      const stored = localStorage.getItem("avalon_ad_columns_messenger");
      if (stored) return JSON.parse(stored) as AdColumnConfig[];
    } catch { /* ignore */ }
    return DEFAULT_AD_COLUMNS_MESSENGER;
  });
  const [colEditorOpen, setColEditorOpen] = useState(false);
  const [editCols, setEditCols] = useState<AdColumnConfig[]>([]);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColFormula, setNewColFormula] = useState("");
  const [newColFormat, setNewColFormat] = useState<MetricCard["format"]>("number");
  const [colSuggestions, setColSuggestions] = useState<string[]>([]);
  const colFormulaRef = useRef<HTMLInputElement>(null);

  // Messenger tab
  const [activeTab, setActiveTab] = useState<"main" | "messenger">("main");

  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  // Live fetch when "Today" is selected
  useEffect(() => {
    if (datePreset !== "today") {
      setLiveStats(null);
      return;
    }
    setLiveFetching(true);
    setLiveStats(null);
    fetch("/api/ad-ops/today-stats")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: AdStat[]) => setLiveStats(data))
      .catch(() => setLiveStats([]))
      .finally(() => setLiveFetching(false));
  }, [datePreset]);

  // Fetch gender demographics when a campaign expands
  useEffect(() => {
    if (!expandedId) return;
    const campaign = tabCampaigns.find((c) => c.id === expandedId);
    if (!campaign) return;
    const accountForCampaign = accountMap[campaign.meta_account_id];
    if (!accountForCampaign?.id) return;
    const cacheKey = campaign.campaign_id;
    if (demographics[cacheKey]) return; // already cached

    setDemographicsLoading((prev) => new Set([...prev, cacheKey]));
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    fetch(`/api/ad-ops/demographics?campaign_id=${encodeURIComponent(campaign.campaign_id)}&meta_account_id=${encodeURIComponent(accountForCampaign.id)}&date=${yesterday}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((json) => {
        setDemographics((prev) => ({ ...prev, [cacheKey]: json.data ?? [] }));
      })
      .catch(() => {
        setDemographics((prev) => ({ ...prev, [cacheKey]: [] }));
      })
      .finally(() => {
        setDemographicsLoading((prev) => { const s = new Set(prev); s.delete(cacheKey); return s; });
      });
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Account map (uses live currency from local state so UI is instant)
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, { ...a, currency: accountCurrencies[a.id] ?? a.currency }])),
    [accounts, accountCurrencies],
  );

  // ── Sync ──────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch("/api/ad-ops/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg({ type: "error", text: body.error ?? `Sync failed (${res.status})` });
      } else {
        setSyncMsg({ type: "ok", text: `Synced ${body.campaigns ?? 0} campaigns · ${body.ads ?? 0} ads` });
        setToast({ message: `Synced ${body.campaigns ?? 0} campaigns · ${body.ads ?? 0} ads`, type: "success" });
      }
    } catch {
      setSyncMsg({ type: "error", text: "Network error — sync request failed" });
    } finally {
      setSyncing(false);
    }
  }

  // ── Currency save ─────────────────────────────────────────────────────────
  async function saveCurrency(accountId: string, currency: string) {
    setAccountCurrencies((prev) => ({ ...prev, [accountId]: currency }));
    setSavingCurrency(accountId);
    try {
      await fetch("/api/ad-ops/meta-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, currency }),
      });
    } finally {
      setSavingCurrency(null);
    }
  }

  // ── Custom conversion helpers ─────────────────────────────────────────────
  async function loadCustomConversions(accountId: string) {
    setLoadingConversions(accountId);
    try {
      const res = await fetch(`/api/ad-ops/custom-conversions?account_id=${accountId}`);
      if (!res.ok) return;
      const data: CustomConversion[] = await res.json();
      setCustomConversions((prev) => ({ ...prev, [accountId]: data }));
    } finally {
      setLoadingConversions(null);
    }
  }

  async function saveConversion(accountId: string, convId: string | null, convName: string | null) {
    setAccountConversions((prev) => ({ ...prev, [accountId]: { id: convId, name: convName } }));
    setSavingConversion(accountId);
    try {
      await fetch("/api/ad-ops/meta-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, primary_conversion_id: convId, primary_conversion_name: convName }),
      });
    } finally {
      setSavingConversion(null);
    }
  }

  // ── Metric cards helpers ──────────────────────────────────────────────────
  function saveMetricCards(cards: MetricCard[]) {
    setMetricCards(cards);
    try { localStorage.setItem("avalon_metric_cards", JSON.stringify(cards)); } catch { /* ignore */ }
  }

  function openCustomize() {
    setEditCards([...metricCards]);
    setNewLabel("");
    setNewFormula("");
    setNewFormat("number");
    setCustomizeOpen(true);
  }

  function moveCard(index: number, dir: -1 | 1) {
    const next = [...editCards];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setEditCards(next);
  }

  function removeCard(index: number) {
    setEditCards(editCards.filter((_, i) => i !== index));
  }

  function addCard() {
    if (!newLabel.trim() || !newFormula.trim()) return;
    const card: MetricCard = {
      id: `custom_${Date.now()}`,
      label: newLabel.trim(),
      formula: newFormula.trim(),
      format: newFormat,
    };
    setEditCards([...editCards, card]);
    setNewLabel("");
    setNewFormula("");
    setNewFormat("number");
  }

  function applyPreset(preset: typeof PRESET_FORMULAS[number]) {
    setNewLabel(preset.label);
    setNewFormula(preset.formula);
    setNewFormat(preset.format);
    setSuggestions([]);
  }

  function insertVar(varName: string) {
    const input = formulaInputRef.current;
    const curPos = input?.selectionStart ?? newFormula.length;
    // Find start of current word being typed
    let wordStart = curPos;
    while (wordStart > 0 && /[a-zA-Z0-9_]/.test(newFormula[wordStart - 1])) wordStart--;
    const before = newFormula.slice(0, wordStart);
    const after  = newFormula.slice(curPos);
    const next   = before + varName + after;
    setNewFormula(next);
    setSuggestions([]);
    const newCurPos = wordStart + varName.length;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(newCurPos, newCurPos);
    });
  }

  function handleFormulaChange(val: string) {
    setNewFormula(val);
    const input = formulaInputRef.current;
    const curPos = input?.selectionStart ?? val.length;
    let wordStart = curPos;
    while (wordStart > 0 && /[a-zA-Z0-9_]/.test(val[wordStart - 1])) wordStart--;
    const word = val.slice(wordStart, curPos).toLowerCase();
    if (word.length >= 2) {
      const allVars = VARIABLE_GROUPS.flatMap((g) => g.vars.map((v) => v.name));
      setSuggestions(allVars.filter((v) => v.includes(word) && v !== word));
    } else {
      setSuggestions([]);
    }
  }

  // ── Ad column helpers ─────────────────────────────────────────────────────
  const isMessengerTab = activeTab === "messenger";

  function saveAdColumns(cols: AdColumnConfig[]) {
    if (isMessengerTab) {
      setAdColumnsMessenger(cols);
      try { localStorage.setItem("avalon_ad_columns_messenger", JSON.stringify(cols)); } catch { /* ignore */ }
    } else {
      setAdColumns(cols);
      try { localStorage.setItem("avalon_ad_columns", JSON.stringify(cols)); } catch { /* ignore */ }
    }
  }

  function openColEditor() {
    setEditCols([...(isMessengerTab ? adColumnsMessenger : adColumns)]);
    setColEditorOpen(true);
  }

  function moveCol(i: number, dir: -1 | 1) {
    const next = [...editCols];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    setEditCols(next);
  }

  function toggleCol(id: string) {
    setEditCols(editCols.map((c) => c.id === id ? { ...c, visible: !c.visible } : c));
  }

  function removeCustomCol(id: string) {
    setEditCols(editCols.filter((c) => c.id !== id));
  }

  function addCustomCol() {
    if (!newColLabel.trim() || !newColFormula.trim()) return;
    const col: AdColumnConfig = {
      id: `custom_${Date.now()}`,
      visible: true,
      custom: true,
      label: newColLabel.trim(),
      formula: newColFormula.trim(),
      format: newColFormat,
    };
    setEditCols([...editCols, col]);
    setNewColLabel("");
    setNewColFormula("");
    setNewColFormat("number");
    setColSuggestions([]);
  }

  function insertColVar(varName: string) {
    const input = colFormulaRef.current;
    const curPos = input?.selectionStart ?? newColFormula.length;
    let wordStart = curPos;
    while (wordStart > 0 && /[a-zA-Z0-9_]/.test(newColFormula[wordStart - 1])) wordStart--;
    const next = newColFormula.slice(0, wordStart) + varName + newColFormula.slice(curPos);
    setNewColFormula(next);
    setColSuggestions([]);
    const newPos = wordStart + varName.length;
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(newPos, newPos); });
  }

  function handleColFormulaChange(val: string) {
    setNewColFormula(val);
    const input = colFormulaRef.current;
    const curPos = input?.selectionStart ?? val.length;
    let wordStart = curPos;
    while (wordStart > 0 && /[a-zA-Z0-9_]/.test(val[wordStart - 1])) wordStart--;
    const word = val.slice(wordStart, curPos).toLowerCase();
    if (word.length >= 2) {
      const allVars = VARIABLE_GROUPS.flatMap((g) => g.vars.map((v) => v.name));
      setColSuggestions(allVars.filter((v) => v.includes(word) && v !== word));
    } else {
      setColSuggestions([]);
    }
  }

  function applyColPreset(p: typeof PRESET_FORMULAS[number]) {
    setNewColLabel(p.label);
    setNewColFormula(p.formula);
    setNewColFormat(p.format);
    setColSuggestions([]);
  }

  // ── Stats aggregation ─────────────────────────────────────────────────────
  const { startDate, endDate } = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yesterdayStr = yest.toISOString().split("T")[0];
    switch (datePreset) {
      case "today":     return { startDate: todayStr,     endDate: todayStr };
      case "yesterday": return { startDate: yesterdayStr, endDate: yesterdayStr };
      case "custom":    return {
        startDate: customStart || yesterdayStr,
        endDate:   customEnd   || todayStr,
      };
      default: {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(datePreset));
        return { startDate: d.toISOString().split("T")[0], endDate: todayStr };
      }
    }
  }, [datePreset, customStart, customEnd]);

  // Compute previous period: same number of days ending the day before startDate
  const prevByAdId = useMemo<Map<string, AdRow>>(() => {
    // No previous period for 30-day preset (outside the 30-day DB window) or live today
    if (datePreset === "30" || datePreset === "today") return new Map();

    const start = parseISO(startDate);
    const end   = parseISO(endDate);
    const dayCount = differenceInCalendarDays(end, start) + 1;
    const prevEnd   = subDays(start, 1);
    const prevStart = subDays(prevEnd, dayCount - 1);
    const prevStartStr = prevStart.toISOString().split("T")[0];
    const prevEndStr   = prevEnd.toISOString().split("T")[0];

    // Always use DB stats for previous period (never live)
    const prevRows = stats.filter(
      (s) => s.metric_date >= prevStartStr && s.metric_date <= prevEndStr
    );

    // Aggregate raw counters by ad_id — rates computed on access, not stored
    const map = new Map<string, AdRow>();
    for (const row of prevRows) {
      const existing = map.get(row.ad_id);
      if (!existing) {
        map.set(row.ad_id, {
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          adset_name: row.adset_name,
          spend:                   row.spend,
          impressions:             row.impressions,
          clicks:                  row.clicks,
          reach:                   row.reach ?? 0,
          conversions:             row.conversions,
          conversion_value:        row.conversion_value,
          messaging_conversations: row.messaging_conversations ?? 0,
          video_plays:             row.video_plays,
          video_plays_25pct:       row.video_plays_25pct,
          adCount:                 1,
        });
      } else {
        existing.spend                   += row.spend;
        existing.impressions             += row.impressions;
        existing.clicks                  += row.clicks;
        existing.reach                   += (row.reach ?? 0);
        existing.conversions             += row.conversions;
        existing.conversion_value        += row.conversion_value;
        existing.messaging_conversations += (row.messaging_conversations ?? 0);
        existing.video_plays             += row.video_plays;
        existing.video_plays_25pct       += row.video_plays_25pct;
      }
    }
    return map;
  }, [stats, datePreset, startDate, endDate]);

  const filteredStats = useMemo(() => {
    // For "Today" use the live Meta fetch; for all other presets use the DB snapshot
    const source = datePreset === "today" && liveStats != null ? liveStats : stats;
    return source.filter((s) => s.metric_date >= startDate && s.metric_date <= endDate);
  }, [stats, liveStats, datePreset, startDate, endDate]);

  const campaignTotals = useMemo(() => {
    const map = new Map<string, CampaignTotals>();
    for (const s of filteredStats) {
      const key = `${s.meta_account_id}__${s.campaign_id}`;
      const t = map.get(key) ?? {
        spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0,
        conversion_value: 0, messaging_conversations: 0,
        video_plays: 0, video_plays_25pct: 0, adCount: 0,
      };
      t.spend                  += s.spend;
      t.impressions            += s.impressions;
      t.clicks                 += s.clicks;
      t.reach                  += (s.reach ?? 0);
      t.conversions            += s.conversions;
      t.conversion_value       += s.conversion_value;
      t.messaging_conversations += (s.messaging_conversations ?? 0);
      t.video_plays            += s.video_plays;
      t.video_plays_25pct      += s.video_plays_25pct;
      map.set(key, t);
    }
    // count unique ads per campaign
    const adSets = new Map<string, Set<string>>();
    for (const s of filteredStats) {
      const key = `${s.meta_account_id}__${s.campaign_id}`;
      if (!adSets.has(key)) adSets.set(key, new Set());
      adSets.get(key)!.add(s.ad_id);
    }
    adSets.forEach((ads, key) => {
      const t = map.get(key);
      if (t) t.adCount = ads.size;
    });
    return map;
  }, [filteredStats]);

  // ── Filter + sort campaigns ───────────────────────────────────────────────
  const visibleCampaigns = useMemo(() => {
    let list = campaigns.filter((c) => {
      if (filterAccount !== "all" && c.meta_account_id !== filterAccount) return false;
      if (filterStatus  !== "all" && c.effective_status !== filterStatus)  return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const tA = campaignTotals.get(`${a.meta_account_id}__${a.campaign_id}`);
      const tB = campaignTotals.get(`${b.meta_account_id}__${b.campaign_id}`);
      switch (sortBy) {
        case "spend":       return (tB?.spend ?? 0) - (tA?.spend ?? 0);
        case "roas": {
          const rA = tA && tA.spend > 0 ? tA.conversion_value / tA.spend : 0;
          const rB = tB && tB.spend > 0 ? tB.conversion_value / tB.spend : 0;
          return rB - rA;
        }
        case "hook": {
          const hA = tA && tA.impressions > 0 ? tA.video_plays_25pct / tA.impressions : 0;
          const hB = tB && tB.impressions > 0 ? tB.video_plays_25pct / tB.impressions : 0;
          return hB - hA;
        }
        case "conversions": return (tB?.conversions ?? 0) - (tA?.conversions ?? 0);
        case "impressions": return (tB?.impressions ?? 0) - (tA?.impressions ?? 0);
        case "name":        return a.campaign_name.localeCompare(b.campaign_name);
        default:            return 0;
      }
    });

    return list;
  }, [campaigns, filterAccount, filterStatus, sortBy, campaignTotals]);

  // ── Overall totals (respects account + status filter) ────────────────────
  const overallTotals = useMemo(() => {
    return visibleCampaigns.reduce(
      (acc, c) => {
        const t = campaignTotals.get(`${c.meta_account_id}__${c.campaign_id}`);
        if (!t) return acc;
        return {
          spend:                   acc.spend + t.spend,
          impressions:             acc.impressions + t.impressions,
          clicks:                  acc.clicks + t.clicks,
          reach:                   acc.reach + (t.reach ?? 0),
          conversions:             acc.conversions + t.conversions,
          conversion_value:        acc.conversion_value + t.conversion_value,
          messaging_conversations: acc.messaging_conversations + (t.messaging_conversations ?? 0),
          video_plays:             acc.video_plays + t.video_plays,
          video_plays_25pct:       acc.video_plays_25pct + t.video_plays_25pct,
        };
      },
      { spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0,
        conversion_value: 0, messaging_conversations: 0,
        video_plays: 0, video_plays_25pct: 0 },
    );
  }, [visibleCampaigns, campaignTotals]);

  const overallROAS = overallTotals.spend > 0
    ? overallTotals.conversion_value / overallTotals.spend : null;

  const formulaVars = useMemo(() => ({
    spend:             overallTotals.spend,
    impressions:       overallTotals.impressions,
    clicks:            overallTotals.clicks,
    reach:             overallTotals.reach,
    conversions:       overallTotals.conversions,
    conversion_value:  overallTotals.conversion_value,
    video_plays:       overallTotals.video_plays,
    video_plays_25pct: overallTotals.video_plays_25pct,
  }), [overallTotals]);

  // Derive display currency from visible campaigns (use filtered account's currency,
  // or the currency that appears most often across visible campaigns)
  const overallCurrency = useMemo(() => {
    if (filterAccount !== "all") return accountMap[filterAccount]?.currency ?? "USD";
    const currencies = visibleCampaigns
      .map((c) => accountMap[c.meta_account_id]?.currency)
      .filter(Boolean) as string[];
    if (currencies.length === 0) return "USD";
    // Most common currency
    const counts = currencies.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [filterAccount, accountMap, visibleCampaigns]);

  // Active column defs in user-defined order (uses messenger config when in Messenger tab)
  const activeAdCols = useMemo(
    () => (isMessengerTab ? adColumnsMessenger : adColumns)
      .filter((c) => c.visible)
      .map((c): ColDef | undefined => {
        if (c.custom && c.formula && c.label) {
          const formula = c.formula;
          const format  = c.format ?? "number";
          return {
            id: c.id,
            label: c.label,
            render: (ad, cur) => {
              const vars = {
                spend: ad.spend, impressions: ad.impressions, clicks: ad.clicks,
                reach: ad.reach ?? 0, conversions: ad.conversions,
                conversion_value: ad.conversion_value,
                video_plays: ad.video_plays, video_plays_25pct: ad.video_plays_25pct,
              };
              return formatMetricValue(evaluateFormula(formula, vars), format, cur);
            },
          };
        }
        return AD_COL_DEFS.find((d) => d.id === c.id);
      })
      .filter(Boolean) as ColDef[],
    [adColumns, adColumnsMessenger, isMessengerTab],
  );

  // Messenger auto-grouping
  const hasMessengerCampaigns = useMemo(
    () => visibleCampaigns.some((c) => c.campaign_name.toLowerCase().includes("messenger")),
    [visibleCampaigns],
  );

  const tabCampaigns = useMemo(
    () => visibleCampaigns.filter((c) => {
      const isMessenger = c.campaign_name.toLowerCase().includes("messenger");
      return activeTab === "messenger" ? isMessenger : !isMessenger;
    }),
    [visibleCampaigns, activeTab],
  );

  // Unique statuses for filter dropdown
  const availableStatuses = useMemo(
    () => [...new Set(campaigns.map((c) => c.effective_status))].sort(),
    [campaigns],
  );

  // ── Per-campaign ad drill-down ────────────────────────────────────────────
  function getAdsForCampaign(campaign: Campaign): AdRow[] {
    const adMap = new Map<string, AdRow>();
    filteredStats
      .filter((s) => s.campaign_id === campaign.campaign_id && s.meta_account_id === campaign.meta_account_id)
      .forEach((s) => {
        const t = adMap.get(s.ad_id) ?? {
          ad_id: s.ad_id, ad_name: s.ad_name, adset_name: s.adset_name,
          spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0,
          conversion_value: 0, messaging_conversations: 0,
          video_plays: 0, video_plays_25pct: 0, adCount: 1,
        };
        t.spend                   += s.spend;
        t.impressions             += s.impressions;
        t.clicks                  += s.clicks;
        t.conversions             += s.conversions;
        t.conversion_value        += s.conversion_value;
        t.messaging_conversations += (s.messaging_conversations ?? 0);
        t.video_plays             += s.video_plays;
        t.video_plays_25pct       += s.video_plays_25pct;
        adMap.set(s.ad_id, t);
      });
    return Array.from(adMap.values()).sort((a, b) => b.spend - a.spend);
  }

  // ── Gender demographics inline renderer ──────────────────────────────────
  function renderDemographics(campaignId: string, curr: string) {
    const data = demographics[campaignId];
    const loading = demographicsLoading.has(campaignId);

    if (loading) {
      return (
        <div className="px-5 py-3 border-t border-[var(--color-border-secondary)]">
          <div className="h-4 w-32 bg-[var(--color-bg-tertiary)] rounded animate-pulse" />
        </div>
      );
    }
    if (!data || data.length === 0) return null;

    const total = data.reduce((s, r) => s + r.spend, 0);
    if (total === 0) return null;

    const GENDER_COLORS: Record<string, string> = {
      male:    "bg-[var(--color-accent)]",
      female:  "bg-[var(--color-info)]",
      unknown: "bg-[var(--color-border-primary)]",
    };

    const fmtGenderMoney = (n: number) => {
      const sym = curr === "PHP" ? "₱" : "$";
      if (n >= 1000) return `${sym}${(n / 1000).toFixed(1)}K`;
      return `${sym}${n.toFixed(0)}`;
    };

    return (
      <div className="px-5 py-3 border-t border-[var(--color-border-secondary)]">
        <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">Gender breakdown · yesterday</p>
        <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)] mb-2">
          {data.map((row) => {
            const pct = total > 0 ? (row.spend / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={row.gender}
                className={`${GENDER_COLORS[row.gender] ?? "bg-[var(--color-border-primary)]"} h-full transition-all`}
                style={{ width: `${pct}%` }}
              />
            );
          })}
        </div>
        <div className="flex gap-4">
          {data.filter((r) => r.spend > 0).map((row) => (
            <div key={row.gender} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${GENDER_COLORS[row.gender] ?? "bg-[var(--color-border-primary)]"}`} />
              <span className="text-[10px] text-[var(--color-text-secondary)] capitalize">{row.gender}</span>
              <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">{fmtGenderMoney(row.spend)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Live Campaigns</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 flex items-center gap-2 flex-wrap">
            <span>
              Auto-synced from Meta · {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
              {campaigns[0]?.last_synced_at && (
                <> · Last sync: {format(parseISO(campaigns[0].last_synced_at), "d MMM, h:mm a")}</>
              )}
            </span>
            {datePreset === "today" && (
              liveFetching ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-warning)] bg-[var(--color-warning-light)] px-2 py-0.5 rounded-full">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Fetching live data…
                </span>
              ) : liveStats != null ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)] bg-[var(--color-success-light)] px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full animate-pulse" />
                  Live from Meta
                </span>
              ) : null
            )}
          </p>
          {syncMsg && (
            <p className={`text-xs mt-1 ${syncMsg.type === "ok" ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
              {syncMsg.text}
            </p>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex rounded-lg border border-[var(--color-border-primary)] overflow-hidden text-sm">
              {([
                { key: "today",     label: "Today"   },
                { key: "yesterday", label: "Yest."   },
                { key: "7",         label: "7d"      },
                { key: "14",        label: "14d"     },
                { key: "30",        label: "30d"     },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDatePreset(key)}
                  className={`px-3 py-1.5 transition-colors ${datePreset === key ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  if (datePreset !== "custom") {
                    // Pre-fill custom range with current range boundaries
                    setCustomEnd(endDate);
                    setCustomStart(startDate);
                  }
                  setDatePreset("custom");
                }}
                className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${datePreset === "custom" ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Custom
              </button>
            </div>

            {/* Custom date inputs — visible only when custom is active */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-1.5 text-sm">
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || new Date().toISOString().split("T")[0]}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
                />
                <span className="text-[var(--color-text-tertiary)] text-xs">→</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
                />
              </div>
            )}
          </div>

          {/* Account settings gear */}
          {canSync && (
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                title="Account settings"
                className={`border rounded-lg p-1.5 transition-colors ${settingsOpen ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)]"}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Settings dropdown */}
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] z-50 p-4">
                  <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">Account Settings</p>
                  <div className="space-y-4">
                    {accounts.map((account) => {
                      const convList = customConversions[account.id];
                      const currentConv = accountConversions[account.id];
                      const isLoadingConv = loadingConversions === account.id;
                      const isSavingConv  = savingConversion === account.id;

                      return (
                        <div key={account.id} className="space-y-2 pb-3 border-b border-[var(--color-border-secondary)] last:border-b-0 last:pb-0">
                          {/* Account header */}
                          <div>
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">{account.name}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">{account.account_id}</p>
                          </div>

                          {/* Currency */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--color-text-secondary)]">Currency</span>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={accountCurrencies[account.id] ?? "USD"}
                                onChange={(e) => saveCurrency(account.id, e.target.value)}
                                disabled={savingCurrency === account.id}
                                className="border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
                              >
                                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              {savingCurrency === account.id && (
                                <svg className="animate-spin w-3 h-3 text-[var(--color-text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                              )}
                            </div>
                          </div>

                          {/* Custom conversion */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[var(--color-text-secondary)]">Purchase conversion</span>
                              {!convList && (
                                <button
                                  onClick={() => loadCustomConversions(account.id)}
                                  disabled={isLoadingConv}
                                  className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                                >
                                  {isLoadingConv ? "Loading…" : "Load from Meta"}
                                </button>
                              )}
                              {convList && (
                                <button onClick={() => loadCustomConversions(account.id)} disabled={isLoadingConv}
                                  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
                                  ↺
                                </button>
                              )}
                            </div>

                            {/* Current selection display */}
                            {!convList && currentConv?.name && (
                              <p className="text-xs text-[var(--color-success)] bg-[var(--color-success-light)] rounded px-2 py-1">
                                ✓ {currentConv.name}
                              </p>
                            )}

                            {/* Dropdown once loaded */}
                            {convList && (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={currentConv?.id ?? ""}
                                  onChange={(e) => {
                                    const selected = convList.find((c) => c.id === e.target.value);
                                    saveConversion(account.id, selected?.id ?? null, selected?.name ?? null);
                                  }}
                                  disabled={isSavingConv}
                                  className="flex-1 border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50 bg-[var(--color-bg-primary)]"
                                >
                                  <option value="">— Default (purchase event) —</option>
                                  {convList.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                {isSavingConv && (
                                  <svg className="animate-spin w-3 h-3 text-[var(--color-text-tertiary)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                  </svg>
                                )}
                              </div>
                            )}

                            {convList?.length === 0 && (
                              <p className="text-xs text-[var(--color-text-tertiary)]">No custom conversions found on this account</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sync button */}
          {canSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-1.5 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Syncing…
                </>
              ) : "Sync Now"}
            </button>
          )}
        </div>
      </div>

      {/* ── Filter / sort bar ───────────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {/* Account filter */}
          {accounts.length > 1 && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
          >
            <option value="all">All statuses</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort: {o.label}</option>
            ))}
          </select>

          {/* Result count */}
          <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
            {visibleCampaigns.length} of {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </span>

          {/* Clear filters */}
          {(filterAccount !== "all" || filterStatus !== "all") && (
            <button
              onClick={() => { setFilterAccount("all"); setFilterStatus("all"); }}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <div className="mb-5">
          <div className={`grid gap-3 mb-1.5`} style={{ gridTemplateColumns: `repeat(${metricCards.length}, minmax(0, 1fr))` }}>
            {metricCards.map((card) => {
              const value = evaluateFormula(card.formula, formulaVars);
              return (
                <div key={card.id} className={`bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 min-w-0 transition-opacity ${liveFetching ? "opacity-40" : ""}`}>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1 truncate">{card.label}</p>
                  <p className="text-xl font-bold text-[var(--color-text-primary)] truncate">
                    {liveFetching ? <span className="inline-block w-16 h-5 bg-[var(--color-border-primary)] rounded animate-pulse" /> : formatMetricValue(value, card.format, overallCurrency)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              onClick={openCustomize}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Customize cards
            </button>
          </div>
        </div>
      )}

      {/* ── Messenger tabs ──────────────────────────────────────────────────── */}
      {hasMessengerCampaigns && campaigns.length > 0 && (
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1 w-fit">
          {(["main", "messenger"] as const).map((tab) => {
            const count = tab === "messenger"
              ? visibleCampaigns.filter((c) => c.campaign_name.toLowerCase().includes("messenger")).length
              : visibleCampaigns.filter((c) => !c.campaign_name.toLowerCase().includes("messenger")).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {tab === "main" ? `Campaigns (${count})` : `Messenger (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Campaign list ───────────────────────────────────────────────────── */}
      {campaigns.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-16 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No campaigns synced yet</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Click <strong>Sync Now</strong> to pull your campaigns from Meta</p>
          {canSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="mt-4 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-5 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          )}
        </div>
      ) : tabCampaigns.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No campaigns match the current filters</p>
          <button
            onClick={() => { setFilterAccount("all"); setFilterStatus("all"); }}
            className="mt-2 text-xs text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tabCampaigns.map((campaign) => {
            const key     = `${campaign.meta_account_id}__${campaign.campaign_id}`;
            const totals  = campaignTotals.get(key);
            const account = accountMap[campaign.meta_account_id];
            const isExpanded = expandedId === campaign.id;
            const roas     = totals && totals.spend > 0 ? totals.conversion_value / totals.spend : null;
            const hookRate = totals && totals.impressions > 0
              ? (totals.video_plays_25pct / totals.impressions) * 100 : null;

            return (
              <div key={campaign.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                  className="w-full text-left px-5 py-4 hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[campaign.effective_status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]"}`}>
                      {campaign.effective_status}
                    </span>

                    <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)] min-w-0 truncate">
                      {campaign.campaign_name}
                    </span>

                    {accounts.length > 1 && account && (
                      <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded-full shrink-0">
                        {account.name}
                      </span>
                    )}

                    {totals ? (
                      <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap">
                        <span className="text-[var(--color-text-secondary)]">
                          <span className="font-semibold text-[var(--color-text-primary)]">{fmtMoney(totals.spend, account?.currency)}</span> spend
                        </span>
                        {isMessengerTab ? (
                          // Messenger-specific metrics
                          <>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className="font-semibold text-[var(--color-text-primary)]">{(totals.messaging_conversations ?? 0).toLocaleString()}</span> results
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className="font-semibold text-[var(--color-text-primary)]">
                                {(totals.messaging_conversations ?? 0) > 0
                                  ? fmtMoney(totals.spend / totals.messaging_conversations, account?.currency)
                                  : "—"}
                              </span> cost/result
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className="font-semibold text-[var(--color-text-primary)]">
                                {totals.impressions > 0 ? `${fmt((totals.clicks / totals.impressions) * 100, 2)}%` : "—"}
                              </span> CTR
                            </span>
                          </>
                        ) : (
                          // Standard metrics
                          <>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className={`font-semibold ${roas != null && roas >= 2 ? "text-[var(--color-success)]" : roas != null && roas < 1 ? "text-[var(--color-error)]" : "text-[var(--color-text-primary)]"}`}>
                                {roas != null ? `${fmt(roas)}x` : "—"}
                              </span> ROAS
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className={`font-semibold ${hookRate != null && hookRate >= 4 ? "text-[var(--color-success)]" : "text-[var(--color-text-primary)]"}`}>
                                {hookRate != null ? `${fmt(hookRate, 1)}%` : "—"}
                              </span> hook
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                              <span className="font-semibold text-[var(--color-text-primary)]">{totals.conversions}</span> conv.
                            </span>
                          </>
                        )}
                        <span className="text-[var(--color-text-tertiary)]">{totals.adCount} ad{totals.adCount !== 1 ? "s" : ""}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">No data in period</span>
                    )}

                    <svg
                      className={`w-4 h-4 text-[var(--color-text-tertiary)] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {(campaign.daily_budget || campaign.lifetime_budget || campaign.objective) && (
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      {campaign.daily_budget
                        ? `${fmtMoney(campaign.daily_budget, account?.currency)}/day`
                        : campaign.lifetime_budget
                        ? `${fmtMoney(campaign.lifetime_budget, account?.currency)} lifetime`
                        : null}
                      {campaign.objective && (campaign.daily_budget || campaign.lifetime_budget)
                        ? ` · ${campaign.objective.replace(/_/g, " ")}`
                        : campaign.objective?.replace(/_/g, " ")}
                    </p>
                  )}
                </button>

                {/* Expanded ad breakdown */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border-secondary)]">
                    {(() => {
                      const adRows = getAdsForCampaign(campaign);
                      if (adRows.length === 0) {
                        return (
                          <div className="px-5 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                            No ad-level data for this period
                          </div>
                        );
                      }
                      return (
                        <div>
                          {/* Table header row with Columns button */}
                          <div className="flex items-center justify-between px-5 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-secondary)]">
                            <span className="text-xs text-[var(--color-text-tertiary)] font-medium">{adRows.length} ad{adRows.length !== 1 ? "s" : ""}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); openColEditor(); }}
                              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-1 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                              </svg>
                              Columns
                            </button>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[var(--color-text-tertiary)] border-b border-[var(--color-border-secondary)]">
                                  <th className="px-5 py-2.5 text-left font-medium">Ad</th>
                                  {activeAdCols.map((col) => (
                                    <th key={col.id} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{col.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--color-border-secondary)]">
                                {adRows.map((ad) => (
                                  <tr key={ad.ad_id} className="hover:bg-[var(--color-surface-hover)]">
                                    <td className="px-5 py-2.5">
                                      <p className="text-[var(--color-text-primary)] font-medium truncate max-w-[220px]">{ad.ad_name ?? ad.ad_id}</p>
                                      {ad.adset_name && <p className="text-[var(--color-text-tertiary)] truncate max-w-[220px]">{ad.adset_name}</p>}
                                    </td>
                                    {activeAdCols.map((col) => {
                                      const prevRow = prevByAdId.get(ad.ad_id) ?? null;
                                      return (
                                        <td
                                          key={col.id}
                                          className={`px-4 py-2.5 text-right ${col.className ? col.className(ad) : "text-[var(--color-text-secondary)]"}`}
                                        >
                                          {col.deltaValue ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span>{col.render(ad, account?.currency ?? "USD")}</span>
                                              <DeltaBadge
                                                current={col.deltaValue(ad)}
                                                previous={prevRow ? col.deltaValue(prevRow) : null}
                                                invertColor={col.invertColor}
                                              />
                                            </div>
                                          ) : (
                                            col.render(ad, account?.currency ?? "USD")
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {renderDemographics(campaign.campaign_id, account?.currency ?? "USD")}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Customize metric cards modal ─────────────────────────────────────── */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCustomizeOpen(false)} />
          <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-secondary)]">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Customize Metric Cards</h2>
              <button onClick={() => setCustomizeOpen(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-lg p-1 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Current cards list */}
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">Current Cards</p>
                {editCards.length === 0 && (
                  <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">No cards yet. Add one below.</p>
                )}
                <div className="space-y-1.5">
                  {editCards.map((card, i) => (
                    <div key={card.id} className="flex items-center gap-2 bg-[var(--color-bg-secondary)] rounded-lg px-3 py-2">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={() => moveCard(i, -1)}
                          disabled={i === 0}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-20 leading-none text-xs"
                        >▲</button>
                        <button
                          onClick={() => moveCard(i, 1)}
                          disabled={i === editCards.length - 1}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-20 leading-none text-xs"
                        >▼</button>
                      </div>
                      {/* Label + formula */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{card.label}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">{card.formula}</p>
                      </div>
                      {/* Format badge */}
                      <span className="text-xs bg-[var(--color-border-primary)] text-[var(--color-text-secondary)] rounded px-1.5 py-0.5 shrink-0">{card.format}</span>
                      {/* Live value preview */}
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] shrink-0 min-w-[3rem] text-right">
                        {formatMetricValue(evaluateFormula(card.formula, formulaVars), card.format, overallCurrency)}
                      </span>
                      {/* Delete */}
                      <button
                        onClick={() => removeCard(i)}
                        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add new card */}
              <div className="border-t border-[var(--color-border-secondary)] pt-4">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">Add a Card</p>

                {/* Quick presets */}
                <div className="mb-3">
                  <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">Quick presets:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_FORMULAS.map((p) => (
                      <button
                        key={p.formula}
                        onClick={() => applyPreset(p)}
                        className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-primary)] text-[var(--color-text-secondary)] transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {/* Label */}
                  <div>
                    <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Label</label>
                    <input
                      type="text"
                      placeholder="e.g. ROAS"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>

                  {/* Formula + variable picker */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-[var(--color-text-secondary)]">Formula</label>
                      {/* Variable groups dropdown — optgroup headers are separators, can't be selected */}
                      <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) { insertVar(e.target.value); e.target.value = ""; } }}
                        className="text-xs border border-[var(--color-border-primary)] rounded px-2 py-1 bg-[var(--color-bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] text-[var(--color-text-secondary)]"
                      >
                        <option value="" disabled>Insert variable…</option>
                        {VARIABLE_GROUPS.map((group) => (
                          <optgroup key={group.label} label={`── ${group.label} ──`}>
                            {group.vars.map((v) => (
                              <option key={v.name} value={v.name} title={v.desc}>{v.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Formula input with autocomplete */}
                    <div className="relative">
                      <input
                        ref={formulaInputRef}
                        type="text"
                        placeholder="e.g. conversion_value / spend"
                        value={newFormula}
                        onChange={(e) => handleFormulaChange(e.target.value)}
                        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      />
                      {/* Autocomplete suggestions */}
                      {suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-0.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] z-10 overflow-hidden">
                          {suggestions.map((s) => (
                            <button
                              key={s}
                              onMouseDown={(e) => { e.preventDefault(); insertVar(s); }}
                              className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Custom conversions note */}
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">
                      <span className="font-mono text-[var(--color-text-secondary)]">conversions</span> &amp; <span className="font-mono text-[var(--color-text-secondary)]">conversion_value</span> reflect your custom purchase event per account — configure it in <span className="font-medium">Account Settings ⚙</span>.
                    </p>
                  </div>

                  {/* Format + preview row */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Format</label>
                      <select
                        value={newFormat}
                        onChange={(e) => setNewFormat(e.target.value as MetricCard["format"])}
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
                      >
                        <option value="currency">Currency (₱1,234)</option>
                        <option value="multiplier">Multiplier (1.23x)</option>
                        <option value="percent">Percent (12.3%)</option>
                        <option value="compact">Compact (12.3K)</option>
                        <option value="number">Number (1,234)</option>
                      </select>
                    </div>
                    {/* Live preview */}
                    {newFormula.trim() && (
                      <div className="shrink-0 text-right pb-1.5">
                        <p className="text-xs text-[var(--color-text-tertiary)]">Preview</p>
                        <p className="text-sm font-bold text-[var(--color-text-primary)]">
                          {formatMetricValue(evaluateFormula(newFormula, formulaVars), newFormat, overallCurrency)}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={addCard}
                    disabled={!newLabel.trim() || !newFormula.trim()}
                    className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-40"
                  >
                    Add Card
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
              <button
                onClick={() => setEditCards([...DEFAULT_METRIC_CARDS])}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline transition-colors"
              >
                Reset to defaults
              </button>
              <button
                onClick={() => { saveMetricCards(editCards); setCustomizeOpen(false); }}
                className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-5 py-1.5 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Column editor modal ──────────────────────────────────────────────── */}
      {colEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setColEditorOpen(false)} />
          <div className="relative bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-secondary)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Ad Table Columns</h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  {isMessengerTab ? "Messenger tab columns" : "Standard campaigns columns"}
                  {" · "}saved separately per tab
                </p>
              </div>
              <button onClick={() => setColEditorOpen(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-lg p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Column list */}
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">Columns</p>
                <div className="space-y-1">
                  {editCols.map((col, i) => {
                    const def = col.custom ? null : AD_COL_DEFS.find((d) => d.id === col.id);
                    const displayLabel = col.custom ? col.label : def?.label;
                    if (!displayLabel) return null;
                    return (
                      <div key={col.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${col.visible ? "bg-[var(--color-bg-secondary)]" : "bg-[var(--color-bg-primary)] opacity-50"}`}>
                        {/* Reorder */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button onClick={() => moveCol(i, -1)} disabled={i === 0}
                            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-20 leading-none text-xs">▲</button>
                          <button onClick={() => moveCol(i, 1)} disabled={i === editCols.length - 1}
                            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-20 leading-none text-xs">▼</button>
                        </div>
                        {/* Toggle */}
                        <button
                          onClick={() => toggleCol(col.id)}
                          className={`w-8 h-4 rounded-full transition-colors shrink-0 ${col.visible ? "bg-[var(--color-text-primary)]" : "bg-[var(--color-border-primary)]"}`}
                        >
                          <span className={`block w-3 h-3 bg-[var(--color-bg-primary)] rounded-full shadow transition-transform mx-0.5 ${col.visible ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                        {/* Label + formula preview */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-[var(--color-text-primary)]">{displayLabel}</span>
                            {col.custom && (
                              <span className="text-xs bg-[var(--color-accent-light)] text-[var(--color-accent)] rounded px-1.5 py-0.5 shrink-0">custom</span>
                            )}
                          </div>
                          {col.custom && col.formula && (
                            <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">{col.formula}</p>
                          )}
                        </div>
                        {/* Delete (custom only) */}
                        {col.custom && (
                          <button onClick={() => removeCustomCol(col.id)}
                            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add custom column */}
              <div className="border-t border-[var(--color-border-secondary)] pt-4">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">Add Custom Column</p>

                {/* Presets */}
                <div className="mb-3">
                  <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">Quick presets:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_FORMULAS.map((p) => (
                      <button key={p.formula} onClick={() => applyColPreset(p)}
                        className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-primary)] text-[var(--color-text-secondary)] transition-colors">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {/* Label */}
                  <div>
                    <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Column label</label>
                    <input
                      type="text"
                      placeholder="e.g. CPP"
                      value={newColLabel}
                      onChange={(e) => setNewColLabel(e.target.value)}
                      className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  {/* Formula */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-[var(--color-text-secondary)]">Formula (per ad)</label>
                      <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) { insertColVar(e.target.value); e.target.value = ""; } }}
                        className="text-xs border border-[var(--color-border-primary)] rounded px-2 py-1 bg-[var(--color-bg-primary)] focus:outline-none text-[var(--color-text-secondary)]"
                      >
                        <option value="" disabled>Insert variable…</option>
                        {VARIABLE_GROUPS.map((group) => (
                          <optgroup key={group.label} label={`── ${group.label} ──`}>
                            {group.vars.map((v) => (
                              <option key={v.name} value={v.name} title={v.desc}>{v.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="relative">
                      <input
                        ref={colFormulaRef}
                        type="text"
                        placeholder="e.g. spend / conversions"
                        value={newColFormula}
                        onChange={(e) => handleColFormulaChange(e.target.value)}
                        onBlur={() => setTimeout(() => setColSuggestions([]), 150)}
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      />
                      {colSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-0.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] z-10 overflow-hidden">
                          {colSuggestions.map((s) => (
                            <button key={s} onMouseDown={(e) => { e.preventDefault(); insertColVar(s); }}
                              className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Format + preview */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Format</label>
                      <select
                        value={newColFormat}
                        onChange={(e) => setNewColFormat(e.target.value as MetricCard["format"])}
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
                      >
                        <option value="currency">Currency (₱1,234)</option>
                        <option value="multiplier">Multiplier (1.23x)</option>
                        <option value="percent">Percent (12.3%)</option>
                        <option value="compact">Compact (12.3K)</option>
                        <option value="number">Number (1,234)</option>
                      </select>
                    </div>
                    {newColFormula.trim() && (
                      <div className="shrink-0 text-right pb-1.5">
                        <p className="text-xs text-[var(--color-text-tertiary)]">Preview*</p>
                        <p className="text-sm font-bold text-[var(--color-text-primary)]">
                          {formatMetricValue(evaluateFormula(newColFormula, formulaVars), newColFormat, overallCurrency)}
                        </p>
                      </div>
                    )}
                  </div>
                  {newColFormula.trim() && (
                    <p className="text-xs text-[var(--color-text-tertiary)]">* Preview uses aggregate totals — actual values are per-ad</p>
                  )}
                  <button
                    onClick={addCustomCol}
                    disabled={!newColLabel.trim() || !newColFormula.trim()}
                    className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-40"
                  >
                    Add Column
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
              <button
                onClick={() => setEditCols(isMessengerTab ? [...DEFAULT_AD_COLUMNS_MESSENGER] : [...DEFAULT_AD_COLUMNS])}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline transition-colors"
              >
                Reset to defaults
              </button>
              <button
                onClick={() => { saveAdColumns(editCols); setColEditorOpen(false); }}
                className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-5 py-1.5 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
              >
                Save for all
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
