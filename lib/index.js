// Host half of the model-usage plugin. Declares the Config schema so the
// DSH settings system serves this entry's configuration document (namespace
// = the entry id "model-usage") to the browser half through ctx.configForms.
// Field-level `.volatile()` is what makes the settings describe pass include
// this entry (volatileForm() skips schemas without live-editable fields).
import z from "@deepseek-ai/schemastery";

const SOURCE_KINDS = ["zai", "zhipu-cn", "deepseek"];

export const Config = z.object({
	/** Poll interval in minutes while the pill is visible. */
	refreshMinutes: z.natural().min(1).default(10).volatile(),
	/** Usage sources keyed by an arbitrary name of your choosing. */
	sources: z.dict(z.object({
		/** Which platform the source fetches from. */
		kind: z.union(SOURCE_KINDS.map((kind) => z.const(kind))).default("zai"),
		/** Platform API key; the browser half reads it to query the platform directly.
		 * Intentionally NOT .role("secret"): that would redact it in the settings
		 * mirror and the browser could not read it. */
		apiKey: z.string().default(""),
		/** Optional API origin override (defaults per kind). */
		baseUrl: z.string().default(""),
	})).default({}).volatile(),
	/** Optional session provider id → source key routing; unmatched providers are inferred by name. */
	providers: z.dict(z.string()).default({}).volatile(),
});

export function apply() {}
