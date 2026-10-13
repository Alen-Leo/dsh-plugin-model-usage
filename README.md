English | [简体中文](README.zh-CN.md)

# dsh-plugin-model-usage

DSH plugin that shows a usage pill for the **currently selected model** in the stats row under the conversation input — GLM Coding Plan shows the used percentage per quota window (same as the z.ai console), DeepSeek shows the open-platform balance. Click the pill for details: per-window usage with reset times, plan & renewal, per-model usage.

## Install

**Option 1 — let the AI do it.** Copy this into a DSH session (replace the path with your plugin directory):

```text
Install the local plugin at <absolute-path>/dsh-plugin-model-usage and configure model-usage in my profile per the README "Configuration" section: add one source with kind: zhipu-cn (use deepseek for DeepSeek). I'll send you the apiKey in my next message. Tell me whether a restart is needed.
```

**Option 2 — manual.** Use the plugin_manager tool in a DSH session:

```bash
install_bundle  target=<absolute-path>/dsh-plugin-model-usage
```

or install from a local path via the Web "Plugins" page.

## Configuration

### Supported usage sources (kind)

| kind | Platform | baseUrl | API (Bearer apiKey) | Pill |
|---|---|---|---|---|
| `zai` | Z.ai (GLM Coding Plan) | `https://api.z.ai` | `GET /api/monitor/usage/quota/limit` + `GET /api/biz/subscription/list` | `5h 22% · wk 43%` |
| `zhipu-cn` | Zhipu CN (same backend) | `https://open.bigmodel.cn` | same | same |
| `deepseek` | DeepSeek open platform | `https://api.deepseek.com` | `GET /user/balance` | `Bal ¥xx.xx` |

All three endpoints allow direct browser access (CORS enabled); requests go from the browser to the platform, no proxying. Field-semantics notes live in the header comment of `lib/client.js` and in the real-response fixtures under `tests/`.

### Where to write

Config lives in the profile's `~/.dsh/profiles/<name>/cordis.patch.yml` (`<name>` e.g. desktop, web; plugin upgrades never touch it), or in the Web "Settings → model-usage" form (applies immediately; file edits need an app restart):

```yaml
- id: model-usage
  config:
    refreshMinutes: 10          # poll interval in minutes, >=1
    sources:                    # usage sources; names are yours
      glm-cn:
        kind: zhipu-cn          # zai | zhipu-cn | deepseek
        apiKey: <your API key>
        # baseUrl: https://open.bigmodel.cn   # optional override
    providers:                  # optional: provider id -> source; inferred by name when omitted
      zai-coding-cn: glm-cn     # (ids containing zai/zhipu/glm -> zai-family sources; deepseek -> deepseek)
```

- **Provider mapping (important)**: DSH's `zai-coding-cn` provider actually requests `open.bigmodel.cn`, and its key comes from bigmodel.cn — it must be paired with `kind: zhipu-cn`. Only the `zai` provider (api.z.ai) uses `kind: zai`. The keys are not interchangeable; a mismatch shows "API key invalid or unauthorized".
- The `deepseek` key is created on the [platform.deepseek.com](https://platform.deepseek.com) "API Keys" page (starts with `sk-`); the balance endpoint reads the **open-platform balance**, separate from the in-app `deepseek-account` plan quota.
- The key stays in the local profile — treat it like `~/.dsh/.credentials.yaml`.

### Adding or editing sources manually

The settings form edits sources live; to edit the file instead, append under the `sources:` key of the `model-usage` entry with matching indentation:

```yaml
      deepseek:
        kind: deepseek
        apiKey: <your key>
```

If the file has no `model-usage` entry yet, write the whole block from the example above (if the file contains only `[]`, remove the brackets); to swap a key, edit that line in place. Restart the app afterwards.

## Troubleshooting

- **Pill never appears**: no source matching the current provider's kind, or an empty apiKey — hidden by design; check "Settings → model-usage".
- **"usage failed"**: open the dialog for the concrete reason at its bottom; "API key invalid or unauthorized" usually means a mistyped key or a kind/provider endpoint mismatch (see the mapping above).

## Development

```bash
node tests/parser.test.mjs                                # parser/manager unit tests
node tests/render.test.mjs                                # dialog render-contract tests
node tests/live-e2e.mjs <apiKey> [zai|zhipu-cn|deepseek]  # online end-to-end; kind defaults to zhipu-cn
```

- `lib/index.js` — host half: Config schema; `.volatile()` ships the config to the browser via the settings mirror;
- `lib/client.js` — browser half (prebuilt bundle): fetching, parsing, pill and dialog;
- Registered seat: `conversation.composer.dock` (session scope), `id: model-usage`.

After updating the code, toggle the `model-usage` entry off and on (or restart the app), then refresh the page.
