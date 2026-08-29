# convert-config.js 使用说明

`convert-config.js` 用于将 `config.txt` 中的代理分享链接转换为 Mihomo（Clash Meta）配置文件 `clash-meta.yaml`。

## 环境要求

- Node.js（脚本只使用 Node.js 内置的 `fs` 模块，无需安装依赖）。
- Mihomo / Clash Meta 客户端；输出包含 VLESS、TUIC、Hysteria2 和 AnyTLS，普通 Clash 内核可能无法识别这些协议。

## 快速开始

将待转换的链接保存为与脚本同目录的 `config.txt`，然后在该目录执行：

```bash
node convert-config.js
```

脚本会在当前目录生成或覆盖 `clash-meta.yaml`，并在终端输出统计信息，包括发现的链接数、成功转换的节点数，以及无法解析的条目数。

## 输入格式

`config.txt` 可以包含任意文本；脚本会从中自动提取以下 URI，链接可按行存放或混杂在其他文本中：

```text
vless://...
tuic://...
hy2://...
ss://...
vmess://...
anytls://...
```

节点名称取自 URI 的 `#名称` 片段（VMess 取 `ps` 字段）。名称缺失时，分别使用协议名作为默认值。重复名称会自动追加 ` (2)`、` (3)` 等后缀。

## 支持情况

| 协议 | 生成的 Mihomo 类型 | 已读取的主要字段 |
| --- | --- | --- |
| VLESS | `vless` | 地址、端口、UUID、传输方式、TLS/Reality、SNI、指纹、flow、WS/gRPC 参数、跳过证书验证 |
| TUIC | `tuic` | 地址、端口、UUID、密码、ALPN、SNI、UDP 中继模式、拥塞控制、跳过证书验证 |
| Hysteria2 (`hy2`) | `hysteria2` | 地址、端口、密码、SNI、跳过证书验证 |
| AnyTLS | `anytls` | 地址、端口、密码、SNI、跳过证书验证 |
| Shadowsocks (`ss`) | `ss` | 地址、端口、加密方式、密码；支持 Base64 或明文 `method:password` 凭据 |
| VMess | `vmess` | 地址、端口、UUID、alterId、加密方式、传输方式、TLS、SNI、指纹 |

解析异常的 URI 不会中断转换，会被跳过并计入终端统计。请根据统计中的跳过数量检查原始链接是否完整、有效。

## 输出内容

除 `proxies` 外，输出还预置了以下配置：

- HTTP、SOCKS 和混合端口：`7890`、`7891`、`7892`
- 局域网访问、规则模式、统一延迟和 Chrome 全局客户端指纹
- Fake-IP DNS 及国内/备用 DNS 服务器
- `负载均衡`、`自动选择`、`🌍选择代理` 三个代理组
- `GEOIP,LAN,DIRECT`、`GEOIP,CN,DIRECT` 和默认代理规则

生成完成后，可按需要直接编辑 `clash-meta.yaml` 中的端口、DNS、规则或代理组。

## 常见问题

### 找不到 `config.txt`

脚本固定从**当前工作目录**读取 `config.txt`。请先切换到脚本和配置文件所在目录，或在该目录执行命令。

```bash
cd /home/sun
node convert-config.js
```

### 输出文件被覆盖

每次运行都会覆盖当前目录的 `clash-meta.yaml`。如需保留旧配置，请先备份或改名。

### 链接没有被转换

确认链接协议为上述六种之一，且 URI 本身完整。脚本只匹配以这些协议前缀开头的链接；不支持订阅 URL 的下载和解码，需要先将订阅内容展开后写入 `config.txt`。
