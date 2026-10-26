# Rondo：WorkBuddy 本地执行桥接开源调查

日期：2026-10-26。范围：从Rondo向本机真实WorkBuddy派工，保留原有执行环境。
本轮读取GitHub固定版本源码，没有安装桥接器、改动WorkBuddy配置或发出模型提示词。

## 结论与修正

已找到直接面向该问题的实现，不能再把开放平台应用权限作为所有接入方式的前置条件。
官方Open API仍是一条独立路线；本地ACP/桌面原生RPC是社区已有的另一条路线。
源码存在不等于当前本机5.9.2兼容，更不等于已经完成代码执行与审查闭环。

## 优先研究：真实桌面会话

### Kxiandaoyan/workbuddy-acp-bridge

固定commit：3f2f52e7a03b32c455b1718ad43730177472e2ff。

- [核心源码](https://github.com/Kxiandaoyan/workbuddy-acp-bridge/blob/3f2f52e7a03b32c455b1718ad43730177472e2ff/acp_live_send.py)：
  92–140行从interactive会话记录、进程端口和ACP握手定位指定桌面会话；
  145–169行用workbuddy://chat/<sessionId>重新激活既有会话；
  259–287行连接并初始化；289–340行发送session/prompt；355–415行协调派发。
- Windows、Python标准库；这一接法的目标是桌面已存在会话，不是创建独立CodeBuddy CLI。
- 可借鉴：指定session/cwd、真实交互端点发现、冷会话激活。
- 必须改：默认返回SENT只证明看到开始事件，不是完成；当前SSE用字符串检测且只确认首帧；
  发送不确定时的load和重发可能重复执行，不直接移植到Rondo。
- 缺口：仍需为Rondo准备专用会话；不能随意使用用户当前对话。目录匹配也不能代替唯一任务绑定。

### dudu555-djiao/codex-workbuddy-gateway

固定commit：fbaaa2ef6d6cb59f48b953a1f27058202a81553f。

- [原生驱动](https://github.com/dudu555-djiao/codex-workbuddy-gateway/blob/fbaaa2ef6d6cb59f48b953a1f27058202a81553f/src/native-desktop-trigger.ts)
  使用CDP进入桌面MessageChannel RPC，调用session:sendMessage；先检查忙闲、待输入和目录，
  并包含模型配置与读回验证。
- [持久服务](https://github.com/dudu555-djiao/codex-workbuddy-gateway/blob/fbaaa2ef6d6cb59f48b953a1f27058202a81553f/src/persistent-service.ts)
  与任务队列区分派发、领取、回报、验收，支持恢复与唤醒关联。
- 可借鉴：专用会话创建/绑定、按需唤醒、队列与原生收据关联，最接近产品完整流程。
- 限制：当前进程归属、启动与重启实现调用macOS的lsof/ps/osascript，不能直接在Windows采用。
  本轮不重启正在使用的WorkBuddy，不安装其LaunchAgent，也不复制它的整个工作台。

## 可复用协议，但不直接当桌面原生执行

### jie023/workbuddy-acp-bridge

固定commit：e2327499273efa093ebdcbffde9a4c8833e26e76。

- [gateway.py](https://github.com/jie023/workbuddy-acp-bridge/blob/e2327499273efa093ebdcbffde9a4c8833e26e76/src/workbuddy_acp_bridge/gateway.py)
  校验回环地址、心跳和会话文件范围。
- [acp_client.py](https://github.com/jie023/workbuddy-acp-bridge/blob/e2327499273efa093ebdcbffde9a4c8833e26e76/src/workbuddy_acp_bridge/acp_client.py)
  113–150行连接/初始化，177–240行建/载会话、选模型、发送；460–485行拒绝或单次授权。
- 适合参考ACP协议与显式权限响应；现有全局共享会话、每轮/clear不适合Rondo任务返修历史。
  mcpServers为空不能单独证明继承了全部WorkBuddy连接器与Skills。

### gosick233-cloud/Codex-WorkBuddy-Desktop-Bridge

固定commit：c00a8e5eab809a97963277e71ec008abb3d372ae。

- [acp.py](https://github.com/gosick233-cloud/Codex-WorkBuddy-Desktop-Bridge/blob/c00a8e5eab809a97963277e71ec008abb3d372ae/workbuddy_bridge/acp.py)
  通过sidecar命名管道发现Host，再为每个任务启动内置CLI Host，使用WorkBuddy配置目录。
- 可参考协议、独立runtime和会话事件归属；这不是直接使用GUI当前会话。
- 不照搬强制fullAccess/allow_always，也不采用history.py直接写WorkBuddy私有数据库的注册方式。

### BenjaminNH/workbuddy-subagent-bridge

固定commit：6ffbb7484c93dee564385a96929633715ea3022d。

- [acp-client.ts](https://github.com/BenjaminNH/workbuddy-subagent-bridge/blob/6ffbb7484c93dee564385a96929633715ea3022d/src/acp-client.ts)
  54–57行spawn内置CLI并传--acp，72–92行创建/继续/取消会话。
- 默认plan与权限请求回传可参考，但不是GUI桌面会话的等价证明。

## 排除的近似方向

- hanhan1223/workbuddy-bridge、Ianzhyh/workbuddy-to-dsh、dsh-plugin-lab/dsh-workbuddy-bridge：
  主要导出WorkBuddy账号模型能力作为兼容API，不自动保留WorkBuddy执行环境。
- trexwb/wbBridge、louchi1984-coder/ow-bridge、soulvon/AnyBridge：模型渠道/配置管理方向，
  不解决Rondo向WorkBuddy派工。
- chenin0931/OpenWorkbuddy、opensymph/OpenBuddy：独立Agent工作台实现，
  不是控制已安装WorkBuddy的适配器。
- A3-77/workbuddy-control-skill：包含从进程环境恢复Gateway密码，
  不优先于正常ACP连接流程；本轮没有读取进程环境、解密账户凭据或运行其脚本。

## 本机最小探针与证据边界

发现.workbuddy/sessions中有一个interactive会话记录。原计划只做connect+initialize，
先核对该记录PID是否仍属于已安装WorkBuddy，失败就不连接。
进程核对发现该interactive记录的PID已经退出，因此探针跳过网络请求。
忽略目录中的workbuddy-acp-handshake.json记录candidate_count=0、model_prompt_sent=false、
session_load_sent=false。没有证明握手成功，也没有把过期记录当在线执行器。

## 推荐下一步

以Kxiandaoyan的真实桌面会话ACP路径为Windows候选，借鉴原生Gateway的专用会话绑定与唤醒方式；
Rondo继续拥有自己的任务记录、隔离Git工作区、检查和Codex审查。
先证明当前版本的专用桌面会话连接与一次精确派发，再接结果MCP回传。
改造为单次派发、未知状态不自动重发、按task/run/session关联；模型首帧不等于完成，
也不以直接写WorkBuddy数据库伪造原生历史。后续需实际核对Skills、MCP、目录、模型与权限继承。
