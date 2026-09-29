"use client";
/**
 * ChartEngine V2 · **P5/4-UI (بازبینی دوم)** — Control Center
 * frontend/components/domain/historical/ControlCenter.tsx
 * ============================================================
 * 🎯 **اصلاحات این بازبینی (خواستهٔ صریح کاربر ✓):**
 *  ۱) کشو **داخل محدودهٔ چارت** است ✓ (`absolute` روی میزبانِ `relative` که
 *     چارت هم داخلش است ✓) — دیگر `fixed` روی کل صفحه نیست ✗.
 *  ۲) **فلش بازشو وسطِ ارتفاع چارت** روی لبهٔ چپ ✓؛ باز شدن با **انیمیشن نرم**
 *     ✓ و عرض ≈ **یک‌سوم** عرض چارت ✓؛ **کلیک روی چارت/جای خالی ⇒ بستن** ✓
 *     (Esc هم می‌بندد ✓).
 *  ۳) **هر آیتم کلید ON/OFF ظریف خودش** را دارد ✓؛ کلید هدر هم **کوتاه‌تر
 *     (ظریف‌تر)** شد ✓ با حفظ طول ✓.
 *  ۴) **حالت خنثی/غیرفعال حذف شد ✗** — هر آیتم می‌تواند **چند بار** با
 *     پارامترهای متفاوت اضافه شود ✓؛ همهٔ `+`ها **خنثی**اند ✓ (سبز نیستند ✗).
 *  ۵) پارامتر هر آیتم **با رنگ همان سری در چارت** نوشته می‌شود ✓ (`colorKey`
 *     از رجیستری AL ✓ + `resolveSlot` سمت سرور ✓) — مثال کاربر: دورهٔ EMA که
 *     خطش سبز است، سبز دیده می‌شود ✓.
 *  ۶) هر آیتم در یک **قاب/کارت** است ✓ (نه لیست متنی ساده ✗).
 *  ۷) کلیک روی کارت ⇒ **بازشوی آکاردئونیِ درجای همان آیتم** ✓
 *     (بازبینی پنجم: ⛔ کشوی جدا از پایین/زیر چارت **حذف شد** ✗) با اسلایدر +
 *     ورودی عددی و `min/max/step/default` از **AL** ✓ (هیچ عدد اختراعی ✗).
 *
 * **منبع حقیقت واحد:** `engine/core/profiles.ts` (وضعیت + کدک URL ✓) و
 * `engine/core/library.ts` (آیتم‌ها/رنگ‌ها/پارامترهای AL ✓) — هیچ وضعیت موازی
 * در کامپوننت نیست ✗ و هیچ متن سخت‌کدی ندارد ✗ (i18n سرور ✓).
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  Bot,
  ChartCandlestick,
  ChartNoAxesColumnIncreasing,
  Cpu,
  Droplets,
  GripVertical,
  LayoutGrid,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  MODULE_IDS,
  applyProfile,
  decodeState,
  encodeState,
  isKnownModule,
  type ChartState,
  type ModuleId,
} from "@/components/base/engine/core/profiles";
import {
  clampValue,
  itemsOf,
  newInstance,
  paramRulesOf,
  readInstances,
  withInstances,
  type LibraryItemSpec,
  type ParamInstance,
} from "@/components/base/engine/core/library";

/** آیکون‌های ریل — `lucide-react` ✓ (وابستگی موجود پروژه ✓ · رنگ از `currentColor` ✓) */
const TAB_ICONS: Record<ModuleId, LucideIcon> = {
  multichart: LayoutGrid,
  microflow: ChartNoAxesColumnIncreasing,
  indicators: TrendingUp,
  priceaction: ChartCandlestick,
  signals: Bell,
  moneyflow: Droplets,
  pulse: Activity,
  ai: Cpu,
  bots: Bot,
  advanced: SlidersHorizontal,
};

/** یک آیکون تب — `data-cc-icon` برای ردیابی در SSR ✓ (بدون متن روی ریل ✗) */
function TabIcon({ id, size = 16 }: { id: ModuleId; size?: number }) {
  const Icon = TAB_ICONS[id];
  return (
    <span className="inline-flex" data-cc-icon={id}>
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * **کلید ظریف** (`role="switch"`) — **یک اندازه برای همه** ✓ (مورد ۴ بازبینی
 * چهارم: کلید هدر باید **هم‌اندازهٔ** کلید آیتم‌ها و **هم‌تراز** با آن‌ها در راستای
 * افقی باشد ✓ ⇒ دیگر واریانت جدا نداریم ✗).
 * ⚠️ `onClick` هرگز به کارتِ والد **نمی‌رسد** ✓ (وگرنه با هر تیک، کشوی تنظیمات
 *    هم باز می‌شد ✗).
 */
function Switch({
  on,
  label,
  onChange,
  ...rest
}: {
  on: boolean;
  label: string;
  onChange: () => void;
} & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`no-focus-ring relative h-2.5 w-6 shrink-0 rounded-full outline-none transition-colors ${
        on ? "bg-pos" : "bg-border/80"
      }`}
      {...rest}
    >
      <span
        className={`absolute top-0.5 start-0.5 h-1.5 w-1.5 rounded-full bg-white shadow transition-all ${
          on ? "start-4" : ""
        }`}
      />
    </button>
  );
}

/** متن‌های رابط کشو — از i18n سرور ✓ · نبود ⇒ fallback خنثیِ انگلیسی ✓ */
export interface ControlCenterUi {
  title: string;
  open: string;
  close: string;
  on: string;
  off: string;
  active: string;
  library: string;
  add: string;
  remove: string;
  empty: string;
  /** متن دکمه/بازشوی تنظیماتِ یک آیتم (آکاردئون ✓) */
  settings: string;
  params: string;
  noParams: string;
  range: string;
  removeItem: string;
  instance: string;
  /** راهنمای «کلیک روی چارت = بستن» (مورد ۲ ✓) */
  clickAway: string;
}

/** پیش‌فرض‌های خنثی ✓ (صفحه با i18n بازنویسی می‌کند ✓) */
const DEFAULT_UI: ControlCenterUi = {
  title: "Control Center",
  open: "Open control center",
  close: "Close control center",
  on: "ON",
  off: "OFF",
  active: "Active",
  library: "Library",
  add: "Add",
  remove: "Remove",
  empty: "—",
  settings: "Settings",
  params: "Parameters",
  noParams: "This item has no numeric parameters",
  range: "Range",
  removeItem: "Remove item",
  instance: "Instance",
  clickAway: "Click the chart to close",
};

export interface ControlCenterProps {
  /**
   * 🆕 **UI تمِ نسخه‌دار** (بازبینی ششم ✓) — از تمِ انتخاب‌شده می‌آید ✓:
   * عرض کشو · عرض ریل · ناحیهٔ لمس · ستون‌های کتابخانه · اندازهٔ قلم · انیمیشن.
   * ⛔ فقط ظاهر ✗ — هیچ اثری بر پریست/داده ندارد ✓.
   */
  themeUi?: {
    drawerWidth?: string;
    railWidth?: number;
    touchTarget?: number;
    itemColumns?: 1 | 2;
    uiFontSize?: number;
    motion?: "normal" | "reduced";
  };
  /** پروفایل فعال — از سرور/URL ✓ (کاربر انتخابش نمی‌کند ✗) */
  profile: string;
  /** نام کامل هر ماژول ⇒ تول‌تیپ ریل + عنوان پنل ✓ (i18n ✓) */
  moduleLabels?: Partial<Record<string, string>>;
  /** نام نمایشی هر آیتم: کلید = `module.key` ✓ (نبود ⇒ برچسب پشتیبان ✓) */
  itemLabels?: Record<string, string>;
  /**
   * **توضیح کوتاه هر بخش** (`cc.desc.*` ✓) — در **فوتر وسط‌چین** پنل می‌نشیند ✓
   * (مورد ۶: «متن مرتبط با آن بخش» ✓ و **نه** نام آیتم/اندیکاتور ✗).
   */
  moduleDesc?: Partial<Record<string, string>>;
  /** نقشهٔ رنگ: کلید رنگ/اسلات تم ⇒ رنگ **واقعی چارت** ✓ */
  colors?: Record<string, string>;
  /** 🆕 رنگ هر نمونه (`"key#index"` ⇒ رنگ) — از قالب تم ✓ (نمونهٔ دوم/سوم متمایز ✓) */
  instanceColors?: Record<string, string>;
  ui?: Partial<ControlCenterUi>;
}

export function ControlCenter({
  profile,
  moduleLabels = {},
  itemLabels = {},
  moduleDesc = {},
  colors = {},
  instanceColors = {},
  ui,
  themeUi = {},
}: ControlCenterProps) {
  /** متن‌ها: پیش‌فرض خنثی ✓ + بازنویسی با i18n سرور ✓ */
  const t: ControlCenterUi = { ...DEFAULT_UI, ...ui };
  /**
   * 🆕 **مقدارهای ظاهری از تمِ نسخه‌دار** (بازبینی ششم ✓)
   * ⛔ نبودشان = همان مقدار امروز ✓ ⇒ رفتار فعلی دست‌نخورده ✗.
   */
  const drawW = themeUi.drawerWidth ?? "max(15rem,min(22rem,34%))";
  const railW = themeUi.railWidth ?? 36;
  /** `0` = بدون حداقل اجباری (دسکتاپ ✓) · موبایل ۴۴ · TV ۵۶ ✓ */
  const minTouch = themeUi.touchTarget && themeUi.touchTarget > 32 ? themeUi.touchTarget : 0;
  const itemCols = themeUi.itemColumns ?? 2;
  const uiFontPx = themeUi.uiFontSize ?? 12;
  const noMotion = themeUi.motion === "reduced";
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [tab, setTab] = useState<ModuleId>("indicators");
  /** کلیدهای URL که **وضعیت** را حمل می‌کنند (`encodeState` ✓) — فقط همین‌ها بازنویسی می‌شوند ✓ */
  const STATE_URL_KEYS = ["profile", "mod", "p"] as const;
  /** **کشوی داخل چارت:** پیش‌فرض بسته ⇒ چارت تمام‌عرض می‌ماند ✓ */
  const [open, setOpen] = useState(false);
  /** آیتمی که **کشوی تنظیمات از پایین** برایش باز است: `key#index` ✓ (مورد ۷ ✓) */
  const [expanded, setExpanded] = useState<string | null>(null);

  /** وضعیت از URL ✓ (منبع حقیقت واحد ✓) */
  const state = useMemo<ChartState>(() => {
    const decoded = decodeState(sp.toString());
    return decoded.profile === profile ? decoded : applyProfile(profile);
  }, [sp, profile]);

  /**
   * 🟩 **مرحلهٔ ۹ — حفظ پارامترهای صفحه هنگام تغییر وضعیت ماژول‌ها**
   * (رفع باگ «پرش به موقعیتِ تایم‌فریم دیگر» ✗ — شاهد کاربر: چارت روی ۵ دقیقه،
   * با خاموش‌کردن یک اندیکاتور به **موقعیت ۱ ساعته** می‌پرید ✓):
   *   · `encodeState` فقط `profile`/`mod`/`p` می‌سازد ✗ (`profiles.ts:225-239` ✓)
   *   · پیش‌تر `router.replace(pathname + encodeState(next))` **بدون ادغام** بود ✗
   *     ⇒ `asset`/`venue`/`tf`/`pane`/`theme` حذف می‌شدند ✗ ⇒ سرور با تایم‌فریمِ
   *     **پیش‌فرض (`1h`)** رندر می‌کرد ⇒ چارت به موقعیتِ ۱ ساعته می‌پرید ✗✓
   *   · حالا پارامترهای موجود **حفظ** و فقط کلیدهای وضعیت بازنویسی می‌شوند ✓
   *     ⇒ تایم‌فریم/نماد/تم دست‌نخورده ✓ و نما هم با پلِ مرحلهٔ ۸ ثابت می‌ماند ✓.
   */
  const push = (next: ChartState) => {
    const q = new URLSearchParams(sp.toString());
    /** پاک‌سازی وضعیت قبلی (وگرنه خاموش‌کردن، مقدار کهنه را زنده می‌گذاشت ✗) */
    for (const k of STATE_URL_KEYS) q.delete(k);
    /** افزودن وضعیت تازهٔ همین تصمیم ✓ */
    for (const [k, v] of new URLSearchParams(encodeState(next).replace(/^\?/, ""))) {
      q.set(k, v);
    }
    router.replace(`${pathname}?${q.toString()}`);
  };
  /** کپی کم‌عمق کافی است ✓: `params` هر ماژول تازه ساخته می‌شود و نوشتن‌ها
   *  همیشه از `withInstances` (کپی عمیق ✓) رد می‌شوند ✓ */
  const clone = (): ChartState => ({
    ...state,
    modules: Object.fromEntries(
      MODULE_IDS.map((m) => [m, { on: state.modules[m].on, params: { ...state.modules[m].params } }]),
    ) as ChartState["modules"],
  });

  const moduleState = state.modules[tab];

  /** **آیتم‌های واقعیِ روی چارت** — از خودِ `params` (هیچ حالت موازی ✗) */
  const rows = useMemo(
    () =>
      itemsOf(tab).flatMap((spec) =>
        readInstances(moduleState.params, spec).map((inst, index) => ({ spec, inst, index })),
      ),
    [tab, moduleState.params],
  );

  /** نام کامل ماژول (تول‌تیپ ✓) · نام خوانای آیتم (i18n ✓ · نبود ⇒ پشتیبان ✓) */
  const labelOf = (id: string) => moduleLabels[id] ?? id;
  const itemLabel = (id: ModuleId, spec: LibraryItemSpec) => itemLabels[`${id}.${spec.key}`] ?? spec.fallbackLabel;
  /** توضیح کوتاه بخش (فوتر وسط‌چین ✓) — نبود ⇒ خالی (هیچ متن جعلی ✗) */
  const descOf = (id: ModuleId) => moduleDesc[id] ?? "";
  /** رنگ واقعی چارت برای آیتم ✓ (نبود ⇒ خنثی ✓) */
  const colorOf = (spec: LibraryItemSpec) => colors[spec.colorKey];

  /** Esc: اول بستن آکاردئون، بعد بستن کشو ✓ (رفتار استاندارد ✓) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setExpanded((s) => {
        if (s) return null;
        setOpen(false);
        return s;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** نوشتن نمونه‌های یک آیتم ✓ (`forceOn` ⇒ کلید آیتم، ماژول را هم روشن می‌کند ✓) */
  const writeInstances = (spec: LibraryItemSpec, instances: ParamInstance[], forceOn = false) => {
    const next = clone();
    next.modules[tab] = {
      on: forceOn ? true : next.modules[tab].on,
      params: withInstances(next.modules[tab].params, spec, instances),
    };
    push(next);
  };

  /** ④ افزودن **چندباره** ✓ — هر کلیک یک نمونهٔ تازه با پیش‌فرض‌های AL ✓ */
  const addItem = (spec: LibraryItemSpec) =>
    writeInstances(spec, [...readInstances(moduleState.params, spec), newInstance(spec)], true);

  /** ③ کلید ظریف هر آیتم ✓ (خاموش/روشن همان نمونه ✓) */
  const toggleInstance = (spec: LibraryItemSpec, index: number) => {
    const insts = readInstances(moduleState.params, spec).map((x, i) =>
      i === index ? { on: !x.on, values: { ...x.values } } : x,
    );
    writeInstances(spec, insts, insts[index]?.on ?? false);
  };

  /** ⑦ ویرایش پارامتر یک نمونه — کلمپ با قاعدهٔ AL ✓ (هیچ مقدار بیرون بازه ✗) */
  const setParamValue = (spec: LibraryItemSpec, index: number, name: string, raw: string) => {
    const rule = paramRulesOf(spec)[name];
    const num = Number(raw);
    const value = rule ? clampValue(rule, num) : Number.isFinite(num) ? num : 0;
    const insts = readInstances(moduleState.params, spec).map((x, i) =>
      i === index ? { on: x.on, values: { ...x.values, [name]: value } } : x,
    );
    writeInstances(spec, insts);
  };

  /** حذف یک نمونه ✓ (آخرین نمونه ⇒ کلید پاک می‌شود ✓) */
  const removeInstance = (spec: LibraryItemSpec, index: number) => {
    writeInstances(
      spec,
      readInstances(moduleState.params, spec).filter((_, i) => i !== index),
    );
    setExpanded(null);
  };

  /** حذف **آخرین** نمونهٔ یک آیتم — پشت کلید `−` کتابخانه ✓ (برای همهٔ آیتم‌ها ✓) */
  const removeLastInstance = (spec: LibraryItemSpec) => {
    const insts = readInstances(moduleState.params, spec);
    if (!insts.length) return;
    removeInstance(spec, insts.length - 1);
  };

  /**
   * 🆕 **کلید هدر = کلید همهٔ آیتم‌های همان بخش** (بازبینی هفتم ✓):
   * خاموش‌کردن بخش ⇒ **همهٔ نمونه‌ها** خاموش می‌شوند ✓ و روشن‌کردن ⇒ همه روشن ✓
   * (پارامترها و ترتیب دست‌نخورده می‌مانند ✓ — هیچ داده/نمونه‌ای حذف نمی‌شود ✗).
   */
  const toggleModule = () => {
    const next = clone();
    const cur = next.modules[tab];
    const nextOn = !cur.on;
    const params: Record<string, unknown> = { ...cur.params };
    for (const [key, raw] of Object.entries(params)) {
      if (!Array.isArray(raw)) continue;
      params[key] = raw
        .filter((v): v is ParamInstance => !!v && typeof v === "object" && "values" in (v as object))
        .map((inst) => ({ on: nextOn, values: { ...inst.values } }));
    }
    next.modules[tab] = { on: nextOn, params };
    push(next);
  };

  /**
   * **③ سورت/جابجایی با درگ‌ودراپ (مورد ۳):**
   * ترتیب نمایش = **خودِ داده** ✓ — هم ترتیب نمونه‌های هر آیتم (آرایه ✓) و هم
   * ترتیب کلیدهای `params` (ترتیب درجِ کلید در آبجکت ✓ که در URL هم حفظ می‌شود ✓).
   * ⇒ هیچ فهرست ترتیبِ موازی/جدا ساخته نمی‌شود ✗.
   */
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [overRow, setOverRow] = useState<number | null>(null);

  const reorderRows = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    const flat = rows.map(({ spec, inst }) => ({ key: spec.key, inst }));
    const [moved] = flat.splice(from, 1);
    if (!moved) return;
    flat.splice(to, 0, moved);
    const groups = new Map<string, ParamInstance[]>();
    for (const { key, inst } of flat) {
      const list = groups.get(key) ?? [];
      list.push(inst);
      groups.set(key, list);
    }
    const params: Record<string, unknown> = {};
    for (const [key, insts] of groups) params[key] = insts;
    /** تومبستون‌های آیتم‌های حذف‌شده باید بمانند ✓ وگرنه پریست آن‌ها را زنده می‌کند ✗ */
    for (const [key, raw] of Object.entries(moduleState.params)) {
      if (!(key in params) && Array.isArray(raw) && !raw.length) params[key] = [];
    }
    const next = clone();
    next.modules[tab] = { ...next.modules[tab], params };
    push(next);
    setExpanded(null);
  };

  /**
   * **④ لینک چارت ↔ کنترل (مورد ۴):** لجندِ اندیکاتورها که **داخل خودِ چارت** رسم
   * می‌شود (`ChartLegend.tsx` ✓) رویداد `cc:focus` می‌فرستد ⇒ همین‌جا کشو باز
   * می‌شود، تب و **آیتم همان سری** انتخاب و تنظیماتش باز می‌شود ✓.
   * مسیر برعکس: هاور روی کارت ⇒ `cc:highlight` ⇒ همان ردیف لجند چارت هایلایت ✓.
   */
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ module?: string; key?: string; index?: number }>).detail;
      if (!detail?.module || !isKnownModule(detail.module)) return;
      setTab(detail.module);
      setOpen(true);
      /**
       * ④ **لینک چارت ⇒ کنترل** (`cc:focus` ✓): تب همان ماژول + کشو باز +
       * **باز شدن آکاردئونِ همان آیتم درجای خود** ✓ + اسکرول نرم تا آن کارت ✓
       * (مورد ۳ بازبینی پنجم: دیگر هیچ کشویی زیر چارت نیست ✗).
       */
      const target = detail.key ? `${detail.key}#${detail.index ?? 0}` : null;
      setExpanded(target);
      if (target) {
        window.setTimeout(() => {
          document
            .getElementById(`cc-item-${target.replace("#", "-")}`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 80);
      }
    };
    window.addEventListener("cc:focus", onFocus as EventListener);
    return () => window.removeEventListener("cc:focus", onFocus as EventListener);
  }, []);

  /** هایلایت کارت ⇒ ردیف لجند چارت ✓ (`null` = پاک‌کردن ✓) */
  const highlightChart = (key: string | null) => {
    window.dispatchEvent(new CustomEvent("cc:highlight", { detail: { module: tab, key } }));
  };

  /** خلاصهٔ خوانا برای ردگیری در SSR ✓ (`ema 21 · ema 55 · sma 50` ✓) */
  const summary = rows.length
    ? rows
        .map(({ spec, inst }) => {
          const vals = Object.values(inst.values);
          return `${spec.key}${vals.length ? ` ${vals.join("/")}` : ""}`;
        })
        .join(" · ")
    : "—";

  /** کلید آیتمِ بازشده = `key#index` ✓ (بازشوی آکاردئونی **درجای خود** ✓) */
  const isExpanded = (key: string, index: number) => expanded === `${key}#${index}`;
  const toggleExpanded = (key: string, index: number) =>
    setExpanded((cur) => (cur === `${key}#${index}` ? null : `${key}#${index}`));

  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-cc-host="chart">
      {/* ② اسکریم شفاف روی چارت — «کلیک روی چارت/جای خالی ⇒ بستن» ✓ */}
      {open ? (
        <button
          type="button"
          data-cc-scrim
          aria-label={t.close}
          title={t.clickAway}
          onClick={() => {
            setExpanded(null);
            setOpen(false);
          }}
          className="no-focus-ring pointer-events-auto absolute inset-0 z-10 cursor-default"
        />
      ) : null}

      {/* ② فلش بازشو — **وسط ارتفاع چارت، لبهٔ چپ** ✓ */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-cc-toggle={open ? "close" : "open"}
        aria-expanded={open}
        aria-controls="control-center"
        title={open ? t.close : t.open}
        aria-label={open ? t.close : t.open}
        className={`no-focus-ring pointer-events-auto absolute left-0 top-1/2 z-50 -translate-y-1/2 rounded-e-md border border-s-0 border-border bg-surface/95 px-1 py-1.5 text-muted shadow-md backdrop-blur transition-all duration-300 hover:text-pos ${
          open ? "pointer-events-none -translate-x-2 opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        {open ? (
          <PanelLeftClose size={15} aria-hidden="true" />
        ) : (
          <PanelLeftOpen size={15} aria-hidden="true" />
        )}
      </button>

      {/* ① کشو — داخل محدودهٔ چارت ✓ · انیمیشن نرم ✓ · ~۱/۳ عرض ✓ */}
      <aside
        id="control-center"
        data-control-center={profile}
        data-cc-open={open ? "1" : "0"}
        data-cc-drawer
        inert={!open}
        /** 🆕 عرض/قلمِ کشو از **تم** ✓ + انیمیشن کم برای TV ✓ */
        style={{ width: drawW, fontSize: `${uiFontPx}px` }}
        data-cc-drawer-width={drawW}
        data-cc-motion={noMotion ? "reduced" : "normal"}
        className={`pointer-events-auto absolute inset-y-0 left-0 z-20 flex flex-col border-r border-border/60 bg-surface/95 shadow-2xl backdrop-blur ${
          noMotion ? "transition-none" : "transition-[transform,opacity] duration-300 ease-out"
        } ${open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"}`}
      >
        <div className="flex min-h-0 flex-1 gap-1.5 p-2 ps-3 pt-3">
          {/* ریل آیکونی — نام کامل فقط در تول‌تیپ ✓ (فعال سبز ✓ · غیرفعال خنثی ✓) */}
          <nav
            className="flex shrink-0 flex-col gap-0.5"
            style={{ width: `${railW}px` }}
            data-cc-tabs
            role="tablist"
            aria-label={t.title}
            aria-orientation="vertical"
          >
            {MODULE_IDS.map((id) => {
              const on = state.modules[id].on;
              const selected = id === tab;
              const label = labelOf(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setTab(id);
                    setExpanded(null);
                  }}
                  data-cc-tab={id}
                  data-cc-tab-on={on ? "1" : "0"}
                  data-cc-tab-selected={selected ? "1" : "0"}
                  aria-label={`${label} · ${on ? t.on : t.off}`}
                  /** 🆕 اندازهٔ تب و ناحیهٔ لمس از **تم** ✓ (TV: ۴۴px ریل · لمسی ۵۶ ✓) */
                  style={{
                    width: `${railW - 4}px`,
                    height: `${railW - 4}px`,
                    ...(minTouch ? { minHeight: `${minTouch}px` } : {}),
                  }}
                  className={`no-focus-ring flex items-center justify-center rounded-md border border-transparent outline-none transition-colors ${
                    selected
                      ? "text-pos"
                      : on
                        ? "text-foreground/60 hover:bg-surface-2 hover:text-foreground"
                        : "text-muted hover:bg-surface-2 hover:text-foreground/70"
                  }`}
                >
                  <TabIcon id={id} />
                </button>
              );
            })}
          </nav>

          <section
            className="flex min-w-0 flex-1 flex-col"
            data-cc-panel={tab}
            role="tabpanel"
            aria-label={labelOf(tab)}
          >
            {/*
             * ① هدر بخش — **بدون آیکون** ✓ · نام **کامل** ماژول، **وسط‌چین** و
             * کوچک‌تر/ظریف‌تر ✓ (مورد ۳) · کلید ON/OFF **هم‌اندازهٔ** کلید آیتم‌ها ✓
             * و **هم‌ترازِ** ستون کلیدهای آیتم‌ها در راستای افقی ✓ (مورد ۴).
             * ② ارتفاع ردیف = ارتفاع آیکون اولِ ریل (`h-8`) ⇒ **نام هدر با نخستین
             *    آیکون تب‌ها (Multi-Chart) هم‌تراز عمودی** می‌شود ✓ (مورد ۲).
             */}
            <header
              style={{ height: `${railW - 4}px` }}
              className="flex items-center gap-1 border-b border-border/40 px-[7px]"
              data-cc-panel-header
            >
              <span
                className="min-w-0 flex-1 truncate text-center text-foreground/70"
                title={labelOf(tab)}
                data-cc-panel-title
              >
                {labelOf(tab)}
              </span>
              <Switch
                on={moduleState.on}
                label={`${labelOf(tab)} · ${moduleState.on ? t.on : t.off}`}
                onChange={toggleModule}
                data-cc-switch={tab}
                data-cc-switch-on={moduleState.on ? "1" : "0"}
              />
            </header>

            {/*
             * ⛔ اسکرول‌بارِ خودِ لیست **پنهان** است ✗ ⇒ عرض محتوا همیشه ثابت
             * می‌ماند و ستون کلیدهای هدر/آیتم‌ها **در هر شرایطی (و ریسپانسیو)**
             * هم‌تراز می‌ماند ✓ (مورد ۲) · اسکرول با چرخ ماوس/لمس کار می‌کند ✓.
             */}
            <div
              className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-cc-active
            >
              {/* ⑥ **کارتِ** آیتم‌های فعال (نه لیست متنی ✗) — کلیک ⇒ کشوی تنظیمات ✓ */}
              {rows.length === 0 ? (
                <p className="text-muted" data-cc-active-empty>
                  {t.empty}
                </p>
              ) : (
                rows.map(({ spec, inst, index }, rowIdx) => {
                  /** 🆕 رنگ **همین نمونه** (نمونهٔ دوم/سوم ≠ اولی ✓) — نبود ⇒ رنگ آیتم ✓ */
                  const color = instanceColors[`${spec.key}#${index}`] ?? colorOf(spec);
                  return (
                    <div
                      key={`${spec.key}#${index}`}
                      id={`cc-item-${spec.key}-${index}`}
                      /** ④ هاور روی کارت ⇒ همان ردیف لجند در چارت هایلایت می‌شود ✓ */
                      onMouseEnter={() => highlightChart(spec.key)}
                      onMouseLeave={() => highlightChart(null)}
                      data-cc-item={spec.key}
                      data-cc-inst={index}
                      data-cc-item-on={inst.on ? "1" : "0"}
                      data-cc-item-color={color ?? "none"}
                      data-cc-item-row={rowIdx}
                      data-cc-expanded={isExpanded(spec.key, index) ? "1" : "0"}
                      className={`rounded-md border border-border/50 bg-surface-2/40 transition-colors hover:border-border ${
                        dragRow === rowIdx ? "opacity-40" : ""
                      } ${overRow === rowIdx && dragRow !== rowIdx ? "ring-1 ring-pos/60" : ""}`}
                    >
                      {/*
                       * ③ **ردیف سرِ کارت** (درگ‌ودراپ + کلیک ⇒ بازشوی آکاردئون ✓).
                       * ⛔ کنترل‌های تنظیمات **بیرونِ** این دکمه‌اند ✗ (نقض a11y ✗).
                       */}
                      <div
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          setDragRow(rowIdx);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(rowIdx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (overRow !== rowIdx) setOverRow(rowIdx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = dragRow ?? Number(e.dataTransfer.getData("text/plain"));
                          reorderRows(from, rowIdx);
                          setDragRow(null);
                          setOverRow(null);
                        }}
                        onDragEnd={() => {
                          setDragRow(null);
                          setOverRow(null);
                        }}
                        onClick={() => toggleExpanded(spec.key, index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpanded(spec.key, index);
                          }
                        }}
                        aria-expanded={isExpanded(spec.key, index)}
                        title={`${itemLabel(tab, spec)} — ${t.settings}`}
                        data-cc-item-head={`${spec.key}#${index}`}
                        style={minTouch ? { minHeight: `${minTouch}px` } : undefined}
                        className="no-focus-ring flex cursor-pointer items-center gap-1.5 px-1.5 py-1 outline-none"
                      >
                      {/* دستهٔ درگ ✓ (قابلیت جابجایی معلوم باشد ✓) */}
                      <GripVertical
                        size={11}
                        className="shrink-0 cursor-grab text-muted"
                        aria-hidden="true"
                        data-cc-grip={spec.key}
                      />
                      {/* نشانگر رنگ = رنگ **همان سری در چارت** ✓ (مورد ۵ ✓) */}
                      <span
                        className="h-2.5 w-1 shrink-0 rounded-full"
                        style={{ background: color ?? "var(--muted)" }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">
                        {itemLabel(tab, spec)}
                      </span>
                      {/* پارامترها **به رنگ همان سری** ✓ (مورد ۵: «پارامترهاشون رنگی هست» ✓) */}
                      {Object.entries(inst.values).map(([name, value]) => (
                        <span
                          key={name}
                          className="tnum shrink-0 rounded bg-surface/70 px-1"
                          style={{ color }}
                          data-cc-param={name}
                          data-cc-param-value={String(value)}
                          title={`${name} = ${value}`}
                        >
                          {value}
                        </span>
                      ))}
                      {/* ⛔ آیکون ⚙ حذف شد ✗ — کل کارت کلیک‌پذیر است و فقط
                          دستهٔ درگ + کلید ON/OFF می‌ماند ⇒ کارتِ تمیزتر ✓ */}
                      {/* ③ کلید ON/OFF **ظریفِ همین آیتم** ✓ */}
                      <Switch
                        on={inst.on}
                        label={`${itemLabel(tab, spec)} · ${inst.on ? t.on : t.off}`}
                        onChange={() => toggleInstance(spec, index)}
                        data-cc-item-switch={`${spec.key}#${index}`}
                        data-cc-item-switch-on={inst.on ? "1" : "0"}
                      />
                      </div>

                      {/*
                       * ③ **بدنهٔ آکاردئون (مورد ۳):** ارتفاع با انیمیشن نرم زیاد
                       * می‌شود (`grid-rows: 0fr → 1fr` ✓ + فید نرم ✓) و آیتم‌های
                       * پایین را **به سمت پایین شیفت می‌دهد** ✓ — هیچ کشویی زیر
                       * چارت باز نمی‌شود ✗.
                       */}
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                          isExpanded(spec.key, index)
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                        data-cc-item-body={`${spec.key}#${index}`}
                        /** وقتی بسته است، کنترل‌ها **از tab/a11y خارج** می‌شوند ✓ */
                        inert={!isExpanded(spec.key, index)}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="mx-1.5 flex flex-col gap-1.5 border-t border-border/40 px-0.5 pt-1.5 pb-1">
                            <ItemSettings
                              spec={spec}
                              instance={inst}
                              color={color}
                              t={t}
                              onParam={(name, value) => setParamValue(spec, index, name, value)}
                              onRemove={() => removeInstance(spec, index)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* ④ کتابخانه — **همهٔ `+` خنثی** ✓ · کلیک مکرر = افزودن چندباره ✓ */}
              <p className="mt-1 text-center text-muted" data-cc-library-title>
                {t.library}
              </p>
              <div className={`grid gap-1 ${itemCols === 1 ? "grid-cols-1" : "grid-cols-2"}`} data-cc-library>
                {itemsOf(tab).map((spec) => {
                  const count = readInstances(moduleState.params, spec).length;
                  return (
                    <div
                      key={spec.key}
                      className="flex items-stretch gap-1"
                      style={minTouch ? { minHeight: `${minTouch}px` } : undefined}
                    >
                      {/* ④ کلید `+` — افزودن نمونهٔ تازه (هر بار ✓ · چند-نمونه ✓) */}
                      <button
                        type="button"
                        onClick={() => addItem(spec)}
                        data-cc-lib-item={spec.key}
                        data-cc-lib-count={count}
                        title={`${t.add}: ${itemLabel(tab, spec)}`}
                        className="no-focus-ring flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border/50 bg-surface-2/30 px-1.5 py-1 text-start text-muted transition hover:border-border hover:text-foreground"
                      >
                        <Plus size={12} className="shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-foreground/70">
                          {itemLabel(tab, spec)}
                        </span>
                        {count ? (
                          <span className="tnum shrink-0" data-cc-lib-badge>
                            {count}
                          </span>
                        ) : null}
                      </button>
                      {/* ④ کلید `−` — حذف **آخرین** نمونهٔ همین آیتم ✓ (برای همهٔ آیتم‌ها ✓) */}
                      <button
                        type="button"
                        disabled={!count}
                        onClick={() => removeLastInstance(spec)}
                        data-cc-lib-remove={spec.key}
                        title={`${t.remove}: ${itemLabel(tab, spec)}`}
                        aria-label={`${t.remove}: ${itemLabel(tab, spec)}`}
                        className="no-focus-ring flex w-6 shrink-0 items-center justify-center rounded-md border border-border/50 bg-surface-2/30 text-muted transition hover:border-border hover:text-neg disabled:cursor-default disabled:opacity-30"
                      >
                        <Minus size={12} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/*
             * ⑥ فوتر پنل — **توضیح کوتاه همان بخش**، وسط‌چین و ریز ✓ (مورد ۶).
             * ⛔ نام آیتم/اندیکاتور این‌جا نوشته نمی‌شود ✗ (خواستهٔ صریح کاربر ✓).
             * `data-cc-summary` فقط برای **ردگیری در SSR** می‌ماند ✓ (خروجی بصری ندارد ✓).
             */}
            <footer
              className="mt-1 border-t border-border/40 pt-1 text-center text-[10px] leading-relaxed text-muted"
              data-cc-summary={summary}
              data-cc-desc={tab}
            >
              {descOf(tab)}
            </footer>

          </section>
        </div>
      </aside>
    </div>
  );
}

/**
 * **تنظیماتِ درون‌کارتیِ یک آیتم (مورد ۳ بازبینی پنجم ✓)**
 * ============================================================
 * ⛔ پیش از این، تنظیمات در یک **کشوی جدا زیر چارت** باز می‌شد ✗ — کاربر گفت این
 *    اشتباه است ✗ ⇒ حالا **بازشوی آکاردئونی درجای خودِ آیتم** است ✓: کارت بلند
 *    می‌شود و آیتم‌های پایینی با انیمیشن نرم به پایین شیفت می‌خورند ✓.
 *   · پارامترها از اسکیمای **AL** ✓ (`min/max/step/unit` ✓) ⇒ اسلایدر + ورودی عددی ✓
 *   · مقدارها **به رنگ همان سری چارت** ✓
 *   · آیتم بی‌پارامتر ⇒ پیام صادقانه ✓ (هیچ فیلد ساختگی ساخته نمی‌شود ✗)
 */
function ItemSettings({
  spec,
  instance,
  color,
  t,
  onParam,
  onRemove,
}: {
  spec: LibraryItemSpec;
  instance: ParamInstance;
  color?: string;
  t: ControlCenterUi;
  onParam: (name: string, value: string) => void;
  onRemove: () => void;
}) {
  const rules = paramRulesOf(spec);
  const names = Object.keys(rules);
  return (
    <>
      {names.length === 0 ? (
        <p className="text-muted" data-cc-item-noparams={spec.key}>
          {t.noParams}
        </p>
      ) : (
        names.map((name) => {
          const rule = rules[name]!;
          const value = instance.values[name] ?? rule.default;
          return (
            <label key={name} className="flex flex-col gap-0.5" data-cc-setting-param={name}>
              <span className="flex items-center gap-1.5">
                <span className="text-muted">{name}</span>
                <span
                  className="tnum font-medium"
                  style={{ color }}
                  data-cc-setting-value={String(value)}
                >
                  {value}
                  {rule.unit ?? ""}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onParam(name, String(value - rule.step))}
                    data-cc-setting-dec={name}
                    aria-label={`${name} -${rule.step}`}
                    className="no-focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 text-muted transition hover:border-border hover:text-foreground"
                  >
                    <Minus size={10} aria-hidden="true" />
                  </button>
                  <input
                  type="number"
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  value={value}
                  onChange={(e) => onParam(name, e.target.value)}
                  data-cc-setting-input={name}
                  aria-label={name}
                  className="num-field no-focus-ring min-w-0 flex-1 text-center"
                />
<button
                    type="button"
                    onClick={() => onParam(name, String(value + rule.step))}
                    data-cc-setting-inc={name}
                    aria-label={`${name} +${rule.step}`}
                    className="no-focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 text-muted transition hover:border-border hover:text-foreground"
                  >
                    <Minus size={10} aria-hidden="true" />
                  </button>

              </span>
            </label>
          );
        })
      )}
      <button
        type="button"
        onClick={onRemove}
        data-cc-remove-item={spec.key}
        title={t.removeItem}
        aria-label={`${t.removeItem}: ${spec.fallbackLabel}`}
        className="no-focus-ring mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-muted transition hover:text-neg"
      >
        <Trash2 size={11} aria-hidden="true" />
        <span>{t.removeItem}</span>
      </button>
    </>
  );
}

