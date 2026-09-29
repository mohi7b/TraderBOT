/**
 * ChartEngine V2 · **P3-a** — پروفایل‌ها + وضعیت (URL-محور)
 * frontend/components/base/engine/core/profiles.ts
 *  · قرارداد قفل‌شده: **«پروفایل = پریست، نه چارت جدید»** ✗
 *    همهٔ پروفایل‌ها روی **یک** موتور (`engine: "time-chart"`) ✓
 *  · وضعیت قابل اشتراک/بازگشت با URL ✓
 * ⚠️ صفر وابستگی به React/DOM ✗ ⇒ selfTest در Node ✓ و انتشار در SSR ✓.
 */

export const ENGINE_KIND = "time-chart" as const;

/** نوع نمونهٔ پارامتری — تعریفش در `library.ts` است ✓ (بدون دورِ ران‌تایم: `import type` ✓) */
import type { ParamInstance } from "./library";
import { MAX_INSTANCES_PER_ITEM, MAX_PARAMS_PER_INSTANCE } from "./library";

export const MODULE_IDS = [
  "multichart",
  "microflow",
  "indicators",
  "priceaction",
  "signals",
  "moneyflow",
  "pulse",
  "ai",
  "bots",
  "advanced",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export function isKnownModule(id: string): id is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(id);
}

export interface ModuleState {
  on: boolean;
  params: Record<string, unknown>;
}

export interface ChartProfile {
  id: string;
  nameKey: string;
  /** همیشه یک چارت ✓ (اصل «پروفایل ≠ چارت جدید» ✗) */
  engine: typeof ENGINE_KIND;
  modules: Partial<Record<ModuleId, ModuleState>>;
}

export interface ChartState {
  profile: string;
  engine: typeof ENGINE_KIND;
  modules: Record<ModuleId, ModuleState>;
}

const OFF: ModuleState = { on: false, params: {} };
const p = (on: boolean, params: Record<string, unknown> = {}): ModuleState => ({ on, params });

/**
 * **P5/4-UI — پارامترها چند-نمونه‌ای شدند ✓ (خواستهٔ صریح کاربر):**
 * «اندیکاتور/سیگنال/هر آیتم می‌تواند **چند بار** با پارامترهای متفاوت روی
 * چارت اضافه شود» ✓ ⇒ مقدار هر کلید یک **آرایهٔ نمونه** است، نه یک عدد ✗:
 *
 *   `{ ema: [{ on: true, values: { period: 21 } }, { on: true, values: { period: 55 } }] }`
 *
 * ⚠️ نام پارامترها و `min/max/step/default` از **AL** می‌آید
 * (`components/base/engine/core/library.ts` ✓) — هیچ عددی این‌جا تکرار نمی‌شود ✗.
 */
const i = (values: Record<string, number> = {}, on = true): ParamInstance => ({ on, values });

/** شش پروفایل مارکتینگ — همه روی همان موتور ✓ */
export const PROFILES: readonly ChartProfile[] = Object.freeze([
  { id: "classic", nameKey: "profile.classic", engine: ENGINE_KIND, modules: { multichart: p(true), indicators: p(true, { ema: [i({ period: 21 })], sma: [i({ period: 50 })] }) } },
  { id: "micro", nameKey: "profile.micro", engine: ENGINE_KIND, modules: { multichart: p(true), indicators: p(true), microflow: p(true) } },
  { id: "flow", nameKey: "profile.flow", engine: ENGINE_KIND, modules: { multichart: p(true), indicators: p(true), moneyflow: p(true), pulse: p(true) } },
  { id: "ai", nameKey: "profile.ai", engine: ENGINE_KIND, modules: { multichart: p(true), indicators: p(true), ai: p(true) } },
  { id: "hybrid", nameKey: "profile.hybrid", engine: ENGINE_KIND, modules: { multichart: p(true), indicators: p(true), priceaction: p(true), signals: p(true) } },
  {
    /**
     * **مدلِ Pro (پیش‌فرض صفحهٔ تاریخی ✓):** همهٔ ۱۰ ماژول روشن ✓ **به‌همراه
     * پارامترهای پیش‌فرضِ معنادار** — چون کشوی «مرکز فرماندهی» بخشِ «آیتم‌های فعال»
     * را از همین `params` می‌سازد و با `{}` خالی می‌ماند ✗.
     * ⚠️ این پارامترها **داده نمی‌سازند** ✗ — فقط پریستِ انتخاب‌های کاربر هستند ✓
     * (همان کلیدهای کتابخانهٔ `LIBRARY` در `ControlCenter.tsx` ✓).
     */
    id: "pro",
    nameKey: "profile.pro",
    engine: ENGINE_KIND,
    modules: {
      ...(Object.fromEntries(MODULE_IDS.map((m) => [m, p(true)])) as Record<ModuleId, ModuleState>),
      /**
       * پارامترها = **نمونه‌های واقعیِ روی چارت** ✓ با پیش‌فرض‌های AL ✓
       * (خرج از کتابخانه: `core/library.ts` ✓ — هیچ عددی این‌جا اختراع نشده ✗).
       */
      indicators: p(true, { ema: [i({ period: 21 })], sma: [i({ period: 50 })] }),
      priceaction: p(true, { swing: [i({ pivot: 2, minBars: 3 })], bos: [i()], fvg: [i()] }),
      signals: p(true, { cross: [i()], volumeSpike: [i({ window: 20, z: 2 })] }),
      moneyflow: p(true, { cvd: [i()], funding: [i()], openInterest: [i()] }),
    },
  },
]);

export function profileIds(): string[] {
  return PROFILES.map((x) => x.id);
}

export function emptyState(profile = "classic"): ChartState {
  return {
    profile,
    engine: ENGINE_KIND,
    modules: Object.fromEntries(MODULE_IDS.map((m) => [m, { ...OFF }])) as Record<ModuleId, ModuleState>,
  };
}

/**
 * کپی **عمیق** پارامترها ✓ — چون مقدارها دیگر اسکالر نیستند ✗:
 * آرایهٔ نمونه‌ها باید کپی شود وگرنه ویرایش یک ماژول، پریست/بقیه را هم عوض
 * می‌کند ✗ (باگ کلاسیکِ اشتراک شیء ✓ — `librarySelfTest` هم آن را می‌سنجد ✓).
 */
function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(params ?? {})) {
    if (!Array.isArray(raw)) {
      /** فرم قدیمیِ اسکالر: عیناً نگه داشته می‌شود ✓ (خواندنش تحمل‌پذیر است ✓) */
      out[key] = raw;
      continue;
    }
    out[key] = raw.map((v) => {
      if (v && typeof v === "object" && "values" in (v as object)) {
        const inst = v as ParamInstance;
        return { on: !!inst.on, values: { ...inst.values } };
      }
      return v;
    });
  }
  return out;
}

/** اعمال یک پروفایل روی وضعیت (یا ساخت از صفر) ✓ */
export function applyProfile(profileId: string, base?: ChartState): ChartState {
  const found = PROFILES.find((x) => x.id === profileId) ?? PROFILES[0]!;
  const state = base ? { ...base, modules: { ...base.modules } } : emptyState(found.id);
  state.profile = found.id;
  state.engine = ENGINE_KIND;
  for (const m of MODULE_IDS) {
    const spec = found.modules[m];
    state.modules[m] = spec ? { on: spec.on, params: cloneParams(spec.params) } : { ...OFF };
  }
  return state;
}

/**
 * **کدک پارامترها (P5/4-UI)** — چرا؟ چون وضعیتِ کشو باید **قابل اشتراک/بازگشت**
 * باشد ✓ وگرنه هر تیک ماژول، پارامترهای ویرایش‌شدهٔ کاربر را دور می‌ریخت ✗
 * (باگ واقعی نسخهٔ قبل: `encodeState` پارامترها را در URL نمی‌برد ✗).
 *
 * قالب: `p=indicators.ema:1~period=21|1~period=55;signals.cross:1`
 *   · `;` بین آیتم‌ها ✓ · `|` بین نمونه‌ها ✓ · `~` جداکنندهٔ کلید ON/OFF ✓
 *   · `k=v` با `,` ✓ (بدون پارامتر ⇒ فقط `1`/`0` ✓)
 * ⛔ این تابع **اسکیماآگاه نیست** ✓ — فقط شکل کانونیک را می‌شناسد (اعتبارسنجی
 *    دامنه‌ای در `library.ts` ✓).
 */
export function encodeParams(modules: Record<ModuleId, ModuleState>): string {
  const entries: string[] = [];
  for (const m of MODULE_IDS) {
    for (const [key, raw] of Object.entries(modules[m]?.params ?? {})) {
      if (!Array.isArray(raw)) continue;
      /** **تومبستون** `[]` ⇒ «همهٔ نمونه‌های این آیتم حذف شده» ✓ (ثبت می‌شود ✓) */
      if (!raw.length) {
        entries.push(`${m}.${key}:`);
        continue;
      }
      const insts = raw
        .filter((v): v is ParamInstance => !!v && typeof v === "object" && "values" in (v as object))
        .slice(0, MAX_INSTANCES_PER_ITEM)
        .map((inst) => {
          const kv = Object.entries(inst.values ?? {})
            .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
            .slice(0, MAX_PARAMS_PER_INSTANCE)
            .map(([k, v]) => `${k}=${v}`)
            .join(",");
          return kv ? `${inst.on ? 1 : 0}~${kv}` : `${inst.on ? 1 : 0}`;
        });
      if (insts.length) entries.push(`${m}.${key}:${insts.join("|")}`);
    }
  }
  return entries.join(";");
}

/** بازگشت پارامترها از URL — تحمل‌پذیر ✓ (ناشناس/نامعتبر نادیده ✓ · سقف‌دار ✓) */
export function decodeParams(raw: string | null): Partial<Record<ModuleId, Record<string, ParamInstance[]>>> {
  const out: Partial<Record<ModuleId, Record<string, ParamInstance[]>>> = {};
  if (!raw) return out;
  for (const entry of raw.split(";")) {
    const colon = entry.indexOf(":");
    const dot = entry.indexOf(".");
    if (colon <= 0 || dot <= 0 || dot > colon) continue;
    const mod = entry.slice(0, dot);
    const key = entry.slice(dot + 1, colon);
    if (!isKnownModule(mod) || !key) continue;
    const insts: ParamInstance[] = [];
    for (const chunk of entry.slice(colon + 1).split("|")) {
      if (!chunk || insts.length >= MAX_INSTANCES_PER_ITEM) continue;
      const tilde = chunk.indexOf("~");
      const flag = tilde < 0 ? chunk : chunk.slice(0, tilde);
      const values: Record<string, number> = {};
      if (tilde >= 0) {
        for (const pair of chunk.slice(tilde + 1).split(",")) {
          const eq = pair.indexOf("=");
          if (eq <= 0 || Object.keys(values).length >= MAX_PARAMS_PER_INSTANCE) continue;
          const num = Number(pair.slice(eq + 1));
          if (Number.isFinite(num)) values[pair.slice(0, eq)] = num;
        }
      }
      insts.push({ on: flag !== "0", values });
    }
    /** ⚠️ حتی با صفر نمونه ثبت می‌شود ⇒ **تومبستون** (حذفِ ماندگار ✓) */
    out[mod] = { ...(out[mod] ?? {}), [key]: insts };
  }
  return out;
}

/**
 * اشتراک با URL: `?profile=hybrid&mod=indicators+moneyflow&p=…`
 * ⚠️ `mod` = ماژول‌های **روشن** ✓ · `p` = نمونه‌های پارامتری (فقط اگر وجود داشته باشند ✓).
 */
export function encodeState(state: ChartState): string {
  const on = MODULE_IDS.filter((m) => state.modules[m]?.on);
  const q = new URLSearchParams();
  q.set("profile", state.profile);
  /**
   * ⚠️ **همیشه نوشته می‌شود — حتی خالی (``"mod="``)** ✓:
   * `mod` = **فهرستِ کاملِ روشن‌ها** ✓ ⇒ خاموش‌کردن یک بخش، در URL محفوظ می‌ماند ✓
   * (باگ واقعیِ بازبینی هفتم ✗: اگر بخشی خاموش می‌شد، در `mod` نمی‌آمد و
   *  `decodeState` آن را از **پریست** دوباره روشن می‌کرد ✗).
   */
  q.set("mod", on.join("+"));
  const params = encodeParams(state.modules);
  if (params) q.set("p", params);
  return `?${q.toString()}`;
}

/** بازگشت از URL (تحمل‌پذیر: پروفایل/ماژول/پارامتر ناشناس نادیده ✓) */
export function decodeState(search: string): ChartState {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const state = applyProfile(q.get("profile") ?? "classic");
  const mod = q.get("mod");
  /**
   * ⚠️ **`mod` = فهرستِ کاملِ روشن‌ها** (بازبینی هفتم ✓): اگر در URL آمده باشد —
   * حتی خالی ✓ — اول **همه خاموش** می‌شوند و سپس فهرست روشن می‌شود ✓ ⇒ بخشِ
   * خاموش‌شده دیگر از پریست «زنده» نمی‌شود ✗ (شاهد: `mod=multichart` ⇒ فقط
   * چارت چندگانه ✓).
   */
  if (mod !== null) {
    for (const id of MODULE_IDS) {
      state.modules[id] = { on: false, params: cloneParams(state.modules[id].params) };
    }
    /**
     * ⚠️ جداکنندهٔ `mod` ممکن است **`+`** باشد (ساخت خودمان ✓) یا **فاصله**
     * (وقتی کسی دستی `a+b` در نوار آدرس بنویسد ⇒ form-decoding آن را به فاصله
     *  تبدیل می‌کند ✗). باگ واقعیِ بازبینی هفتم: تقسیم فقط با `"+"` ⇒ هیچ ماژولی
     * روشن نمی‌شد ✗ ⇒ الگوی `[+\s]+` هر دو را می‌گیرد ✓.
     */
    for (const id of mod.split(/[+\s]+/).map((s) => s.trim()).filter(Boolean)) {
      if (isKnownModule(id)) {
        state.modules[id] = { on: true, params: cloneParams(state.modules[id].params) };
      }
    }
  }
  /** پارامترهای URL روی پریست سوار می‌شوند ✓ (فقط آیتم‌های آمده ✓) */
  for (const [mod_, items] of Object.entries(decodeParams(q.get("p")))) {
    if (!isKnownModule(mod_)) continue;
    state.modules[mod_].params = { ...state.modules[mod_].params, ...items };
  }
  return state;
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function profilesSelfTest(): string[] {
  const errs: string[] = [];

  /** ۱) اصل قفل‌شده: همه روی **یک** موتور ✓ */
  if (new Set(PROFILES.map((x) => x.engine)).size !== 1) errs.push("پروفایل‌ها موتور یکسان ندارند ✗");
  if (profileIds().join(",") !== "classic,micro,flow,ai,hybrid,pro") errs.push("فهرست پروفایل‌ها نادرست ✗");

  /** ۲) اعمال: Classic دو ماژول ✓ · Pro همه ✓ */
  const onCount = MODULE_IDS.filter((m) => applyProfile("classic").modules[m].on).length;
  if (onCount !== 2) errs.push(`Classic باید ۲ ماژول روشن داشته باشد (${onCount}) ✗`);
  if (MODULE_IDS.filter((m) => applyProfile("pro").modules[m].on).length !== MODULE_IDS.length) {
    errs.push("Pro باید همه را روشن کند ✗");
  }

  /** ۳) پروفایل ناشناس ⇒ classic ✓ */
  if (applyProfile("nope").profile !== "classic") errs.push("پروفایل ناشناس باید classic شود ✗");

  /** ۴) URL: رفت‌وبرگشت کامل ✓ + انتخاب دستی ✓ */
  const back = decodeState(encodeState(applyProfile("pro")));
  if (back.profile !== "pro") errs.push("URL پروفایل را برنگرداند ✗");
  if (MODULE_IDS.some((m) => !back.modules[m].on)) errs.push("URL همهٔ روشن‌ها را برنگرداند ✗");
  const microOnly = decodeState("?profile=micro&mod=indicators");
  if (!microOnly.modules.indicators.on || microOnly.modules.moneyflow.on) errs.push("بازگشت انتخابی URL نادرست ✗");
  /**
   * 🆕 **قرارداد `mod` (بازبینی هفتم):** اگر `mod` در URL باشد، **فهرستِ کاملِ
   * روشن‌ها** است ✓ ⇒ ماژول‌های پروفایل که در فهرست نیستند **خاموش** می‌مانند ✗
   * (پیش‌تر از پریست زنده می‌شدند ✗).
   */
  const microOn = MODULE_IDS.filter((m) => microOnly.modules[m].on).join(",");
  if (microOn !== "indicators") errs.push(`«mod» باید فهرست کامل باشد (شد: «${microOn}») ✗`);

  /** ۵) تحمل‌پذیری: ماژول ناشناس نادیده ✓ و وارد وضعیت نمی‌شود ✗ */
  const junk = decodeState("?profile=classic&mod=indicators+nope!");
  if (!junk.modules.indicators.on) errs.push("ماژول معتبر در URL نادیده گرفته شد ✗");
  /**
   * **اعتبارسنجی درست:** وضعیت باید دقیقاً = پروفایل پیش‌فرض (classic: multichart +
   * indicators ✓) + ماژولی که در URL آمده (indicators ✓) باشد ⇒ هیچ «ناشناسی» اضافه
   * نشده باشد ✗. (assert قبلی `multichart` را که خودِ پروفایل روشن کرده بود، ناشناس
   * می‌شمرد ✗ — باگ تست، نه محصول ✓)
   */
  const onIds = MODULE_IDS.filter((m) => junk.modules[m].on).sort().join(",");
  /** 🆕 با قرارداد جدید، `multichart`ِ پروفایل هم خاموش می‌ماند ✓ (فهرستِ کامل ✓) */
  if (onIds !== "indicators") errs.push(`وضعیت پس از URL ناخواسته عوض شد: «${onIds}» ✗`);

  /** ۶) وضعیت خالی: همه خاموش ✓ */
  if (MODULE_IDS.some((m) => emptyState().modules[m].on)) errs.push("وضعیت خالی باید همه را خاموش کند ✗");

  /**
   * ۷) **پارامترها (P5/4-UI):** چند-نمونه + رفت‌وبرگشت URL + کپی عمیق ✓
   * (باگ واقعی نسخهٔ قبل: پارامترها در URL نمی‌رفتند ✗ ⇒ با هر تیک ماژول
   *  ویرایش‌های کاربر پاک می‌شد ✗.)
   */
  const multi = applyProfile("pro");
  multi.modules.indicators.params = {
    ...multi.modules.indicators.params,
    ema: [
      { on: true, values: { period: 21 } },
      { on: true, values: { period: 55 } },
      { on: false, values: { period: 200 } },
    ],
  };
  const backParams = decodeState(encodeState(multi));
  const emaBack = backParams.modules.indicators.params.ema as ParamInstance[];
  if (emaBack.length !== 3) errs.push("URL تعداد نمونه‌های پارامتری را برنگرداند ✗");
  if (emaBack[1]?.values.period !== 55) errs.push("URL مقدار پارامتر را برنگرداند ✗");
  if (emaBack[2]?.on !== false) errs.push("URL وضعیت ON/OFF نمونه را برنگرداند ✗");
  if (emaBack[0] === emaBack[1]) errs.push("نمونه‌های بازگشته شیء مشترک دارند ✗");

  /** ۸) کپی عمیق: ویرایش یک وضعیت نباید پریست/وضعیت دیگر را عوض کند ✗ */
  const first = applyProfile("pro");
  const second = applyProfile("pro");
  const firstEma = first.modules.indicators.params.ema as ParamInstance[];
  firstEma[0]!.values.period = 999;
  const secondEma = second.modules.indicators.params.ema as ParamInstance[];
  if (secondEma[0]!.values.period === 999) errs.push("پارامترها بین وضعیت‌ها مشترک‌اند ✗ (کپی عمیق نیست)");

  /** ۹) کدک: ورودی نامعتبر نادیده ✓ · سقف نمونه‌ها ✓ (ضد URL دستکاری‌شده ✓) */
  const junkParams = decodeParams("nope.x:1;indicators.ema:1~period=abc;signals.cross:");
  if ("nope" in junkParams) errs.push("ماژول ناشناس در کدک پارامتر نادیده گرفته نشد ✗");
  if (Object.keys((junkParams.indicators?.ema ?? [])[0]?.values ?? {}).length !== 0) {
    errs.push("مقدار غیرعددی باید نادیده گرفته شود ✗");
  }
  const flooded = decodeParams(`indicators.ema:${new Array(40).fill("1~period=9").join("|")}`);
  if ((flooded.indicators?.ema ?? []).length > MAX_INSTANCES_PER_ITEM) {
    errs.push("سقف نمونه‌ها در کدک اعمال نشد ✗");
  }

  /**
   * ۱۰) **حذفِ ماندگار (تومبستون):** آیتمی که همهٔ نمونه‌هایش حذف شده نباید با
   * تغییر URL (مثلاً تیک یک ماژول) از پریست **زنده** شود ✗ — این باگ واقعیِ
   * نسخهٔ قبل بود ✗.
   */
  const deleted = applyProfile("pro");
  deleted.modules.indicators.params = { ...deleted.modules.indicators.params, sma: [] };
  const afterDelete = decodeState(encodeState(deleted));
  const smaAfter = afterDelete.modules.indicators.params.sma;
  if (!Array.isArray(smaAfter) || smaAfter.length) {
    errs.push("آیتم حذف‌شده پس از رفت‌وبرگشت URL زنده شد ✗ (تومبستون کار نکرد)");
  }

  return errs;
}
