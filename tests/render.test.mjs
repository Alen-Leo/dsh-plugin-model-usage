// Dialog render-contract test: drives the real seat component
// (ModelUsagePill) with stub hooks and asserts the detail-dialog contract —
// reset date-time on its own line ("(MM/DD HH:mm 重置)"), summary line
// untouched, renew date with year (no clock time). Self-contained stubs,
// same pattern as tests/parser.test.mjs / tests/live-e2e.mjs.
import { readFileSync } from "node:fs";

const window = globalThis.window = { __ModuleLoader__: { load(reg) { harness.reg = reg; } } };
const harness = { reg: null };
globalThis.document = {
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: "" }),
	head: { appendChild: () => {} },
	body: {},
	addEventListener: () => {},
	removeEventListener: () => {},
};

// Minimal react stub; `useState` is fed from a queue so the pill renders with
// its dialog open (first call = `open`, second = `busy`).
const useStateQueue = [true, false];
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	createRef: () => ({ current: null }),
	useRef: (v) => ({ current: v }),
	useCallback: (fn) => fn,
	useState: (v) => [useStateQueue.length > 0 ? useStateQueue.shift() : (typeof v === "function" ? v() : v), () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
};
const requireStub = (spec) => {
	switch (spec) {
		case "react": return reactStub;
		case "react-dom": return { createPortal: (el) => el };
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
if (!harness.reg) throw new Error("bundle did not register");
const mod = harness.reg.factory(requireStub);

// apply() against a fake ctx captures the seat component and locale dicts.
const dicts = {};
let Pill = null;
mod.apply({
	configForms: { get: () => ({
		getSnapshot: () => ({ status: "ready", value: { refreshMinutes: 10, sources: { "glm-cn": { kind: "zhipu-cn", apiKey: "k" } } } }),
		subscribe: () => () => {},
	}) },
	effect: (fn) => { fn(); },
	locale: { register: (_ns, d) => { Object.assign(dicts, d); return () => {}; } },
	slots: { inject: (_seat, fn) => { fn(); }, register: (_cfg, c) => { Pill = c; return c; } },
});
const t = (key, params) => {
	let s = dicts.zh[key] ?? key;
	if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll("{" + k + "}", v);
	return s;
};

// Real captured fixture (same epochs as tests/parser.test.mjs).
const data = mod.__internals.parseZai({
	code: 200, msg: "操作成功", success: true,
	data: { level: "lite", limits: [
		{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 2000, currentValue: 715, percentage: 35, nextResetTime: 1791830620525 },
		{ type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 10000, currentValue: 4730, percentage: 47, nextResetTime: 1792414326977 },
	] },
}, { code: 200, success: true, data: [{ id: "683210", productName: "GLM Coding Lite", status: "VALID", autoRenew: 1, nextRenewTime: "2027-08-19", inCurrentPeriod: true }] });

const tree = Pill({
	useProjection: () => ({ next: { provider: "zai-coding-cn" } }),
	useUsage: () => ({ status: "ok", fetchedAt: 1791800000000, error: null, data }),
	useConfigVersion: (fn) => fn(1),
	resolveSource: () => "glm-cn",
	getSource: () => ({ acquire: () => () => {}, fetch: () => Promise.resolve() }),
	t,
});

// The stub does not invoke function components, so render the portal's
// UsageDialog element with its own props, then locate the detail rows.
function find(node, pred, out = []) {
	if (!node || typeof node !== "object") return out;
	if (Array.isArray(node)) { for (const c of node) find(c, pred, out); return out; }
	if (pred(node)) out.push(node);
	find(node.children, pred, out);
	return out;
}
const text = (node) => {
	if (node === null || node === undefined || node === false) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(text).join("");
	return text(node.children);
};
const [dialogEl] = find(tree, (n) => typeof n.type === "function" && n.props && n.props.state && n.props.setOpen);
const [dl] = find(dialogEl.type(dialogEl.props), (n) => n.type === "dl" && n.props.className === "dmu-details");
const rows = Array.isArray(dl.children[0]) ? dl.children[0] : dl.children;

// Rows alternate dt/dd; window rows carry a second-line div.dmu-reset.
const table = [];
for (let i = 0; i < rows.length; i += 2) {
	const dd = rows[i + 1];
	const [resetDiv] = find(dd, (n) => n.type === "div" && n.props.className === "dmu-reset");
	table.push({ label: text(rows[i]), main: text(dd.children[0]), reset: text(resetDiv ?? "") });
}

// Expected values derived independently via Intl in the system zone
// (hourCycle h23 avoids the "24:00" midnight quirk).
const partsOf = (ms, extra) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
	year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
	hourCycle: "h23", ...extra,
}).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
	if (cond) { passed++; }
	else { failed++; console.error("FAIL:", name, extra ?? ""); }
}

const windowRows = table.filter((r) => r.reset !== "");
const plainRows = table.filter((r) => r.reset === "");
check("two window rows carry a reset line", windowRows.length === 2, JSON.stringify(table));
check("reset line is '(MM/DD HH:mm 重置)'",
	windowRows.every((r) => /^\(\d{2}\/\d{2} \d{2}:\d{2} 重置\)$/.test(r.reset)),
	JSON.stringify(windowRows.map((r) => r.reset)));
check("reset date-time matches Intl for each epoch",
	windowRows.every((r, i) => {
		const p = partsOf(data.windows[i].resetsAt);
		return r.reset === "(" + p.month + "/" + p.day + " " + p.hour + ":" + p.minute + " 重置)";
	}), JSON.stringify(windowRows.map((r) => r.reset)));
check("summary line keeps usage/percentage, no reset text",
	windowRows.every((r) => /\S+ \/ \S+ · \d+%/.test(r.main) && !r.main.includes("重置")),
	JSON.stringify(windowRows.map((r) => r.main)));
check("plan row intact, no reset line",
	plainRows.some((r) => r.label === t("dialog.plan") && r.main === "GLM Coding Lite"), JSON.stringify(plainRows));
const renew = plainRows.find((r) => r.label === t("dialog.renews"));
// renewsAt is a date-only string parsed at UTC midnight → expect its UTC date.
const rp = partsOf(data.renewsAt, { timeZone: "UTC" });
check("renew shows date only, with year, no clock time",
	renew !== undefined && renew.main === rp.year + "-" + rp.month + "-" + rp.day
		&& renew.main.startsWith("2027-08-19") && !renew.main.includes(":"),
	renew && renew.main);
check("english template keeps parenthesized prefix order", dicts.en["dialog.resets"].startsWith("(Resets "), dicts.en["dialog.resets"]);

// --- deepseek balance row: granted/topped-up move to a parenthesized second line ---
const dsData = { kind: "deepseek", available: true, balances: [{ currency: "CNY", total: 42.14, granted: 0, toppedUp: 42.14 }] };
useStateQueue.push(true, false);
const dsTree = Pill({
	useProjection: () => ({ next: { provider: "deepseek-account" } }),
	useUsage: () => ({ status: "ok", fetchedAt: 1791800000000, error: null, data: dsData }),
	useConfigVersion: (fn) => fn(1),
	resolveSource: () => "glm-cn",
	getSource: () => ({ acquire: () => () => {}, fetch: () => Promise.resolve() }),
	t,
});
const [dsDialogEl] = find(dsTree, (n) => typeof n.type === "function" && n.props && n.props.state && n.props.setOpen);
const [dsDl] = find(dsDialogEl.type(dsDialogEl.props), (n) => n.type === "dl" && n.props.className === "dmu-details");
const dsRows = Array.isArray(dsDl.children[0]) ? dsDl.children[0] : dsDl.children;
const dsTable = [];
for (let i = 0; i < dsRows.length; i += 2) {
	const dd = dsRows[i + 1];
	const [subDiv] = find(dd, (n) => n.type === "div" && n.props.className === "dmu-sub");
	dsTable.push({ label: text(dsRows[i]), main: text(dd.children[0]), sub: text(subDiv ?? "") });
}
check("deepseek summary line carries only the total",
	dsTable.some((r) => r.label === "余额 CNY" && r.main === "¥42.14"), JSON.stringify(dsTable));
check("deepseek granted/topped-up move to a parenthesized second line",
	dsTable.some((r) => r.sub === "(赠送 ¥0.00 · 充值 ¥42.14)"), JSON.stringify(dsTable));

// --- setup hint: known family without a covering source (account-login deepseek) ---
// ModelUsagePill consumes one useState (its own `open`) before SetupPill's
// `open`/`copied` read the queue: feed [own=false, setup open=true, copied=false].
useStateQueue.push(false, true, false);
const setupTree = Pill({
	useProjection: () => ({ next: { provider: "deepseek-account" } }),
	useUsage: () => undefined,
	useConfigVersion: (fn) => fn(1),
	resolveSource: () => null,
	getSource: () => undefined,
	familyOf: (id) => (/(^|[^a-z])deepseek([^a-z]|$)/.test(id.toLowerCase()) ? "deepseek" : "zai"),
	t,
});
// The stub does not invoke function components: render SetupPill with its props.
const setupRoot = setupTree.type(setupTree.props);
const [setupBtn] = find(setupRoot, (n) => n.type === "button" && n.props.className === "dmu-pill");
check("setup pill button names the platform", text(setupBtn).includes("DeepSeek"), JSON.stringify(text(setupBtn)));
const [setupPanel] = find(setupRoot, (n) => n.type === "div" && n.props.role === "dialog");
check("setup dialog portaled while open", setupPanel !== undefined);
const setupText = text(setupPanel);
check("setup dialog names the provider", setupText.includes("deepseek-account"), setupText);
check("setup dialog suggests kind: deepseek", setupText.includes("kind: deepseek"));
check("setup dialog names the profile patch file", setupText.includes("cordis.patch.yml"));
check("setup dialog carries the snippet apiKey line", setupText.includes("apiKey: <your-api-key>"));
check("setup dialog offers a copy control", find(setupPanel, (n) => n.type === "button" && n.props.className === "dmu-copy").length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
