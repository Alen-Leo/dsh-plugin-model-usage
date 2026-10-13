[English](README.md) | 简体中文

# dsh-plugin-model-usage

DSH 插件:在会话输入框下方的统计行显示**当前所选用模型**的用量 pill —— GLM Coding Plan 显示各窗口已用百分比(与 z.ai 官网口径一致),DeepSeek 显示开放平台余额。点击 pill 弹出详情:各窗口用量与重置时间、套餐与续费、按模型用量。

## 安装

**方式一:让 AI 代装**。把下面这段话复制到 DSH 会话,路径换成你的插件目录:

```text
帮我安装本地插件 <绝对路径>/dsh-plugin-model-usage,并按它的 README「配置」一节把 model-usage 配置写进 profile:加一个 kind: zhipu-cn 的源(要接 DeepSeek 就改成 deepseek),apiKey 我下一条消息发你。装完告诉我要不要重启。
```

**方式二:手动**。在 DSH 会话里用 plugin_manager 工具:

```bash
install_bundle  target=<绝对路径>/dsh-plugin-model-usage
```

或通过 Web「插件」页安装本地路径。

## 配置

### 支持的用量源(kind)

| kind | 平台 | baseUrl | 接口(Bearer apiKey) | pill 内容 |
|---|---|---|---|---|
| `zai` | Z.ai(GLM Coding Plan) | `https://api.z.ai` | `GET /api/monitor/usage/quota/limit` + `GET /api/biz/subscription/list` | `5h 22% · 周 43%` |
| `zhipu-cn` | 智谱国内(同一后端) | `https://open.bigmodel.cn` | 同上 | 同上 |
| `deepseek` | DeepSeek 开放平台 | `https://api.deepseek.com` | `GET /user/balance` | `余额 ¥xx.xx` |

三个端点均支持浏览器直连(平台 CORS 放行),请求由浏览器发起、不经中转。字段语义的实现注记见 `lib/client.js` 头部注释与 `tests/` 里的真实响应 fixture。

### 写入位置

配置写在 profile 的 `~/.dsh/profiles/<name>/cordis.patch.yml`(`<name>` 如 desktop、web;升级插件不会动它),或在 Web「设置 → model-usage」表单里填(实时生效,改文件则需重启应用):

```yaml
- id: model-usage
  config:
    refreshMinutes: 10          # 轮询间隔(分钟),>=1
    sources:                    # 用量源,源名自定
      glm-cn:
        kind: zhipu-cn          # zai | zhipu-cn | deepseek
        apiKey: <你的 API key>
        # baseUrl: https://open.bigmodel.cn   # 可选覆盖
    providers:                  # 可选:provider id -> 源名;缺省按名称推断
      zai-coding-cn: glm-cn     # (含 zai/zhipu/glm → zai 系源;含 deepseek → deepseek 源)
```

- **provider 对照(重要)**:DSH 的 `zai-coding-cn` 实际请求 `open.bigmodel.cn`,key 来自 bigmodel.cn,须配 `kind: zhipu-cn`;只有 `zai` provider(api.z.ai)才配 `kind: zai`。两者 key 不通用,配错端点会显示「API key 无效或未授权」。
- `deepseek` 的 key 在 [platform.deepseek.com](https://platform.deepseek.com)「API Keys」页创建(`sk-` 开头);查的是**开放平台余额**,与 App 内 `deepseek-account` 登录账号的套餐额度不是一套账。
- key 仅存于本机 profile,与 `~/.dsh/.credentials.yaml` 同级敏感。

### 手动增改源

在线表单可直接增改;改文件的话,在 `model-usage` 条目的 `sources:` 下按同样缩进追加:

```yaml
      deepseek:
        kind: deepseek
        apiKey: <你的 key>
```

文件里还没有 `model-usage` 条目时,按上面示例整块写入(内容只有 `[]` 的先删掉方括号);已有源换 key 就地改那一行。改完重启应用。

## 排错

- **pill 不出现**:当前模型的 provider 没解析到匹配 kind 的源,或 apiKey 为空——按设计静默隐藏,到「设置 → model-usage」核对。
- **「用量获取失败」**:点开弹窗看底部具体原因;「API key 无效或未授权」多为 key 填错,或 kind 与 provider 端点不匹配(见上方对照)。

## 开发

```bash
node tests/parser.test.mjs                                # 解析器/管理器单元测试
node tests/render.test.mjs                                # 弹窗渲染契约测试
node tests/live-e2e.mjs <apiKey> [zai|zhipu-cn|deepseek]  # 在线全链路,kind 缺省 zhipu-cn
```

- `lib/index.js` — Host 半部:Config schema,`.volatile()` 使配置经 settings 镜像下发浏览器;
- `lib/client.js` — 浏览器半部(预构建 bundle):拉取、解析、pill 与弹窗;
- 注册座位 `conversation.composer.dock`(session 作用域),`id: model-usage`。

更新代码后,把 `model-usage` 条目关闭再打开(或重启应用),刷新页面生效。
