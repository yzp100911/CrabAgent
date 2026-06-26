# Mermaid 图表示例

## 1. 流程图 (Flowchart) - 退租申请处理流程

```mermaid
flowchart TD
    A([租客提交退租申请]) --> B{材料是否齐全?}
    B -->|否| C[通知租客补齐材料]
    C --> B
    B -->|是| D[审核租约信息]
    D --> E{审核通过?}
    E -->|否| F[退回申请]
    F --> Z([结束])
    E -->|是| G[核算水电费押金]
    G --> H[生成退租账单]
    H --> I[租客确认签字]
    I --> J{是否同意?}
    J -->|否| K[协商调整]
    K --> I
    J -->|是| L[财务退款]
    L --> M[归档记录]
    M --> Z

    style A fill:#e1f5ff
    style Z fill:#ffe1e1
    style B fill:#fff4e1
    style E fill:#fff4e1
    style J fill:#fff4e1
```

## 2. 时序图 (Sequence Diagram) - 退租系统交互

```mermaid
sequenceDiagram
    autonumber
    participant T as 租客
    participant S as 前端系统
    participant A as API服务
    participant D as 数据库
    participant F as 财务系统

    T->>S: 登录系统
    S->>A: 验证身份
    A->>D: 查询用户信息
    D-->>A: 返回用户数据
    A-->>S: 登录成功
    S-->>T: 显示房源列表

    T->>S: 选择房间并申请退租
    S->>A: 提交退租请求
    A->>D: 查询租约信息
    D-->>A: 返回租约详情
    A->>A: 核算费用
    A->>D: 保存账单草稿
    D-->>A: 保存成功
    A-->>S: 返回账单预览

    T->>S: 确认账单
    S->>A: 确认退租
    A->>F: 发起退款
    F-->>A: 退款成功
    A->>D: 更新租约状态
    A-->>S: 退租完成
    S-->>T: 通知结果
```

## 3. 甘特图 (Gantt Chart) - 房源管理系统开发计划

```mermaid
gantt
    title 房源管理系统开发计划
    dateFormat YYYY-MM-DD
    axisFormat %m-%d

    section 需求阶段
    需求调研           :done, req1, 2026-06-01, 3d
    需求评审           :active, req2, after req1, 2d

    section 设计阶段
    系统架构设计       :des1, after req2, 4d
    数据库设计         :des2, after req2, 3d
    UI原型设计         :des3, after req2, 5d

    section 开发阶段
    后端API开发        :dev1, after des1, 10d
    前端页面开发       :dev2, after des3, 12d
    数据库实现         :dev3, after des2, 5d

    section 测试阶段
    单元测试           :test1, after dev3, 3d
    集成测试           :test2, after dev1 dev2, 5d
    系统测试           :test3, after test2, 4d

    section 部署阶段
    生产环境部署       :deploy1, after test3, 2d
    上线运营           :milestone, deploy2, after deploy1, 0d
```

---

## 渲染说明

上面的代码块使用 \`mermaid\` 标记，可以在以下环境渲染：
- GitHub / GitLab Markdown
- VS Code (需安装 Mermaid 插件)
- Typora / Obsidian
- 在线工具 https://mermaid.live

## Mermaid 语法速查

### 流程图常用元素
- `flowchart TD` / `LR` 方向
- `A-->B` 箭头连接
- `A{判断?}` 菱形判断
- `A([圆角])` 圆角/椭圆
- `A[(数据库)]` 圆柱形
- `style A fill:#颜色` 节点着色

### 时序图常用元素
- `participant` 定义参与者
- `->>` 实线箭头，`-->>` 虚线箭头
- `Note over` 添加注释
- `loop` / `alt` / `par` 块结构

### 甘特图常用元素
- `section` 分组
- `:done` / `:active` 状态标记
- `任务名 :id, after 任务id, 持续天数`
- `milestone` 里程碑
