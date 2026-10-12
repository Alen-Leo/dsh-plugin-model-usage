# dsh-plugin-model-usage

在会话界面输入框下方的统计行(`conversation.composer.dock` 座位)显示**当前所选用模型**的用量 pill —— 展示**已用百分比**(与 z.ai 官网口径一致);pill 通过 `order:2` 排在官方 `stats` 条目与上下文用量表(ContextMeter)**之后**(行内最末),点击弹出详情(各窗口用量、套餐、续费时间、按模型用量)。

- pill 与官方统计行同行渲染,样式对齐 `StatsPills`(同字号、同 tertiary 色、同悬停底色、tabular-nums);
- 已用比例 ≥75% 显示警告色,≥90% 显示错误色;环形图标按最紧张窗口的已用比例填充;
- 详情弹窗复用官方 stat-dialog 的视觉(token 化配色、顶部锚定、Esc/外点关闭);
- 当前模型来自会话 `modelSelection` 投影(`next ?? lastUsed` 的 `provider`),切模型即时切换显示;新会话在首次选定模型后出现;
- 同一用量源只在 pill 可见(有会话挂载)时轮询,间隔 `refreshMinutes` 分钟;弹窗打开时自动刷新一次,也可手动点刷新;未配置 apiKey 时 pill 整体隐藏。

## 支持的用量源(kind)

| kind | 平台 | 默认 baseUrl | 接口(Bearer apiKey) | pill 内容 |
|---|---|---|---|---|
| `zai` | Z.ai(GLM Coding Plan) | `https://api.z.ai` | `GET /api/monitor/usage/quota/limit` + `GET /api/biz/subscription/list` | 最短/最长窗口已用百分比,如 `5h 22% · 周 43%` |
| `zhipu-cn` | 智谱国内(同一后端) | `https://open.bigmodel.cn` | 同上 | 同上 |
| `deepseek` | DeepSeek 开放平台 | `https://api.deepseek.com` | `GET /user/balance` | `余额 ¥xx.xx` |

字段语义对齐 ZCode / TokenAssistant / OpenUsage 三方实现的交叉验证:

- `CREDIT_LIMIT`(旧响应叫 `TOKENS_LIMIT`)按 `type` 或 `name` 识别,是**百分比**配额窗口:`percentage` 为**已用**占比(0–100,与官网一致;缺失时显示 `?`),窗口长度由 `(unit, number)` 给出 —— `3`=小时、`6`=周、`1`/`4`=天、`5`=30 天月;窗口按长度排序(绝不按重置时间排序);
- `TIME_LIMIT` 为**月度网络搜索次数**:`currentValue`=已用、`usage`=上限,只在详情弹窗中显示;
- `nextResetTime` 为 epoch 毫秒;`success:false` 且消息含 "coding plan" = key 有效但没有生效套餐;业务码 1000/1001(及 HTTP 401/403)= key 无效;
- 订阅取 `VALID && inCurrentPeriod` 的条目(否则取第一条),套餐名优先 `productName`,回退 `GLM Coding {level}`;仅 `autoRenew` 时显示下次续费时间。

以上 zhipu-cn(z.ai 国内 `open.bigmodel.cn`)两端点已于 2026-10-12 用真实 GLM Coding Lite key 实测:HTTP 200、CORS 对页面 Origin 回送 `access-control-allow-origin` 并放行 `authorization` 头,浏览器可直连;`zai` 全球端点字段结构相同(TokenAssistant/ZCode 交叉验证)。

## 配置

本包自带 `cordis.patch.yml` 只插入条目(id `model-usage`);API key 等配置写在 profile 自己的 `~/.dsh/profiles/<name>/cordis.patch.yml` 覆盖层(升级本插件不会动 key),或在 Web「设置」页自动生成的表单里填写:

```yaml
- id: model-usage
  config:
    refreshMinutes: 10          # 轮询间隔(分钟),>=1
    sources:                    # 用量源,key 自定
      glm-cn:
        kind: zhipu-cn          # zai | zhipu-cn | deepseek
        apiKey: <你的 API key>  # bigmodel.cn 控制台「API Keys」页的 key
        # baseUrl: https://open.bigmodel.cn   # 可选覆盖
    providers:                  # 可选:会话 provider id -> sources key
      zai-coding-cn: glm-cn     # 缺省时按名称推断(zai/zhipu/bigmodel/glm→zai 系,deepseek→deepseek)
```

> **provider → 源类型对照(重要)**:DSH 的 `zai-coding-cn` provider(pi-ai 内置)实际请求 `https://open.bigmodel.cn`,其 key 来自 bigmodel.cn,必须配 `kind: zhipu-cn`;只有 `zai` provider(请求 `https://api.z.ai`)才配 `kind: zai`。两者的 key 不通用,配错端点会显示「API key 无效或未授权」。

> key 仅存于本机 profile 配置(与 `~/.dsh/.credentials.yaml` 同级敏感);用量请求由浏览器直连对应平台。若给 `apiKey` 加 `.role("secret")` 会导致镜像脱敏、浏览器读不到,故本插件有意不加。

## 结构

- `lib/index.js` — Host 半部:声明 Config schema(`.volatile()` 使 settings 镜像把该条目文档下发给浏览器);
- `lib/client.js` — 浏览器半部(预构建 Lazy-CJS bundle;平台种子模块 react/react-dom/ui-primitives/client-store);
- `tests/parser.test.mjs` — 解析器/管理器单元测试(`node tests/parser.test.mjs`,52 项),含 2026-10-12 抓取的真实 bigmodel CN 响应 fixture;
- `tests/live-e2e.mjs` — 一次性在线验证:`node tests/live-e2e.mjs <apiKey>` 用真实 key 走完 fetch → manager → provider 路由 → pill 标签全链路;
- 注册座位:`conversation.composer.dock`(list, session 作用域),`id: model-usage`,`order: 1`。

## 安装/更新

```bash
# 在 DSH 会话中使用 plugin_manager 工具:
install_bundle  target=/Users/alen/Code/dsh/dsh-plugin-model-usage
```

或通过 Web 界面「插件」页安装本地路径。安装后把上节配置写入 profile 的 `cordis.patch.yml` 并填入 key。

**更新代码**:编辑本目录文件后,在「设置 → 插件」或 `plugin_manager` 中把 `model-usage` 条目关闭再打开(触发重扫描与新 revision),然后刷新页面;桌面端重启应用亦可。修改 profile `cordis.patch.yml` 中的配置需重启应用(或经「设置」表单在线改,经 settings 服务实时下发);未变更的源不会中断轮询。

## 致谢

- [ZCode](https://github.com/zai-org/ZCode)(zai 官方)与 opencode — 在编程工具状态区展示套餐余量的产品形态与订阅选取规则参考;
- [TokenAssistant](https://github.com/Alen-Leo/TokenAssistant)— percentage 优先、unit 枚举漂移、usageDetails 按模型去重等解析规则参考;
- [OpenUsage](https://github.com/robinebers/openusage)— z.ai 配额接口字段语义(窗口分类、TIME_LIMIT=网络搜索、无套餐错误形态)交叉验证。
