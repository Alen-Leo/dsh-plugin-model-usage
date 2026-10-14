// dsh-plugin-model-usage — browser half (prebuilt lazy-CJS bundle).
//
// Renders the selected model's remaining-usage pill in the
// `conversation.composer.dock` list (id "model-usage"). The dock row is a
// centered flex container whose entries lay out unwrapped, so `order: 2` on
// the root places the pill after the official stats pills AND the context
// meter (both default order 0). Click opens a detail dialog.
//
// Data flow:
//   Host Config (namespace "model-usage", lib/index.js schema)
//     → settings mirror → ctx.configForms.get("model-usage")
//     → UsageManager (per-source polling stores, browser-direct fetch)
//     → pill via the keyedHooks seat (`useUsage(sourceKey)`)
//   Current model: the session-scope standard `useProjection("modelSelection")`.
//   Known-family providers (deepseek / zai) with no usable source or key
//   render a setup-hint pill with a copyable config snippet instead of hiding.
//
// Platform field semantics (z.ai / bigmodel GLM Coding Plan), verified live
// against open.bigmodel.cn and cross-checked with ZCode / TokenAssistant /
// OpenUsage:
//   - `CREDIT_LIMIT` (legacy key name `TOKENS_LIMIT`) entries are percentage
//     quota windows: `percentage` = USED share 0–100; window length =
//     (unit, number) with unit 3 = hours, 6 = weeks, 1/4 = days, 5 = 30-day
//     months. Windows are ordered by length, never by reset time.
//   - `TIME_LIMIT` is the monthly web-search count: used = `currentValue`,
//     limit = `usage`, reset = `nextResetTime` (epoch ms).
//   - Subscription: pick the entry that is VALID and in its current period
//     (else the first); plan name prefers `productName`, falls back to
//     "GLM Coding {level}"; the renew time shows only when `autoRenew` is set.
//   - `nextResetTime` is epoch ms; subscription `nextRenewTime` is a date
//     string. `{"success":false, "msg":"…coding plan…"}` = valid key, no
//     Coding Plan; business codes 1000/1001 (and HTTP 401/403) = bad key.
window.__ModuleLoader__.load({
	id: "dsh-plugin-model-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const reactDom = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const store = require("@deepseek-ai/dsh-client-store");
		const h = react.createElement;
		const { useState, useEffect, useRef } = react;
		const { createSnapshotStore } = store;
		const { useAnchoredPosition, useDismissOnOutsidePointer, IconRefreshOutlineRegular } = primitives;

		//#region styles
		// Pill skin cloned from the official StatsPills.module.css; `order: 2`
		// moves the pill past the context meter inside the shared .dock row.
		const CSS = [
			".dmu-root{order:2;box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
			".dmu-anchor{min-width:0;display:inline-flex}",
			".dmu-pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}",
			".dmu-pill svg{flex:none;width:14px;height:14px}",
			"button.dmu-pill{cursor:pointer}",
			"button.dmu-pill:hover,button.dmu-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}",
			"button.dmu-pill:not([data-tone]):hover,button.dmu-pill:not([data-tone])[aria-expanded=true]{color:var(--dsw-alias-label-secondary)}",
			".dmu-pill[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}",
			".dmu-pill[data-tone=error]{color:var(--dsw-alias-state-error-primary)}",
			".dmu-label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
			".dmu-sep{color:var(--dsw-alias-separator-primary);margin:0 2px}",
			".dmu-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}",
			".dmu-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
			".dmu-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
			".dmu-titleLabel svg{flex:none;width:14px;height:14px}",
			".dmu-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}",
			".dmu-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(92px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
			".dmu-details dt,.dmu-details dd{min-width:0;margin:0}",
			".dmu-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
			".dmu-reset{margin-top:2px}",
			".dmu-sub{margin-top:2px}",
			".dmu-models{margin-top:10px}",
			".dmu-modelsTitle{color:var(--dsw-alias-label-tertiary);margin-bottom:4px}",
			".dmu-modelsList{list-style:none;margin:0;padding:0}",
			".dmu-modelsList li{display:flex;justify-content:space-between;gap:16px;overflow-wrap:anywhere}",
			".dmu-modelsList li span+span{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}",
			".dmu-error{color:var(--dsw-alias-state-error-primary);margin-top:8px;overflow-wrap:anywhere}",
			".dmu-refresh{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:var(--dsw-radius-sm);width:22px;height:22px;place-items:center;display:inline-grid;flex:none}",
			".dmu-refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dmu-refresh svg{width:14px;height:14px}",
			".dmu-refresh[disabled]{opacity:.5;cursor:default}",
			".dmu-spin{animation:dmu-rot 1s linear infinite}",
			"@keyframes dmu-rot{to{transform:rotate(360deg)}}",
			".dmu-setupNote{margin-top:8px}",
			".dmu-code{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-interactive-bg-hover);border-radius:var(--dsw-radius-sm);padding:8px;font-family:var(--dsh-content-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}",
			".dmu-copyRow{display:flex;justify-content:flex-end;margin-top:8px}",
			".dmu-copy{cursor:pointer;background:0 0;border:none;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:2px 8px}",
			".dmu-copy:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}"
		].join("\n");
		const CSS_TAG = "dsh-plugin-model-usage/styles.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-model-usage";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region locale
		const NS = "model-usage";
		const LOCALE = {
			zh: {
				"pill.loading": "…",
				"pill.failed": "用量获取失败",
				"pill.balance": "余额 {value}",
				"short.session5h": "5h",
				"short.hoursN": "{n}h",
				"short.daily": "日",
				"short.weekly": "周",
				"short.monthly": "月",
				"window.5h": "5h 窗口",
				"window.hoursN": "{n}h 窗口",
				"window.daily": "每日",
				"window.weekly": "本周",
				"window.monthly": "月度",
				"window.searches": "网络搜索",
				"dialog.title": "剩余用量",
				"dialog.plan": "套餐",
				"dialog.planUnknown": "未知",
				"dialog.balance": "余额",
				"dialog.renews": "下次续费",
				"dialog.updated": "更新于",
				"dialog.resets": "({time} 重置)",
				"dialog.available": "可用",
				"dialog.granted": "赠送",
				"dialog.toppedUp": "充值",
				"dialog.models": "按模型用量",
				"dialog.refresh": "刷新",
				"dialog.yes": "是",
				"dialog.no": "否",
				"aria.pill": "模型剩余用量",
			"setup.pill": "配置{kind}用量",
			"setup.title": "用量源未配置",
			"setup.kindName.deepseek": "DeepSeek",
			"setup.kindName.zai": "GLM",
			"setup.explain": "当前模型的 provider 是 {provider},还没有可显示其用量的配置源。",
			"setup.note.deepseek": "key 在 platform.deepseek.com「API Keys」页创建;这里查的是开放平台余额,与账号登录的套餐额度不是一套账。",
			"setup.file": "把片段并入 profile 的 ~/.dsh/profiles/<name>/cordis.patch.yml(已有 model-usage 条目时,只把 sources: 下的几行按同样缩进并进去;改完重启应用):",
			"setup.copy": "复制",
			"setup.copied": "已复制",
			"aria.setupPill": "配置模型用量源",
				"error.unauthorized": "API key 无效或未授权",
				"error.missingKey": "未配置 apiKey",
				"error.noPlan": "API key 有效,但没有生效的 GLM Coding 套餐",
				"error.empty": "接口没有返回可用的用量数据",
				"error.unknownKind": "未知的用量源类型",
				"error.timeout": "请求超时",
				"error.network": "网络请求失败"
			},
			en: {
				"pill.loading": "…",
				"pill.failed": "usage failed",
				"pill.balance": "Bal {value}",
				"short.session5h": "5h",
				"short.hoursN": "{n}h",
				"short.daily": "d",
				"short.weekly": "wk",
				"short.monthly": "mo",
				"window.5h": "5h window",
				"window.hoursN": "{n}h window",
				"window.daily": "Daily",
				"window.weekly": "Weekly",
				"window.monthly": "Monthly",
				"window.searches": "Web searches",
				"dialog.title": "Remaining usage",
				"dialog.plan": "Plan",
				"dialog.planUnknown": "Unknown",
				"dialog.balance": "Balance",
				"dialog.renews": "Renews",
				"dialog.updated": "Updated",
				"dialog.resets": "(Resets {time})",
				"dialog.available": "Available",
				"dialog.granted": "Granted",
				"dialog.toppedUp": "Topped up",
				"dialog.models": "Per-model usage",
				"dialog.refresh": "Refresh",
				"dialog.yes": "Yes",
				"dialog.no": "No",
				"aria.pill": "Model remaining usage",
			"setup.pill": "Set up {kind} usage",
			"setup.title": "Usage source not configured",
			"setup.kindName.deepseek": "DeepSeek",
			"setup.kindName.zai": "GLM",
			"setup.explain": "The current model's provider is {provider}, but no usage source is configured to show it.",
			"setup.note.deepseek": "Create the key on the platform.deepseek.com \"API Keys\" page; this reads the open-platform balance, separate from the signed-in account's plan quota.",
			"setup.file": "Merge the snippet into the profile's ~/.dsh/profiles/<name>/cordis.patch.yml (when a model-usage entry exists, merge only the lines under sources: at the same indentation; restart the app afterwards):",
			"setup.copy": "Copy",
			"setup.copied": "Copied",
			"aria.setupPill": "Configure model usage source",
				"error.unauthorized": "API key invalid or unauthorized",
				"error.missingKey": "apiKey not configured",
				"error.noPlan": "API key valid, but no active GLM Coding plan",
				"error.empty": "The API returned no usable usage data",
				"error.unknownKind": "Unknown usage source kind",
				"error.timeout": "Request timed out",
				"error.network": "Network request failed"
			}
		};
		//#endregion

		//#region formatting helpers
		function trimZero(text) {
			return text.endsWith(".0") ? text.slice(0, -2) : text;
		}
		function compactNum(value) {
			if (value === null || value === undefined || !Number.isFinite(value)) return "—";
			const abs = Math.abs(value);
			if (abs >= 1e6) return trimZero((value / 1e6).toFixed(1)) + "M";
			if (abs >= 1e3) return trimZero((value / 1e3).toFixed(1)) + "K";
			return Number.isInteger(value) ? String(value) : trimZero(value.toFixed(1));
		}
		function amount(value, currency) {
			const symbol = { CNY: "¥", USD: "$", EUR: "€" }[currency] ?? (currency ? currency + " " : "");
			const n = Number(value);
			if (!Number.isFinite(n)) return symbol + "—";
			return symbol + n.toFixed(2);
		}
		let clockFmt;
		function fmtClock(ms) {
			clockFmt ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
			return clockFmt.format(new Date(ms));
		}
		function pad2(n) {
			return String(n).padStart(2, "0");
		}
		// "MM/DD HH:mm" for reset times.
		function fmtReset(ms) {
			const d = new Date(ms);
			return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
		}
		// "YYYY-MM-DD" for the renew time. Upstream sends a date-only string
		// (parsed as UTC midnight), so UTC getters recover the exact date in
		// every local zone; local getters would shift it a day west of UTC.
		function fmtDate(ms) {
			const d = new Date(ms);
			return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
		}
		function pctText(p) {
			if (p === null || p === undefined || !Number.isFinite(p)) return "?";
			return String(Math.max(0, Math.min(100, Math.round(p))));
		}
		function num(value) {
			const n = Number(value);
			return Number.isFinite(n) ? n : null;
		}
		//#endregion

		//#region http
		async function getJson(url, headers, timeoutMs = 15000) {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), timeoutMs);
			let res;
			let text = "";
			try {
				res = await fetch(url, { headers, signal: ctrl.signal, cache: "no-store" });
				text = await res.text();
			} catch (e) {
				const code = e && e.name === "AbortError" ? "timeout" : "network";
				throw httpError(code, String((e && e.message) || e));
			} finally {
				clearTimeout(timer);
			}
			let body = null;
			try {
				body = JSON.parse(text);
			} catch {}
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) throw httpError("unauthorized", "HTTP " + res.status);
				const msg = pickMessage(body);
				throw httpError("http", "HTTP " + res.status + (msg ? ": " + msg : ""));
			}
			if (body === null || typeof body !== "object") throw httpError("http", "invalid JSON response");
			return body;
		}
		function httpError(code, message) {
			const err = new Error(message);
			err.code = code;
			return err;
		}
		function pickMessage(body) {
			if (!body || typeof body !== "object") return null;
			const v = body.msg ?? body.message;
			return typeof v === "string" && v !== "" ? v : null;
		}
		//#endregion

		//#region z.ai / bigmodel parser
		// Window unit enum, union of the observed official encodings:
		// ZCode/TokenAssistant saw {5:minute, 1:day}; OpenUsage saw {4:day, 5:month}.
		// 3 (hour) and 6 (week) are identical in every reference.
		const UNIT_MINUTES = { 1: 1440, 3: 60, 4: 1440, 5: 43200, 6: 10080 };
		function windowMinutes(limit) {
			const unit = num(limit.unit);
			const number = num(limit.number) ?? 1;
			if (unit === null || number <= 0) return null;
			const per = UNIT_MINUTES[unit];
			return per === undefined ? null : per * number;
		}
		function usedPercent(limit) {
			const p = num(limit.percentage);
			return p === null ? null : Math.max(0, Math.min(100, p));
		}
		function resetMs(limit) {
			const raw = num(limit.nextResetTime);
			return raw !== null && raw > 0 ? raw : null;
		}
		function parseZai(quota, sub) {
			if (quota && quota.success === false) {
				const code = String(quota.code ?? "");
				const msg = pickMessage(quota) || "request failed";
				if (/coding plan/i.test(msg)) throw httpError("noPlan", msg);
				if (code === "1000" || code === "1001" || code === "401" || code === "403") throw httpError("unauthorized", msg);
				throw httpError("http", msg);
			}
			const data = quota && typeof quota.data === "object" && quota.data !== null ? quota.data : null;
			const limits = data !== null && Array.isArray(data.limits) ? data.limits : null;
			if (limits === null) throw httpError("empty", "no limits in response");
			const active = pickCurrentSubscription(sub);
			const windows = [];
			const models = [];
			const seenModel = new Set();
			for (const limit of limits) {
				if (!limit || typeof limit !== "object") continue;
				const type = String(limit.type ?? limit.name ?? "").toUpperCase();
				if (type === "CREDIT_LIMIT" || type === "TOKENS_LIMIT") {
					windows.push({
						kind: "credit",
						minutes: windowMinutes(limit),
						usedPct: usedPercent(limit),
						total: num(limit.usage),
						used: num(limit.currentValue),
						resetsAt: resetMs(limit)
					});
				} else if (type === "TIME_LIMIT") {
					// Monthly web-search count: used = currentValue, limit = usage.
					const used = num(limit.currentValue);
					const total = num(limit.usage);
					windows.push({
						kind: "searches",
						minutes: null,
						usedPct: used !== null && total !== null && total > 0 ? (used / total) * 100 : null,
						used,
						total,
						resetsAt: resetMs(limit)
					});
				}
				for (const detail of Array.isArray(limit.usageDetails) ? limit.usageDetails : []) {
					if (!detail || typeof detail !== "object") continue;
					const model = detail.modelCode;
					if (typeof model !== "string" || model === "" || seenModel.has(model)) continue;
					seenModel.add(model);
					models.push({
						model,
						displayName: typeof detail.displayName === "string" && detail.displayName.trim() !== "" ? detail.displayName : null,
						usedPct: num(detail.percentage),
						usage: num(detail.usage)
					});
				}
			}
			const credits = windows.filter((w) => w.kind === "credit").sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
			if (credits.length === 0 && windows.length === 0) throw httpError("empty", "no usable limits");
			const searches = windows.filter((w) => w.kind === "searches");
			return {
				kind: "zai",
				planName: planNameOf(active, data),
				renewsAt: active && (active.autoRenew === 1 || active.autoRenew === true) ? normalizeTime(active.nextRenewTime) : null,
				windows: [...credits, ...searches],
				models
			};
		}
		// ZCode's pickCurrentSubscriptionFromList: prefer the VALID subscription in its
		// current period, else the first entry.
		function pickCurrentSubscription(sub) {
			const list = sub && Array.isArray(sub.data) ? sub.data.filter((x) => x && typeof x === "object") : [];
			if (list.length === 0) return null;
			return list.find((x) => (x.status === undefined || String(x.status).toUpperCase() === "VALID") && x.inCurrentPeriod !== false) ?? list[0];
		}
		function planNameOf(sub, data) {
			if (sub && typeof sub.productName === "string" && sub.productName !== "") return sub.productName;
			if (data && typeof data.level === "string" && data.level !== "") {
				return "GLM Coding " + data.level.charAt(0).toUpperCase() + data.level.slice(1).toLowerCase();
			}
			return null;
		}
		function normalizeTime(value) {
			const n = num(value);
			if (n !== null && n > 0) return n;
			if (typeof value === "string" && value !== "") {
				const ms = Date.parse(value);
				if (Number.isFinite(ms)) return ms;
			}
			return null;
		}
		//#endregion

		//#region fetchers + kind registry
		const DEFAULT_BASES = {
			zai: "https://api.z.ai",
			"zhipu-cn": "https://open.bigmodel.cn",
			deepseek: "https://api.deepseek.com"
		};
		async function fetchZai(cfg) {
			const base = cfg.baseUrl || DEFAULT_BASES[cfg.kind];
			const headers = { authorization: "Bearer " + cfg.apiKey };
			const quota = await getJson(base + "/api/monitor/usage/quota/limit", headers);
			let sub = null;
			try {
				sub = await getJson(base + "/api/biz/subscription/list", headers, 10000);
			} catch { /* plan name is best-effort */ }
			return parseZai(quota, sub);
		}
		async function fetchDeepseek(cfg) {
			const body = await getJson((cfg.baseUrl || DEFAULT_BASES.deepseek) + "/user/balance", { authorization: "Bearer " + cfg.apiKey });
			const balances = (Array.isArray(body.balance_infos) ? body.balance_infos : [])
				.filter((x) => x && typeof x === "object")
				.map((x) => ({
					currency: typeof x.currency === "string" ? x.currency : "",
					total: num(x.total_balance),
					granted: num(x.granted_balance),
					toppedUp: num(x.topped_up_balance)
				}));
			if (balances.length === 0) throw httpError("empty", "empty balance data");
			return { kind: "deepseek", available: body.is_available !== false, balances };
		}
		const FETCHERS = {
			zai: fetchZai,
			"zhipu-cn": fetchZai,
			deepseek: fetchDeepseek
		};
		//#endregion

		//#region provider families
	/** Provider id → platform family, shared by source inference and the setup hint. */
	function familyOf(providerId) {
		if (typeof providerId !== "string" || providerId === "") return null;
		const p = providerId.toLowerCase();
		if (/(^|[^a-z])(zai|zhipu|bigmodel|glm)([^a-z]|$)/.test(p)) return "zai";
		if (/(^|[^a-z])deepseek([^a-z]|$)/.test(p)) return "deepseek";
		return null;
	}
	/** Kind the setup hint suggests for a known-family provider with no covering source. */
	function suggestKindFor(providerId, family) {
		if (family === "deepseek") return "deepseek";
		return /cn|zhipu|bigmodel/.test(providerId.toLowerCase()) ? "zhipu-cn" : "zai";
	}
	/** Setup-hint kind for the seat's optional familyOf prop; null for unknown families. */
	function setupKindForProvider(providerId, familyOfFn) {
		if (typeof familyOfFn !== "function") return null;
		const family = familyOfFn(providerId);
		return family === null ? null : suggestKindFor(providerId, family);
	}
	/** Copyable sources snippet the setup dialog hands to the user. */
	function setupSnippet(kind) {
		const name = kind === "deepseek" ? "deepseek" : "glm";
		return "sources:\n  " + name + ":\n    kind: " + kind + "\n    apiKey: <your-api-key>";
	}
	//#endregion

	//#region usage source manager
		/** One configured source: a snapshot store plus a shared poller. */
		class UsageSource {
			constructor(key, cfg, refreshMs) {
				this.key = key;
				this.cfg = cfg;
				this.refreshMs = refreshMs;
				this.store = createSnapshotStore(undefined);
				this.refs = 0;
				this.timer = null;
				this.inflight = null;
				this.disposed = false;
			}
			/** Start (or join) polling; the returned disposer releases this hold. */
			acquire() {
				this.refs += 1;
				if (this.timer === null) {
					void this.fetch();
					this.timer = setInterval(() => {
						void this.fetch();
					}, this.refreshMs);
				}
				return () => {
					this.refs -= 1;
					if (this.refs <= 0 && this.timer !== null) {
						clearInterval(this.timer);
						this.timer = null;
					}
				};
			}
			/** Fetch unless one is already running; concurrent callers join it. */
			fetch() {
				if (this.disposed) return Promise.resolve();
				if (this.inflight !== null) return this.inflight;
				const prev = this.store.getSnapshot();
				if (prev === undefined) this.store.set({ status: "loading", fetchedAt: null, error: null, data: null });
				const run = (async () => {
					const fetcher = FETCHERS[this.cfg.kind ?? "zai"];
					if (typeof this.cfg.apiKey !== "string" || this.cfg.apiKey === "") throw httpError("missingKey", "missing key");
					if (fetcher === undefined) throw httpError("unknownKind", String(this.cfg.kind));
					return fetcher(this.cfg);
				})();
				const tracked = run.catch(() => {});
				this.inflight = tracked;
				run.then(
					(data) => {
						if (this.disposed || this.inflight !== tracked) return;
						this.inflight = null;
						this.store.set({ status: "ok", fetchedAt: Date.now(), error: null, data });
					},
					(e) => {
						if (this.disposed || this.inflight !== tracked) return;
						this.inflight = null;
						this.store.set({
							status: "error",
							fetchedAt: Date.now(),
							error: { message: e && e.message ? String(e.message) : String(e), code: e && e.code ? String(e.code) : null },
							data: prev && prev.status === "ok" ? prev.data : null
						});
					}
				);
				return tracked;
			}
			dispose() {
				this.disposed = true;
				if (this.timer !== null) {
					clearInterval(this.timer);
					this.timer = null;
				}
			}
		}
		/** Config mirror: resolves the current session provider onto a live source. */
		class UsageManager {
			constructor(config) {
				this.sources = new Map();
				this.snapshot = "";
				this.update(config ?? {});
			}
			/**
			 * Replace the whole configuration. The settings mirror re-derives on
			 * ANY namespace's revision, so unrelated settings changes arrive here
			 * too: an unchanged config is a no-op, a real change rebuilds every
			 * source on demand.
			 */
			update(config) {
				const next = JSON.stringify(config ?? {});
				if (next === this.snapshot) return;
				this.snapshot = next;
				for (const src of this.sources.values()) src.dispose();
				this.sources.clear();
				const c = config ?? {};
				this.sourcesCfg = c.sources && typeof c.sources === "object" ? c.sources : {};
				this.providerMap = c.providers && typeof c.providers === "object" ? c.providers : {};
				this.refreshMs = Math.max(1, Number(c.refreshMinutes) || 10) * 60000;
			}
			getSource(key) {
				if (key === null || key === undefined) return undefined;
				if (!Object.prototype.hasOwnProperty.call(this.sourcesCfg, key)) return undefined;
				let src = this.sources.get(key);
				if (src === undefined) {
					src = new UsageSource(key, this.sourcesCfg[key] ?? {}, this.refreshMs);
					this.sources.set(key, src);
				}
				return src;
			}
			storeOf(key) {
				const src = this.getSource(key);
				return src === undefined ? undefined : src.store;
			}
			resolve(providerId) {
				if (typeof providerId !== "string" || providerId === "") return null;
				if (Object.prototype.hasOwnProperty.call(this.providerMap, providerId)) {
					const mapped = this.providerMap[providerId];
					return typeof mapped === "string" && mapped !== "" && this.getSource(mapped) !== undefined ? mapped : null;
				}
				return this.infer(providerId);
			}
			infer(providerId) {
				const family = familyOf(providerId);
				if (family === null) return null;
				const byKind = (kinds) => {
					for (const key of Object.keys(this.sourcesCfg)) {
						const kind = String((this.sourcesCfg[key] && this.sourcesCfg[key].kind) ?? "zai");
						if (kinds.includes(kind)) return key;
					}
					return null;
				};
				return byKind(family === "zai" ? ["zai", "zhipu-cn"] : ["deepseek"]);
			}
			familyOf(providerId) {
				return familyOf(providerId);
			}
			dispose() {
				for (const src of this.sources.values()) src.dispose();
				this.sources.clear();
			}
		}
		//#endregion

		//#region presentation helpers
		function windowShortLabel(w, t) {
			if (w.kind === "searches") return t("window.searches");
			const m = w.minutes;
			if (m === 300) return t("short.session5h");
			if (m !== null && m > 0 && m <= 360) return t("short.hoursN", { n: String(Math.round(m / 60)) });
			if (m !== null && m <= 1440) return t("short.daily");
			if (m !== null && m <= 10080) return t("short.weekly");
			return t("short.monthly");
		}
		function windowFullLabel(w, t) {
			if (w.kind === "searches") return t("window.searches");
			const m = w.minutes;
			if (m === 300) return t("window.5h");
			if (m !== null && m > 0 && m <= 360) return t("window.hoursN", { n: String(Math.round(m / 60)) });
			if (m !== null && m <= 1440) return t("window.daily");
			if (m !== null && m <= 10080) return t("window.weekly");
			return t("window.monthly");
		}
		function toneByUsed(used) {
			if (used === null) return undefined;
			if (used >= 90) return "error";
			if (used >= 75) return "warn";
			return undefined;
		}
		function DonutIcon({ fraction }) {
			const C = 34.558;
			const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
			return h("svg", { viewBox: "0 0 16 16", "aria-hidden": true },
				h("circle", { cx: 8, cy: 8, r: 5.5, fill: "none", stroke: "currentColor", "stroke-width": 2, opacity: 0.28 }),
				f > 0.004 ? h("circle", {
					cx: 8, cy: 8, r: 5.5, fill: "none", stroke: "currentColor", "stroke-width": 2,
					"stroke-dasharray": (f * C).toFixed(2) + " " + C.toFixed(2),
					"stroke-linecap": "round", transform: "rotate(-90 8 8)"
				}) : null
			);
		}
		function localizeError(error, t) {
			if (!error) return "";
			switch (error.code) {
				case "unauthorized": return t("error.unauthorized");
				case "missingKey": return t("error.missingKey");
				case "noPlan": return t("error.noPlan");
				case "empty": return t("error.empty");
				case "unknownKind": return t("error.unknownKind");
				case "timeout": return t("error.timeout");
				case "network": return t("error.network");
				default: return error.message || String(error);
			}
		}
		//#endregion

		//#region dialog
		const PANEL_MARGIN = 12;
		const PANEL_GAP = 8;
		const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };
		function windowDetail(w) {
			const parts = [];
			if (w.used !== null || w.total !== null) parts.push(compactNum(w.used) + " / " + compactNum(w.total));
			if (w.usedPct !== null) parts.push(pctText(w.usedPct) + "%");
			return parts.join(" · ");
		}
		function ZaiDialogRows({ data, t }) {
			const rows = [];
			rows.push(h("dt", { key: "plan" }, t("dialog.plan")));
			rows.push(h("dd", { key: "plan-v" }, data.planName ?? t("dialog.planUnknown")));
			for (const [i, w] of data.windows.entries()) {
				rows.push(h("dt", { key: "w" + i }, windowFullLabel(w, t)));
				rows.push(h("dd", { key: "w" + i + "-v" },
					windowDetail(w),
					w.resetsAt !== null ? h("div", { className: "dmu-reset" }, t("dialog.resets", { time: fmtReset(w.resetsAt) })) : null
				));
			}
			if (data.renewsAt !== null) {
				rows.push(h("dt", { key: "renew" }, t("dialog.renews")));
				rows.push(h("dd", { key: "renew-v" }, fmtDate(data.renewsAt)));
			}
			return rows;
		}
		function DeepseekDialogRows({ data, t }) {
			const rows = [];
			for (const [i, b] of data.balances.entries()) {
				rows.push(h("dt", { key: "b" + i }, t("dialog.balance") + (b.currency ? " " + b.currency : "")));
				// Total on the summary line; the granted/topped-up split moves to
				// its own parenthesized second line, matching the reset line's
				// layout on the z.ai window rows.
				const extras = [];
				if (b.granted !== null) extras.push(t("dialog.granted") + " " + amount(b.granted, b.currency));
				if (b.toppedUp !== null) extras.push(t("dialog.toppedUp") + " " + amount(b.toppedUp, b.currency));
				rows.push(h("dd", { key: "b" + i + "-v" },
					amount(b.total, b.currency),
					extras.length > 0 ? h("div", { className: "dmu-sub" }, "(" + extras.join(" · ") + ")") : null
				));
			}
			rows.push(h("dt", { key: "avail" }, t("dialog.available")));
			rows.push(h("dd", { key: "avail-v" }, data.available ? t("dialog.yes") : t("dialog.no")));
			return rows;
		}
		function dialogFraction(data) {
			if (!data || data.kind !== "zai") return 0.6;
			let worst = null;
			for (const w of data.windows) {
				if (w.kind !== "credit") continue;
				if (w.usedPct !== null && (worst === null || w.usedPct > worst)) worst = w.usedPct;
			}
			return worst === null ? 0.6 : worst / 100;
		}
		function UsageDialog({ state, source, setOpen, rootRef, panelRef, pos, t }) {
			const [busy, setBusy] = useState(false);
			const onRefresh = () => {
				if (!source || busy) return;
				setBusy(true);
				Promise.resolve(source.fetch()).finally(() => setBusy(false));
			};
			useEffect(() => {
				const onKey = (e) => {
					if (e.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [setOpen]);
			const data = state && state.status !== "loading" ? state.data : null;
			const rows = [];
			if (data && data.kind === "zai") rows.push(...ZaiDialogRows({ data, t }));
			else if (data && data.kind === "deepseek") rows.push(...DeepseekDialogRows({ data, t }));
			const models = data && data.kind === "zai" && data.models.length > 0 ? data.models : null;
			return h("div", {
				ref: panelRef, className: "dmu-panel", role: "dialog", "aria-label": t("dialog.title"),
				style: pos ?? MEASURE_STYLE
			},
				h("div", { className: "dmu-title" },
					h("span", { className: "dmu-titleLabel" }, h(DonutIcon, { fraction: dialogFraction(data) }), data && data.planName ? data.planName : t("dialog.title")),
					h("span", { style: { display: "inline-flex", gap: 6, alignItems: "center" } },
						state && state.fetchedAt ? h("span", { style: { fontWeight: 400 } }, t("dialog.updated") + " " + fmtClock(state.fetchedAt)) : null,
						h("button", {
							type: "button", className: "dmu-refresh", onClick: onRefresh, disabled: busy,
							"aria-label": t("dialog.refresh"), title: t("dialog.refresh")
						}, h(IconRefreshOutlineRegular, { className: busy ? "dmu-spin" : undefined }))
					)
				),
				h("div", { className: "dmu-titleRule", "aria-hidden": true }),
				rows.length > 0 ? h("dl", { className: "dmu-details", "data-model-usage-details": true }, rows) : null,
				models ? h("div", { className: "dmu-models" },
					h("div", { className: "dmu-modelsTitle" }, t("dialog.models")),
					h("ul", { className: "dmu-modelsList" }, models.map((m, i) => h("li", { key: i },
						h("span", null, m.displayName ?? m.model),
						h("span", null, (m.usedPct !== null ? pctText(m.usedPct) + "% · " : "") + compactNum(m.usage))
					)))
				) : null,
				state && state.status === "error" ? h("div", { className: "dmu-error" }, localizeError(state.error, t)) : null
			);
		}
		//#endregion

		//#region setup hint
	function SetupPill({ providerId, kind, t }) {
		const [open, setOpen] = useState(false);
		const [copied, setCopied] = useState(false);
		const rootRef = useRef(null);
		const panelRef = useRef(null);
		const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: "top", gap: PANEL_GAP, margin: PANEL_MARGIN });
		useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
		useEffect(() => {
			const onKey = (e) => {
				if (e.key === "Escape") setOpen(false);
			};
			document.addEventListener("keydown", onKey);
			return () => document.removeEventListener("keydown", onKey);
		}, []);
		const snippet = setupSnippet(kind);
		const onCopy = () => {
			const clipboard = typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null;
			if (clipboard === null) return;
			clipboard.writeText(snippet).then(() => setCopied(true), () => {});
		};
		const kindName = kind === "deepseek" ? t("setup.kindName.deepseek") : t("setup.kindName.zai");
		return h("span", { className: "dmu-root", "data-model-usage-setup": true },
			h("span", { ref: rootRef, className: "dmu-anchor" },
				h("button", {
					type: "button", className: "dmu-pill", "aria-haspopup": "dialog", "aria-expanded": open,
					"aria-label": t("aria.setupPill"), onClick: () => setOpen(!open)
				},
					h(DonutIcon, { fraction: 0 }),
					h("span", { className: "dmu-label" }, t("setup.pill", { kind: kindName }))
				)
			),
			open ? reactDom.createPortal(h("div", {
				ref: panelRef, className: "dmu-panel", role: "dialog", "aria-label": t("setup.title"),
				style: pos ?? MEASURE_STYLE
			},
				h("div", { className: "dmu-title" }, h("span", { className: "dmu-titleLabel" }, t("setup.title"))),
				h("div", { className: "dmu-titleRule", "aria-hidden": true }),
				h("div", null, t("setup.explain", { provider: providerId })),
				kind === "deepseek" ? h("div", { className: "dmu-setupNote" }, t("setup.note.deepseek")) : null,
				h("div", { className: "dmu-setupNote" }, t("setup.file")),
				h("div", { className: "dmu-copyRow" },
					h("button", { type: "button", className: "dmu-copy", onClick: onCopy }, copied ? t("setup.copied") : t("setup.copy"))
				),
				h("pre", { className: "dmu-code" }, snippet)
			), document.body) : null
		);
	}
	//#endregion

	//#region pill
		function pillView(state, t) {
			if (state === undefined || state.status === "loading") {
				return { label: [t("pill.loading")], tone: undefined, fraction: 0.6 };
			}
			if (state.status === "error" && state.data === null) {
				return { label: [t("pill.failed")], tone: "error", fraction: 0 };
			}
			const data = state.data;
			const stale = state.status === "error";
			if (data && data.kind === "zai") return zaiPillView(data, t, stale);
			if (data && data.kind === "deepseek") {
				const b = data.balances[0];
				return { label: [t("pill.balance", { value: amount(b.total, b.currency) })], tone: data.available === false ? "warn" : undefined, fraction: 0.6 };
			}
			return { label: [t("pill.failed")], tone: "error", fraction: 0 };
		}
		function zaiPillView(data, t, stale) {
			const credits = data.windows.filter((w) => w.kind === "credit");
			// Shortest window (session) and longest window (weekly/monthly) — the two
			// the official console surfaces. Percentages are the USED share, as on
			// the official console; the donut fills with the worst window's usage.
			const shown = credits.length >= 2 ? [credits[0], credits[credits.length - 1]]
				: credits.length === 1 ? [credits[0]]
					: [];
			const label = [];
			let worst = null;
			shown.forEach((w, i) => {
				if (i > 0) label.push(h("span", { key: "s" + i, className: "dmu-sep", "aria-hidden": true }, "·"));
				label.push(h("span", { key: "w" + i }, windowShortLabel(w, t) + " " + (w.usedPct === null ? "?" : pctText(w.usedPct)) + "%"));
				if (w.usedPct !== null && (worst === null || w.usedPct > worst)) worst = w.usedPct;
			});
			if (shown.length === 0) label.push(t("pill.failed"));
			const fraction = worst === null ? 0.6 : worst / 100;
			const tone = shown.length === 0 ? "error" : stale && worst === null ? "error" : toneByUsed(worst);
			return { label, tone, fraction };
		}
		function ModelUsagePill(props) {
			const { useProjection, useUsage, useConfigVersion, resolveSource, getSource, familyOf, t } = props;
			// Any config change bumps this version so provider→source routing re-resolves.
			useConfigVersion((v) => v);
			const selection = useProjection("modelSelection");
			const chosen = selection ? selection.next ?? selection.lastUsed : null;
			const provider = chosen && typeof chosen === "object" ? chosen.provider : null;
			const sourceKey = provider === null ? null : resolveSource(provider);
			const source = sourceKey === null ? undefined : getSource(sourceKey);
			const state = useUsage(sourceKey ?? "");
			useEffect(() => (source ? source.acquire() : undefined), [source]);
			const [open, setOpen] = useState(false);
			const rootRef = useRef(null);
			const panelRef = useRef(null);
			const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: "top", gap: PANEL_GAP, margin: PANEL_MARGIN });
			useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
			useEffect(() => {
				if (open && source) void source.fetch();
			}, [open, source]);
			// No key configured yet: the source cannot answer — surface the setup hint.
			const unconfigured = state !== undefined && state.status === "error" && state.error !== null && state.error.code === "missingKey";
			const setupKind = unconfigured ? String((source && source.cfg && source.cfg.kind) ?? "zai")
				: sourceKey === null ? setupKindForProvider(provider, familyOf) : null;
			if (provider === null || (sourceKey === null && setupKind === null)) return null;
			if (setupKind !== null) return h(SetupPill, { providerId: provider, kind: setupKind, t });
			const view = pillView(state, t);
			return h("span", { className: "dmu-root", "data-model-usage": true },
				h("span", { ref: rootRef, className: "dmu-anchor" },
					h("button", {
						type: "button", className: "dmu-pill", "aria-haspopup": "dialog", "aria-expanded": open,
						"aria-label": t("aria.pill"), "data-tone": view.tone ?? undefined, onClick: () => setOpen(!open)
					},
						h(DonutIcon, { fraction: view.fraction }),
						h("span", { className: "dmu-label" }, ...view.label)
					)
				),
				open && state !== undefined ? reactDom.createPortal(
					h(UsageDialog, { state, source, setOpen, rootRef, panelRef, pos, t }),
					document.body
				) : null
			);
		}
		//#endregion


	//#region plugin entry
		const SETTINGS_NAMESPACE = "model-usage";
		const inject = ["slots", "locale", "configForms"];
		function apply(ctx) {
			// The browser half receives no loader config; the Host-side Config
			// document (lib/index.js) arrives through the settings mirror.
			const form = ctx.configForms.get(SETTINGS_NAMESPACE);
			const configVersion = createSnapshotStore(0);
			const readConfig = () => {
				const snap = form.getSnapshot();
				return snap && snap.status === "ready" && snap.value && typeof snap.value === "object" ? snap.value : {};
			};
			const manager = new UsageManager(readConfig());
			const stopForm = form.subscribe(() => {
				manager.update(readConfig());
				configVersion.set(configVersion.getSnapshot() + 1);
			});
			ctx.effect(() => () => {
				stopForm();
				manager.dispose();
			}, "model-usage: settings mirror");
			ctx.effect(() => ctx.locale.register(NS, LOCALE), "model-usage: dictionaries");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "model-usage",
				order: 1,
				locale: NS,
				inject: () => ({
					hooks: { configVersion },
					keyedHooks: { usage: (key) => manager.storeOf(key) },
					resolveSource: (providerId) => manager.resolve(providerId),
					getSource: (key) => manager.getSource(key),
					familyOf: (providerId) => manager.familyOf(providerId)
				})
			}, ModelUsagePill));
		}
		exports.name = "model-usage";
		exports.inject = inject;
		exports.apply = apply;
		// Debug/testing surface; not read by the loader.
		exports.__internals = { parseZai, UsageManager, pillView, windowMinutes, DEFAULT_BASES, familyOf, suggestKindFor, setupSnippet };
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
