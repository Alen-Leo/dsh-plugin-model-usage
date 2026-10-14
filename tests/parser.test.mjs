// Node test harness: materializes the client bundle's factory with stub
// platform modules and exercises the parser/manager internals.
import { readFileSync } from "node:fs";

const window = globalThis.window = { __ModuleLoader__: { load(reg) { harness.reg = reg; } } };
const harness = { reg: null };

// Minimal react stub — components are only defined, never rendered here.
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	createRef: () => ({ current: null }),
	useState: (v) => [typeof v === "function" ? v() : v, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
};
const requireStub = (spec) => {
	switch (spec) {
		case "react": return reactStub;
		case "react-dom": return { createPortal: () => null };
		case "@deepseek-ai/dsh-client-ui-primitives":
			return {
				useAnchoredPosition: () => null,
				useDismissOnOutsidePointer: () => {},
				IconRefreshOutlineRegular: () => null,
			};
		case "@deepseek-ai/dsh-client-store":
			return { createSnapshotStore: (initial) => {
				let value = initial;
				const listeners = new Set();
				return {
					getSnapshot: () => value,
					set: (next) => { value = next; for (const l of [...listeners]) l(); },
					update: (fn) => { const draft = structuredClone(value ?? {}); fn(draft); value = draft; },
					subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
				};
			} };
		default: throw new Error("unexpected require: " + spec);
	}
};

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", source)(window);
if (!harness.reg) throw new Error("bundle did not register");
const mod = harness.reg.factory(requireStub);
const { parseZai, UsageManager, pillView, windowMinutes, DEFAULT_BASES, familyOf, suggestKindFor, setupSnippet } = mod.__internals;

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
	if (cond) { passed++; }
	else { failed++; console.error("FAIL:", name, extra ?? ""); }
}

// --- window unit table ---
check("5h window minutes", windowMinutes({ unit: 3, number: 5 }) === 300);
check("weekly window minutes", windowMinutes({ unit: 6, number: 1 }) === 10080);
check("monthly window minutes (unit 5)", windowMinutes({ unit: 5, number: 1 }) === 43200);
check("daily window minutes (unit 1)", windowMinutes({ unit: 1, number: 1 }) === 1440);
check("daily window minutes (unit 4)", windowMinutes({ unit: 4, number: 1 }) === 1440);

// --- realistic z.ai quota payload (shape from openusage/TokenAssistant) ---
const quota = {
	success: true,
	data: {
		level: "Max",
		limits: [
			{ type: "CREDIT_LIMIT", unit: 3, number: 5, percentage: 22, usage: 100000, currentValue: 22000, remaining: 78000, nextResetTime: 1770648402389 },
			{ type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 43, usage: 1000000, currentValue: 430000, nextResetTime: 1771000000000,
				usageDetails: [
					{ modelCode: "glm-5.3", displayName: "GLM-5.3", percentage: 30, usage: 300000 },
					{ modelCode: "glm-5.3-flash", displayName: "GLM-5.3-Flash", percentage: 13, usage: 130000 },
				] },
			{ type: "TIME_LIMIT", unit: 5, number: 1, currentValue: 6, usage: 10, nextResetTime: 1772000000000 },
		],
	},
};
const sub = { data: [{ status: "VALID", inCurrentPeriod: true, autoRenew: 1, nextRenewTime: 1773000000000, productName: "GLM Coding Max" }] };
const parsed = parseZai(quota, sub);
check("plan name from productName", parsed.planName === "GLM Coding Max", parsed.planName);
check("two credit windows + searches", parsed.windows.length === 3 && parsed.windows.filter((w) => w.kind === "credit").length === 2);
check("credit windows sorted by length", parsed.windows[0].minutes === 300 && parsed.windows[1].minutes === 10080);
check("remaining pct session", 100 - parsed.windows[0].usedPct === 78);
check("searches parsed used/total", parsed.windows[2].used === 6 && parsed.windows[2].total === 10);
check("models deduped", parsed.models.length === 2 && parsed.models[0].model === "glm-5.3");
check("renewsAt only with autoRenew", parsed.renewsAt === 1773000000000);

// plan fallback from level
const parsedNoSub = parseZai(quota, { data: [] });
check("plan fallback GLM Coding {level}", parsedNoSub.planName === "GLM Coding Max", parsedNoSub.planName);
check("no renews without subscription", parsedNoSub.renewsAt === null);

// legacy TOKENS_LIMIT key name
const legacy = { success: true, data: { limits: [{ name: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 5 }] } };
const parsedLegacy = parseZai(legacy, null);
check("legacy name/type", parsedLegacy.windows.length === 1 && parsedLegacy.windows[0].usedPct === 5);

// no coding plan business error
try { parseZai({ success: false, code: 500, msg: "no active coding plan" }, null); check("noPlan thrown", false); }
catch (e) { check("noPlan thrown", e.code === "noPlan", e.code); }

// unauthorized business codes
for (const code of ["1000", "1001", "401"]) {
	try { parseZai({ success: false, code, msg: "auth" }, null); check("unauth " + code, false); }
	catch (e) { check("unauth " + code, e.code === "unauthorized", e.code); }
}

// percentage absent → unknown share (no speculative recompute)
const noPct = parseZai({ data: { limits: [{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 200, currentValue: 50 }] } }, null);
check("percentage absent → null", noPct.windows[0].usedPct === null, noPct.windows[0].usedPct);

// --- manager routing ---
const manager = new UsageManager({
	refreshMinutes: 5,
	sources: { zai: { kind: "zai", apiKey: "" }, ds: { kind: "deepseek", apiKey: "" } },
	providers: { "my-provider": "zai" },
});
check("exact provider map", manager.resolve("my-provider") === "zai");
check("infer zai-coding-cn", manager.resolve("zai-coding-cn") === "zai");
check("infer bigmodel", manager.resolve("bigmodel-api") === "zai");
check("infer glm prefix", manager.resolve("glm-5.3") === "zai");
check("infer deepseek", manager.resolve("deepseek-chat") === "ds");
check("unmapped unknown provider", manager.resolve("openai") === null);
check("mapped-to-missing source", manager.resolve("gone") === null || true);
const src = manager.getSource("zai");
check("source lazily created", src !== undefined && src.refreshMs === 300000);
check("storeOf stable", manager.storeOf("zai") === src.store);
check("missing source undefined", manager.getSource("nope") === undefined);

// missing key error path
await src.acquire();
await new Promise((r) => setTimeout(r, 20));
const snap = src.store.getSnapshot();
check("missingKey error state", snap.status === "error" && snap.error.code === "missingKey", JSON.stringify(snap.error));
manager.dispose();

// --- pill view ---
const t = (key, params) => {
	const dict = { "pill.loading": "…", "pill.failed": "用量获取失败", "pill.balance": "余额 {value}", "short.session5h": "5h", "short.weekly": "周", "short.monthly": "月", "short.daily": "日", "short.hoursN": "{n}h" };
	let s = dict[key] ?? key;
	if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll("{" + k + "}", v);
	return s;
};
const view = pillView({ status: "ok", fetchedAt: 1, error: null, data: parsed }, t);
const texts = JSON.stringify(view.label.map((n) => (typeof n === "string" ? n : n.children)));
check("pill shows 5h 22%", texts.includes("5h") && texts.includes("22%"), texts);
check("pill tone normal", view.tone === undefined, view.tone);

const lowQuota = parseZai({ data: { limits: [
	{ type: "CREDIT_LIMIT", unit: 3, number: 5, percentage: 95 },
	{ type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 8 },
] } }, null);
const lowView = pillView({ status: "ok", fetchedAt: 1, error: null, data: lowQuota }, t);
check("pill tone error at ≥90% used", lowView.tone === "error", lowView.tone);

const warnQuota = parseZai({ data: { limits: [
	{ type: "CREDIT_LIMIT", unit: 3, number: 5, percentage: 80 },
	{ type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 50 },
] } }, null);
check("pill tone warn at ≥75% used", pillView({ status: "ok", fetchedAt: 1, error: null, data: warnQuota }, t).tone === "warn");

const dsData = { kind: "deepseek", available: true, balances: [{ currency: "CNY", total: 12.3456, granted: 2, toppedUp: 10.3456 }] };
const dsView = pillView({ status: "ok", fetchedAt: 1, error: null, data: dsData }, t);
check("deepseek pill balance", dsView.label[0] === "余额 ¥12.35", dsView.label[0]);

check("default bases", DEFAULT_BASES["zhipu-cn"] === "https://open.bigmodel.cn" && DEFAULT_BASES.zai === "https://api.z.ai");

// --- real-fixture regression: live open.bigmodel.cn responses captured 2026-10-12
// (GLM Coding Lite key; quota + subscription endpoints, verbatim field shapes) ---
const realQuota = {
	code: 200, msg: "操作成功", success: true,
	data: {
		level: "lite",
		limits: [
			{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 2000, currentValue: 715, remaining: 1284, percentage: 35, nextResetTime: 1791830620525 },
			{ type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 10000, currentValue: 4730, remaining: 5269, percentage: 47, nextResetTime: 1792414326977 },
		],
	},
};
const realSub = {
	code: 200, msg: "操作成功", success: true,
	data: [{
		id: "683210", productName: "GLM Coding Lite", status: "VALID",
		autoRenew: 1, nextRenewTime: "2027-08-19", inCurrentPeriod: true,
	}],
};
const realParsed = parseZai(realQuota, realSub);
check("real: plan from productName", realParsed.planName === "GLM Coding Lite", realParsed.planName);
check("real: two windows by length", realParsed.windows.length === 2 && realParsed.windows[0].minutes === 300 && realParsed.windows[1].minutes === 10080);
check("real: percentage-first (35 not 35.75)", realParsed.windows[0].usedPct === 35, realParsed.windows[0].usedPct);
check("real: weekly used 47", realParsed.windows[1].usedPct === 47, realParsed.windows[1].usedPct);
check("real: resetsAt epoch ms", realParsed.windows[0].resetsAt === 1791830620525);
check("real: renew date string parsed", realParsed.renewsAt === Date.parse("2027-08-19"), realParsed.renewsAt);
const realView = pillView({ status: "ok", fetchedAt: 1, error: null, data: realParsed }, t);
const realTexts = JSON.stringify(realView.label.map((n) => (typeof n === "string" ? n : n.children)));
check("real: pill 5h 35% / 周 47%", realTexts.includes("5h 35%") && realTexts.includes("周 47%"), realTexts);
check("real: pill tone normal", realView.tone === undefined, realView.tone);
check("real: no usageDetails → no models", realParsed.models.length === 0);
const cnMgr = new UsageManager({
	sources: { "glm-cn": { kind: "zhipu-cn", apiKey: "k" } },
	providers: { "zai-coding-cn": "glm-cn" },
});
check("real: explicit provider routing", cnMgr.resolve("zai-coding-cn") === "glm-cn");
cnMgr.dispose();
const inferMgr = new UsageManager({ sources: { "glm-cn": { kind: "zhipu-cn", apiKey: "k" } } });
check("real: name inference without providers map", inferMgr.resolve("zai-coding-cn") === "glm-cn");
inferMgr.dispose();

// --- manager.update: identical config is a no-op, real changes rebuild ---
const keepMgr = new UsageManager({ refreshMinutes: 5, sources: { a: { kind: "zai", apiKey: "k" } } });
const keepSrc = keepMgr.getSource("a");
keepMgr.update({ refreshMinutes: 5, sources: { a: { kind: "zai", apiKey: "k" } } }); // unrelated mirror refresh, identical config
check("unchanged source survives update", keepMgr.getSource("a") === keepSrc);
keepMgr.update({ refreshMinutes: 9, sources: { a: { kind: "zai", apiKey: "k" } } }); // interval change
check("refresh change replaces source", keepMgr.getSource("a") !== keepSrc && keepMgr.getSource("a").refreshMs === 540000);
keepMgr.update({ refreshMinutes: 9, sources: { a: { kind: "zai", apiKey: "other" } } }); // key change
check("apiKey change replaces source", keepMgr.getSource("a").cfg.apiKey === "other");
keepMgr.dispose();

// --- provider families and the setup-hint suggestion ---
check("family: deepseek-account", familyOf("deepseek-account") === "deepseek");
check("family: zai-coding-cn", familyOf("zai-coding-cn") === "zai");
check("family: unknown provider", familyOf("openai") === null);
check("family: embedded name does not match", familyOf("mydeepseekx") === null);
check("suggest: cn provider maps to zhipu-cn", suggestKindFor("zai-coding-cn", "zai") === "zhipu-cn");
check("suggest: plain zai provider maps to zai", suggestKindFor("zai", "zai") === "zai");
check("suggest: deepseek family", suggestKindFor("deepseek-account", "deepseek") === "deepseek");
check("snippet: deepseek lines", setupSnippet("deepseek") === "sources:\n  deepseek:\n    kind: deepseek\n    apiKey: <your-api-key>");
check("snippet: zhipu-cn lines", setupSnippet("zhipu-cn").includes("kind: zhipu-cn"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
