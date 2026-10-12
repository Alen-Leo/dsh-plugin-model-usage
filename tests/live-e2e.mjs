// One-off live end-to-end check: the real bundle, real network, full manager path.
import { readFileSync } from "node:fs";

const KEY = process.argv[2];
if (!KEY) { console.error("usage: node tests/live-e2e.mjs <apiKey>"); process.exit(2); }

const window = globalThis.window = { __ModuleLoader__: { load(reg) { harness.reg = reg; } } };
const harness = { reg: null };
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
			return { useAnchoredPosition: () => null, useDismissOnOutsidePointer: () => {}, IconRefreshOutlineRegular: () => null };
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

new Function("window", readFileSync(new URL("../lib/client.js", import.meta.url), "utf8"))(window);
const mod = harness.reg.factory(requireStub);
const { UsageManager, pillView } = mod.__internals;

const t = (key, params) => {
	const dict = {
		"pill.loading": "…", "pill.failed": "用量获取失败", "pill.balance": "余额 {value}",
		"short.session5h": "5h", "short.weekly": "周", "short.monthly": "月", "short.daily": "日", "short.hoursN": "{n}h",
		"dialog.resets": "重置于 {time}", "window.5h": "5h 窗口", "window.weekly": "本周", "window.daily": "每日", "window.monthly": "月度", "window.searches": "网络搜索",
		"dialog.plan": "套餐", "dialog.renews": "下次续费",
	};
	let s = dict[key] ?? key;
	if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll("{" + k + "}", v);
	return s;
};

const manager = new UsageManager({
	refreshMinutes: 10,
	sources: { "glm-cn": { kind: "zhipu-cn", apiKey: KEY } },
	providers: { "zai-coding-cn": "glm-cn" },
});

const sourceKey = manager.resolve("zai-coding-cn");
console.log("resolve(zai-coding-cn) →", sourceKey);
if (sourceKey === null) throw new Error("provider routing failed");

const src = manager.getSource(sourceKey);
await src.acquire();
await new Promise((r) => setTimeout(r, 2500));

const snap = src.store.getSnapshot();
console.log("snapshot status:", snap.status);
if (snap.status !== "ok") {
	console.error("error:", JSON.stringify(snap.error));
	process.exit(1);
}
const view = pillView(snap, t);
const texts = view.label.map((n) => (typeof n === "string" ? n : n.children)).join("");
console.log("pill label:", texts);
console.log("pill tone:", view.tone ?? "normal", "| fraction:", view.fraction.toFixed(2));
const d = snap.data;
console.log("plan:", d.planName, "| renews:", d.renewsAt ? new Date(d.renewsAt).toISOString().slice(0, 10) : "—");
for (const w of d.windows) console.log(`  window minutes=${w.minutes} used=${w.usedPct}% resets=${w.resetsAt ? new Date(w.resetsAt).toISOString() : "—"}`);
manager.dispose();
console.log("E2E OK");
