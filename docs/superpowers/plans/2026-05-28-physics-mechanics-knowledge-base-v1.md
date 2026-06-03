# 大学物理力学知识库 v1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 STEMotion 的 `physics_mechanics` 学科 Skill 构建结构化、可追溯、可扩展的大学物理力学知识库 v1，覆盖 13 个知识模块，支撑 /rag 页面的知识讲解、分步解题、错因诊断和教师备课四类教学任务。

**Architecture:** 在 `skills/physics_mechanics/knowledge_base/` 目录下新增 12 个 Markdown 知识文件（替换原有 1 个简陋文件），每个文件包含 YAML frontmatter、结构化小标题、公式、常见误区、教学提示和来源说明。通过现有 `npm run rag:ingest` 入库，通过 `npm run rag:query` 验证检索效果。同步更新 `docs/knowledge_sources.md` 和 `docs/evaluation/knowledge_base_validation.md`。

**Tech Stack:** Markdown with YAML frontmatter, LaTeX math notation (backslash-paren), existing RAG ingest pipeline (TF-IDF + BM25), Node test runner

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `skills/physics_mechanics/knowledge_base/00_physics_mechanics_overview.md` | Create | 力学知识体系概览 |
| `skills/physics_mechanics/knowledge_base/01_kinematics_basics.md` | Create | 运动学基础 |
| `skills/physics_mechanics/knowledge_base/02_projectile_motion.md` | Replace | 斜抛运动（替换原有简陋版本） |
| `skills/physics_mechanics/knowledge_base/03_newton_laws.md` | Create | 牛顿运动定律 |
| `skills/physics_mechanics/knowledge_base/04_circular_motion.md` | Create | 圆周运动 |
| `skills/physics_mechanics/knowledge_base/05_work_energy.md` | Create | 功和能 |
| `skills/physics_mechanics/knowledge_base/06_momentum_impulse.md` | Create | 动量与冲量 |
| `skills/physics_mechanics/knowledge_base/07_simple_harmonic_motion.md` | Create | 简谐振动 |
| `skills/physics_mechanics/knowledge_base/08_rigid_body_rotation.md` | Create | 刚体转动基础 |
| `skills/physics_mechanics/knowledge_base/09_common_misconceptions.md` | Create | 常见误区汇总 |
| `skills/physics_mechanics/knowledge_base/10_problem_bank.md` | Create | 典型题库 |
| `skills/physics_mechanics/knowledge_base/11_teacher_demo_cases.md` | Create | 教师演示案例 |
| `skills/physics_mechanics/knowledge_base/12_experiment_guides.md` | Create | 实验指导 |
| `docs/knowledge_sources.md` | Modify | 来源登记与合规说明 |
| `docs/evaluation/knowledge_base_validation.md` | Create | 知识库验证报告 |
| `README.md` | Modify | 添加知识库覆盖说明 |

---

### Task 1: 来源研究与登记（SourceScoutAgent）

**Files:**
- Modify: `docs/knowledge_sources.md`

**目标：** 整理大学物理力学知识库可参考的公开资料来源，更新来源登记文档。

- [ ] **Step 1: 研究公开可参考的物理力学资料来源**

检索以下类型的公开资料：
- OpenStax University Physics（CC-BY 开放教材）
- MIT OpenCourseWare 8.01 Classical Mechanics（公开课程）
- HyperPhysics（Georgia State University 公开教学资源）
- Feynman Lectures on Physics（公开讲义）
- Wikipedia 中文物理条目（补充参考）
- 公开实验教学资料

为每个来源记录：title、url、publisher、accessed_at、covered_topics、license_or_usage_note、reliability_level。

- [ ] **Step 2: 更新 docs/knowledge_sources.md**

在现有文档中新增"大学物理力学知识库 v1 来源登记"部分。格式如下：

```markdown
## 大学物理力学知识库 v1 来源登记

> 以下来源仅用于内容参考和原创整理，不复制原文。所有知识库文件标记为 `source_type: local_synthesized_note`。

### 主要参考来源

| 来源名称 | URL | 出版/机构 | 许可/使用说明 | 可靠度 | 覆盖知识点 |
|----------|-----|----------|-------------|--------|-----------|
| OpenStax University Physics | https://openstax.org/details/books/university-physics-volume-1 | OpenStax | CC-BY 4.0 | 高 | 运动学、牛顿定律、功和能、动量、振动、转动 |
| MIT OCW 8.01 Classical Mechanics | https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/ | MIT | CC-BY-NC-SA 4.0 | 高 | 牛顿定律、功和能、动量、振动 |
| HyperPhysics | http://hyperphysics.phy-astr.gsu.edu/hbase/hph.html | Georgia State University | 公开教学资源 | 中 | 概念解释、公式推导、常见误区 |
| Feynman Lectures on Physics Vol. I | https://www.feynmanlectures.caltech.edu/I_00.html | Caltech | 公开在线版 | 高 | 物理直觉、概念理解 |
| Wikipedia 中文物理条目 | https://zh.wikipedia.org | Wikimedia | CC-BY-SA 3.0 | 低-中 | 补充参考、术语对照 |

### 来源使用说明

1. 所有知识库文件均为公开资料参考后的**原创整理笔记**，不复制外部来源原文。
2. 每个文件的 `source_type` 标记为 `local_synthesized_note`。
3. 本地课程资料始终是优先可信来源；上述来源仅作为内容参考。
4. 团队后续应替换为学校授权的课程讲义、教材和题库。
```

- [ ] **Step 3: 验证文档格式**

确认 `docs/knowledge_sources.md` 包含：原有台账 + v1 来源登记 + 来源使用说明。

---

### Task 2: 撰写知识库文件 — 运动学与斜抛（KnowledgeWriterAgent batch 1）

**Files:**
- Create: `skills/physics_mechanics/knowledge_base/00_physics_mechanics_overview.md`
- Create: `skills/physics_mechanics/knowledge_base/01_kinematics_basics.md`
- Replace: `skills/physics_mechanics/knowledge_base/02_projectile_motion.md`
- Create: `skills/physics_mechanics/knowledge_base/03_newton_laws.md`

每个文件要求：
- 包含 YAML frontmatter（subject, module, title, type, source_type, version, updated_at, keywords）
- 600-1500 中文字
- 小标题清晰，适合 RAG 切分
- 公式使用 `\( \)` 行内和 `\[ \]` 独立行格式
- 变量含义和单位明确
- 每个核心公式说明适用条件
- 包含常见误区
- 包含教学提示或可视化建议
- 末尾有"参考来源 / 来源说明"

- [ ] **Step 1: 编写 00_physics_mechanics_overview.md**

文件路径：`skills/physics_mechanics/knowledge_base/00_physics_mechanics_overview.md`

```markdown
---
subject: physics_mechanics
module: overview
title: 大学物理力学知识体系概览
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 大学物理
  - 力学
  - 知识体系
  - 学习路径
  - 物理量
---

# 大学物理力学知识体系概览

## 力学在大学物理中的位置

大学物理力学是理工科学生接触的第一门系统性物理课程，也是后续学习电磁学、热学、光学和量子力学的基础。力学研究物体的运动规律及其与力的关系，核心问题可以概括为：**物体为什么这样运动？**

力学的知识体系可以分为以下几个主要模块：

1. **运动学**：描述运动（位移、速度、加速度），不涉及运动原因。
2. **动力学**：解释运动（牛顿定律、力与加速度的关系）。
3. **功和能**：从能量角度分析运动（功、动能、势能、机械能守恒）。
4. **动量和冲量**：从动量角度分析运动（动量定理、动量守恒、碰撞）。
5. **振动与波动**：周期性运动（简谐振动、阻尼振动、受迫振动）。
6. **刚体转动**：绕固定轴的转动（转动惯量、力矩、转动动能、角动量）。

这些模块之间并非孤立，而是相互关联的。例如，斜抛运动既是运动学的典型应用，也可以用能量方法分析；碰撞问题同时涉及动量守恒和能量分析。

## 学习路径建议

推荐的学习顺序：

1. 先掌握运动学基础（位移、速度、加速度、矢量分解）。
2. 学习牛顿三定律，建立"力是改变运动状态的原因"的物理直觉。
3. 以斜抛运动为综合案例，练习运动学与动力学的结合。
4. 学习功和能，掌握从能量角度分析问题的方法。
5. 学习动量和冲量，掌握碰撞和守恒问题。
6. 学习简谐振动，理解周期性运动。
7. 学习刚体转动，将平动概念推广到转动。

## 常用物理量与单位

| 物理量 | 符号 | 单位 | 说明 |
|--------|------|------|------|
| 位移 | \(s, x, \vec{r}\) | m（米） | 位置变化量，矢量 |
| 速度 | \(v, \vec{v}\) | m/s（米每秒） | 位移对时间的变化率，矢量 |
| 加速度 | \(a, \vec{a}\) | m/s²（米每二次方秒） | 速度对时间的变化率，矢量 |
| 质量 | \(m\) | kg（千克） | 物体惯性大小的量度 |
| 力 | \(F, \vec{F}\) | N（牛顿） | 1 N = 1 kg·m/s² |
| 功 | \(W\) | J（焦耳） | 1 J = 1 N·m |
| 动能 | \(E_k\) | J（焦耳） | \(E_k = \frac{1}{2}mv^2\) |
| 势能 | \(E_p\) | J（焦耳） | 重力势能 \(E_p = mgh\) |
| 动量 | \(p, \vec{p}\) | kg·m/s | \(\vec{p} = m\vec{v}\) |
| 冲量 | \(I, \vec{I}\) | N·s | \(\vec{I} = \vec{F} \Delta t\) |
| 角速度 | \(\omega\) | rad/s | 转动快慢 |
| 转动惯量 | \(I\) | kg·m² | 转动惯性大小 |
| 力矩 | \(\tau\) | N·m | \(\tau = rF\sin\theta\) |

## 学习建议

- 理解比记忆重要：每个公式都有物理含义和适用条件。
- 画图是基本功：受力分析图、运动轨迹图、速度分解图。
- 注意矢量方向：力、速度、加速度都是矢量，方向错误是常见错误来源。
- 多做综合题：将多个模块知识结合的问题最能检验理解程度。

## 参考来源

本文为公开资料参考后的原创整理笔记，用于支撑 RAG 知识讲解和教师备课任务。主要参考 OpenStax University Physics 和 MIT OCW 8.01 的知识体系结构。
```

- [ ] **Step 2: 编写 01_kinematics_basics.md**

文件路径：`skills/physics_mechanics/knowledge_base/01_kinematics_basics.md`

```markdown
---
subject: physics_mechanics
module: kinematics
title: 运动学基础
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 位移
  - 速度
  - 加速度
  - 匀速直线运动
  - 匀变速直线运动
  - 矢量分解
---

# 运动学基础

## 位移与路程

**位移**是从初始位置指向末位置的有向线段，用 \(\vec{\Delta r} = \vec{r_f} - \vec{r_i}\) 表示，是矢量。**路程**是物体运动轨迹的实际长度，是标量。在直线运动中，如果物体始终沿同一方向运动，位移大小等于路程；如果有折返，位移大小小于路程。

## 速度

**平均速度**定义为位移与时间的比值：\(\vec{v_{avg}} = \frac{\vec{\Delta r}}{\Delta t}\)。**瞬时速度**是 \(\Delta t \to 0\) 时平均速度的极限：\(\vec{v} = \lim_{\Delta t \to 0} \frac{\vec{\Delta r}}{\Delta t} = \frac{d\vec{r}}{dt}\)。

**速率**是速度的大小 \(v = |\vec{v}|\)，是标量。注意区分"速度大"和"速率大"——匀速圆周运动中速率不变，但速度方向在变。

## 加速度

**平均加速度**：\(\vec{a_{avg}} = \frac{\vec{\Delta v}}{\Delta t}\)。**瞬时加速度**：\(\vec{a} = \frac{d\vec{v}}{dt}\)。

加速度描述速度变化的快慢和方向。加速度方向与速度方向一致时，物体加速；加速度方向与速度方向相反时，物体减速。加速度为零不代表物体静止，只代表速度不变。

## 匀速直线运动

速度恒定，加速度为零。位移公式：\(s = vt\)。

## 匀变速直线运动

加速度恒定。基本公式：

- 速度公式：\(v = v_0 + at\)
- 位移公式：\(s = v_0 t + \frac{1}{2}at^2\)
- 速度位移关系：\(v^2 = v_0^2 + 2as\)

其中 \(v_0\) 是初速度，\(a\) 是加速度（可正可负），\(t\) 是时间。

**适用条件**：加速度恒定的直线运动。斜抛运动的竖直方向分运动就是匀变速直线运动。

## 矢量分解

在二维运动中，通常将矢量分解为水平（x）和竖直（y）两个方向：

- 速度分解：\(v_x = v\cos\theta\)，\(v_y = v\sin\theta\)
- 加速度分解：\(a_x = a\cos\theta\)，\(a_y = a\sin\theta\)

分解后各方向独立分析，最后合成。这是处理斜抛运动的基本方法。

## 运动图像

- **x-t 图像**：斜率表示速度。直线表示匀速运动，曲线表示变速运动。
- **v-t 图像**：斜率表示加速度，面积表示位移。直线表示匀变速运动。
- **a-t 图像**：面积表示速度变化量。

## 常见误区

1. **混淆位移和路程**：绕操场跑一圈，位移为零，路程为周长。
2. **忽略加速度方向**：减速运动时加速度方向与速度方向相反，不能只看大小。
3. **误用匀变速公式**：匀变速公式只在加速度恒定时成立，变加速运动不能直接套用。
4. **矢量合成错误**：分解后各方向独立计算，但合成时必须考虑方向，不能简单相加。

## 教学提示

- 建议先用一维直线运动建立概念，再推广到二维。
- 用 x-t 和 v-t 图像帮助学生理解运动过程。
- 强调"加速度为零不代表静止"这个反直觉概念。

## 参考来源

本文为公开资料参考后的原创整理笔记。运动学基础内容参考 OpenStax University Physics Volume 1 Chapter 2-3 和 MIT OCW 8.01 运动学部分。
```

- [ ] **Step 3: 替换 02_projectile_motion.md**

文件路径：`skills/physics_mechanics/knowledge_base/02_projectile_motion.md`

将原有简陋版本替换为更完整的版本：

```markdown
---
subject: physics_mechanics
module: projectile_motion
title: 斜抛运动
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 斜抛运动
  - 速度分解
  - 最大高度
  - 水平射程
  - 飞行时间
  - 轨迹方程
---

# 斜抛运动

## 运动模型

斜抛运动是指物体以初速度 \(v_0\) 沿与水平方向成 \(\theta\) 角斜向上抛出的运动。标准模型假设：

1. 物体可视为质点。
2. 空气阻力忽略不计。
3. 重力加速度 \(g\) 恒定，方向竖直向下。
4. 发射点和落地点在同一水平面上（除非特别说明）。

## 速度分解

将初速度分解为水平和竖直两个分量：

- 水平分速度：\(v_{0x} = v_0 \cos\theta\)
- 竖直分速度：\(v_{0y} = v_0 \sin\theta\)

在运动过程中：
- 水平方向不受力，保持匀速：\(v_x = v_0 \cos\theta\)（恒定）
- 竖直方向受重力，做匀变速运动：\(v_y = v_0 \sin\theta - gt\)

## 运动方程

位置随时间变化：

- 水平位移：\(x = v_0 \cos\theta \cdot t\)
- 竖直位移：\(y = v_0 \sin\theta \cdot t - \frac{1}{2}gt^2\)

## 最大高度

到达最高点时竖直速度为零：\(v_y = 0\)，解得最高点时间：

\[t_h = \frac{v_0 \sin\theta}{g}\]

代入竖直位移公式，最大高度为：

\[H = \frac{v_0^2 \sin^2\theta}{2g}\]

**注意**：最大高度公式中的 \(v_0 \sin\theta\) 是竖直方向初速度，不是总初速度。这是最常见的错误来源。

## 飞行时间

若发射点和落地点在同一高度，总飞行时间为最高点时间的两倍：

\[T = \frac{2v_0 \sin\theta}{g}\]

## 水平射程

水平射程等于水平速度乘以总飞行时间：

\[R = v_0 \cos\theta \cdot T = \frac{v_0^2 \sin 2\theta}{g}\]

当 \(\theta = 45°\) 时，\(\sin 2\theta = 1\)，射程最大：\(R_{max} = \frac{v_0^2}{g}\)。

## 轨迹方程

消去时间参数 \(t\)，得到轨迹方程：

\[y = x \tan\theta - \frac{gx^2}{2v_0^2 \cos^2\theta}\]

这是一条抛物线。

## 速度大小

任意时刻的速度大小：

\[v = \sqrt{v_x^2 + v_y^2} = \sqrt{(v_0\cos\theta)^2 + (v_0\sin\theta - gt)^2}\]

最高点速度最小，等于水平分速度：\(v_{min} = v_0 \cos\theta\)。

## 可视化参数

斜抛运动可视化需要以下参数：

- \(v_0\)：初速度大小（m/s）
- \(\theta\)（或 angle_deg）：发射角（度）
- \(g\)：重力加速度（m/s²，通常取 9.8）

典型示例：\(v_0 = 20\) m/s，\(\theta = 30°\)，\(g = 9.8\) m/s² 时：

- \(H = \frac{20^2 \times \sin^2 30°}{2 \times 9.8} = \frac{400 \times 0.25}{19.6} \approx 5.10\) m
- \(R = \frac{20^2 \times \sin 60°}{9.8} = \frac{400 \times 0.866}{9.8} \approx 35.35\) m
- \(T = \frac{2 \times 20 \times \sin 30°}{9.8} = \frac{20}{9.8} \approx 2.04\) s

## 常见误区

1. **最大高度公式误用**：把 \(H = \frac{v_0^2}{2g}\) 当作斜抛最大高度。正确公式是 \(H = \frac{v_0^2 \sin^2\theta}{2g}\)，必须包含 \(\sin^2\theta\)。
2. **忽略速度分解**：直接用 \(v_0\) 代入竖直方向公式，忘记先分解。
3. **角度单位错误**：公式中的角度必须用弧度（或 \(\sin/\cos\) 函数自动处理），计算器未切换到角度模式。
4. **套用同高公式**：落地点高度不同时，不能直接用 \(R = \frac{v_0^2 \sin 2\theta}{g}\)。
5. **忽略适用条件**：以上公式都假设忽略空气阻力、恒定重力加速度、同高度发射落地。

## 教学提示

- 先复习矢量分解，再引入斜抛运动。
- 用"水平匀速 + 竖直匀加速"的分解思想是核心。
- 可以用动画演示不同发射角下的轨迹变化。
- 强调"最高点速度不为零"（只有竖直分速度为零）。

## 参考来源

本文为公开资料参考后的原创整理笔记。斜抛运动内容参考 OpenStax University Physics Volume 1 Chapter 4 和 HyperPhysics 抛体运动条目。
```

- [ ] **Step 4: 编写 03_newton_laws.md**

文件路径：`skills/physics_mechanics/knowledge_base/03_newton_laws.md`

```markdown
---
subject: physics_mechanics
module: newton_laws
title: 牛顿运动定律
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 牛顿第一定律
  - 牛顿第二定律
  - 牛顿第三定律
  - 受力分析
  - 惯性系
  - 合力
  - 摩擦力
---

# 牛顿运动定律

## 牛顿第一定律（惯性定律）

**内容**：一切物体总保持匀速直线运动状态或静止状态，除非有外力迫使它改变这种状态。

**物理含义**：
- 力不是维持运动的原因，而是改变运动状态的原因。
- 惯性是物体的固有属性，质量是惯性大小的量度。
- 第一定律定义了惯性参考系——在其中牛顿定律成立的参考系。

## 牛顿第二定律

**内容**：物体的加速度与所受合外力成正比，与质量成反比，方向与合外力方向相同。

**公式**：

\[\vec{F_{net}} = m\vec{a}\]

或分量形式：

\[F_{net,x} = ma_x, \quad F_{net,y} = ma_y\]

**适用条件**：
- 在惯性参考系中成立。
- \(m\) 是物体的惯性质量。
- \(\vec{F_{net}}\) 是所有外力的矢量和。
- 适用于质点或可视为质点的物体。

## 牛顿第三定律

**内容**：两个物体之间的作用力和反作用力大小相等、方向相反、作用在不同物体上。

**公式**：\(\vec{F_{12}} = -\vec{F_{21}}\)

**关键特征**：
- 作用力和反作用力同时产生、同时消失。
- 作用在不同物体上，不能抵消。
- 性质相同（都是引力、都是弹力等）。

## 常见力

**重力**：\(G = mg\)，方向竖直向下，作用点在重心。

**支持力（法向力）**：物体接触面产生的弹力，方向垂直于接触面指向物体。

**摩擦力**：
- 静摩擦力：\(0 \leq f_s \leq \mu_s N\)，方向与相对运动趋势相反。
- 动摩擦力：\(f_k = \mu_k N\)，方向与相对运动方向相反。
- 其中 \(\mu_s\) 是静摩擦系数，\(\mu_k\) 是动摩擦系数，\(N\) 是法向力。

**拉力/张力**：绳索、弹簧等传递的力。

## 受力分析步骤

1. 确定研究对象（隔离体）。
2. 画出研究对象的受力图。
3. 沿运动方向和垂直运动方向建立坐标系。
4. 将各力分解到坐标轴方向。
5. 列牛顿第二定律方程：\(\sum F_x = ma_x\)，\(\sum F_y = ma_y\)。
6. 求解未知量。

## 常见误区

1. **力是运动的原因**：错误认为物体运动一定有力作用。实际上力是改变运动状态（加速）的原因，匀速运动时合力为零。
2. **作用力反作用力抵消**：认为作用力和反作用力可以抵消。它们作用在不同物体上，不能抵消。
3. **漏力或多画力**：受力分析时遗漏某个力，或把"分力"和"合力"同时画上。
4. **混淆质量和重量**：质量是标量，不随位置变化；重量是重力大小，随 \(g\) 变化。
5. **摩擦力方向错误**：摩擦力方向与相对运动趋势（或相对运动）方向相反，不一定与运动方向相反。

## 教学提示

- 受力分析是力学的核心技能，需要大量练习。
- 建议先画受力图，再列方程，不要跳过画图步骤。
- 用"隔离体法"分析连接体问题。
- 强调"力是改变运动状态的原因"这一核心物理直觉。

## 参考来源

本文为公开资料参考后的原创整理笔记。牛顿运动定律内容参考 OpenStax University Physics Volume 1 Chapter 5-6、MIT OCW 8.01 和 Feynman Lectures Chapter 12。
```

---

### Task 3: 撰写知识库文件 — 圆周运动与能量（KnowledgeWriterAgent batch 2）

**Files:**
- Create: `skills/physics_mechanics/knowledge_base/04_circular_motion.md`
- Create: `skills/physics_mechanics/knowledge_base/05_work_energy.md`
- Create: `skills/physics_mechanics/knowledge_base/06_momentum_impulse.md`
- Create: `skills/physics_mechanics/knowledge_base/07_simple_harmonic_motion.md`

- [ ] **Step 1: 编写 04_circular_motion.md**

文件路径：`skills/physics_mechanics/knowledge_base/04_circular_motion.md`

```markdown
---
subject: physics_mechanics
module: circular_motion
title: 圆周运动
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 匀速圆周运动
  - 向心加速度
  - 向心力
  - 线速度
  - 角速度
  - 周期
---

# 圆周运动

## 匀速圆周运动

匀速圆周运动是指物体以恒定速率沿圆周运动。虽然速率不变，但速度方向不断变化，因此存在加速度。

## 描述圆周运动的物理量

**角速度**：\(\omega = \frac{\Delta\theta}{\Delta t}\)，单位 rad/s。

**线速度**：\(v = \omega r\)，其中 \(r\) 是圆周半径。

**周期**：运动一周所需时间 \(T = \frac{2\pi}{\omega} = \frac{2\pi r}{v}\)。

**频率**：\(f = \frac{1}{T}\)，单位 Hz。

## 向心加速度

匀速圆周运动的加速度方向始终指向圆心，称为**向心加速度**：

\[a_n = \frac{v^2}{r} = \omega^2 r\]

**关键理解**：速度大小不变，但方向在变。加速度描述速度变化率，方向变化也需要加速度。向心加速度只改变速度方向，不改变速度大小。

## 向心力

产生向心加速度的力称为**向心力**。向心力不是一种新的独立力，而是某个实际力（或合力）在指向圆心方向的分量。

\[F_n = ma_n = \frac{mv^2}{r} = m\omega^2 r\]

**向心力的来源**可以是：
- 重力（如卫星绕地球）
- 拉力（如绳子拴住的物体）
- 摩擦力（如汽车转弯）
- 支持力的分量（如过山车在圆轨道顶部）

## 变速圆周运动

如果速率也在变化，则加速度有两个分量：
- 向心加速度 \(a_n = \frac{v^2}{r}\)（改变速度方向）
- 切向加速度 \(a_t = \frac{dv}{dt}\)（改变速度大小）

总加速度：\(a = \sqrt{a_n^2 + a_t^2}\)。

## 常见误区

1. **匀速圆周运动没有加速度**：错误。速度方向变化意味着存在加速度，即向心加速度。
2. **向心力是一种新力**：错误。向心力是实际力的合力在圆心方向的分量，不要在受力图上额外画"向心力"。
3. **离心力**：在惯性系中不存在"离心力"。离心力是惯性力，只在非惯性参考系中引入。
4. **向心力使物体远离圆心**：错误。向心力指向圆心，使物体保持圆周运动；如果向心力消失，物体将沿切线方向飞出。

## 教学提示

- 用绳子拴住小球旋转的实验演示向心力。
- 强调"向心力不是一种新力"，避免学生在受力图上多画力。
- 可以用不同转速演示向心力与速度、半径的关系。
- 卫星运动是圆周运动的重要应用案例。

## 参考来源

本文为公开资料参考后的原创整理笔记。圆周运动内容参考 OpenStax University Physics Volume 1 Chapter 6 和 HyperPhysics 圆周运动条目。
```

- [ ] **Step 2: 编写 05_work_energy.md**

文件路径：`skills/physics_mechanics/knowledge_base/05_work_energy.md`

```markdown
---
subject: physics_mechanics
module: work_energy
title: 功和能
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 功
  - 功率
  - 动能
  - 势能
  - 动能定理
  - 机械能守恒
  - 保守力
---

# 功和能

## 功

**恒力做功**：\(W = Fs\cos\theta\)，其中 \(F\) 是力的大小，\(s\) 是位移大小，\(\theta\) 是力与位移方向的夹角。

**变力做功**：\(W = \int \vec{F} \cdot d\vec{s}\)。

功是标量，单位是焦耳（J）。功可正可负：力与位移同向时做正功，反向时做负功。

## 功率

**平均功率**：\(P_{avg} = \frac{W}{t}\)。

**瞬时功率**：\(P = \vec{F} \cdot \vec{v} = Fv\cos\theta\)。

功率单位是瓦特（W），1 W = 1 J/s。

## 动能

物体由于运动而具有的能量：

\[E_k = \frac{1}{2}mv^2\]

动能是标量，恒为正值。

## 动能定理

合外力对物体做的功等于物体动能的变化：

\[W_{net} = \Delta E_k = \frac{1}{2}mv^2 - \frac{1}{2}mv_0^2\]

这是功和能之间的桥梁，适用于任何力做功的情况。

## 势能

**重力势能**：\(E_p = mgh\)（以地面为零势能面）。

**弹性势能**：\(E_p = \frac{1}{2}kx^2\)（以弹簧原长为零势能位置）。

势能是系统共有的，不是某个物体单独拥有的。

## 保守力与非保守力

**保守力**：做功与路径无关的力（重力、弹力、静电力）。保守力做功可以用势能变化表示：\(W_c = -\Delta E_p\)。

**非保守力**：做功与路径有关的力（摩擦力、空气阻力）。非保守力做功会导致机械能与其他形式能量的转换。

## 机械能守恒

**条件**：只有保守力做功（非保守力不做功或不存在）。

**结论**：\(E_k + E_p = \text{常数}\)

即：\(\frac{1}{2}mv_1^2 + mgh_1 = \frac{1}{2}mv_2^2 + mgh_2\)

**注意**：如果有摩擦力等非保守力做功，机械能不守恒，需要用功能原理：\(W_{nc} = \Delta E_k + \Delta E_p\)。

## 常见误区

1. **机械能守恒条件误判**：认为"没有外力"就守恒。正确判断是"只有保守力做功"。例如有支持力但不做功时，机械能仍守恒。
2. **功的正负混淆**：摩擦力做负功时，\(W < 0\)，动能减少。
3. **势能参考面混淆**：势能大小依赖于零势能面的选择，但势能差与选择无关。
4. **动能定理中的功**：是合外力做的功，不是某个力的功。

## 教学提示

- 用过山车模型演示机械能守恒。
- 比较"有摩擦"和"无摩擦"两种情况，帮助学生理解守恒条件。
- 动能定理是解决力学问题的有力工具，很多用牛顿定律复杂的问题用能量方法更简单。

## 参考来源

本文为公开资料参考后的原创整理笔记。功和能内容参考 OpenStax University Physics Volume 1 Chapter 7-8。
```

- [ ] **Step 3: 编写 06_momentum_impulse.md**

文件路径：`skills/physics_mechanics/knowledge_base/06_momentum_impulse.md`

```markdown
---
subject: physics_mechanics
module: momentum_impulse
title: 动量与冲量
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 动量
  - 冲量
  - 动量定理
  - 动量守恒
  - 碰撞
  - 弹性碰撞
  - 非弹性碰撞
---

# 动量与冲量

## 动量

动量定义为质量与速度的乘积：

\[\vec{p} = m\vec{v}\]

动量是矢量，方向与速度方向相同。单位：kg·m/s。

## 冲量

冲量定义为力与作用时间的乘积：

\[\vec{I} = \vec{F} \Delta t\]

冲量是矢量，方向与力的方向相同。单位：N·s。

## 动量定理

合外力的冲量等于物体动量的变化：

\[\vec{F_{net}} \Delta t = \Delta \vec{p} = m\vec{v_f} - m\vec{v_i}\]

这是牛顿第二定律的另一种表述形式。在处理碰撞、打击等短时间作用问题时特别有用。

## 动量守恒

**条件**：系统所受合外力为零（或合外力远小于内力，可以忽略）。

**结论**：系统总动量保持不变。

\[\vec{p_1} + \vec{p_2} = \vec{p_1'} + \vec{p_2'}\]

即：\(m_1\vec{v_1} + m_2\vec{v_2} = m_1\vec{v_1'} + m_2\vec{v_2'}\)

**关键**：动量守恒是对**系统**而言的，不是对单个物体。系统内力总是成对出现（牛顿第三定律），不影响系统总动量。

## 碰撞

**弹性碰撞**：动量守恒且动能守恒。

一维弹性碰撞方程组：
- \(m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2'\)
- \(\frac{1}{2}m_1v_1^2 + \frac{1}{2}m_2v_2^2 = \frac{1}{2}m_1v_1'^2 + \frac{1}{2}m_2v_2'^2\)

**完全非弹性碰撞**：动量守恒，碰撞后两物体粘在一起运动，动能损失最大。
- \(m_1v_1 + m_2v_2 = (m_1+m_2)v'\)

**非弹性碰撞**：动量守恒，动能不守恒（部分转化为内能、声能等）。

## 爆炸与反冲

爆炸过程内力远大于外力，动量守恒。爆炸前总动量为零，爆炸后各部分动量之和仍为零（方向相反）。

反冲是爆炸的特例：物体抛出一部分质量，剩余部分获得反向速度。

## 常见误区

1. **系统选择错误**：动量守恒是对系统而言的。如果系统选择不当（遗漏了某个物体），可能误判守恒条件。
2. **合外力不为零时用守恒**：系统合外力不为零时，不能直接用动量守恒。但如果某个方向合外力为零，该方向分量守恒。
3. **混淆动量和动能**：动量是矢量，动能是标量。碰撞中动量总是守恒的，但动能不一定。
4. **忽略矢量性**：动量守恒方程是矢量方程，必须考虑方向。一维问题要规定正方向。

## 教学提示

- 用气垫导轨实验演示碰撞和动量守恒。
- 先建立"系统内力不影响总动量"的概念。
- 碰撞问题要同时考虑动量守恒和能量关系。
- 反冲运动（如火箭）是动量守恒的生动应用。

## 参考来源

本文为公开资料参考后的原创整理笔记。动量与冲量内容参考 OpenStax University Physics Volume 1 Chapter 9。
```

- [ ] **Step 4: 编写 07_simple_harmonic_motion.md**

文件路径：`skills/physics_mechanics/knowledge_base/07_simple_harmonic_motion.md`

```markdown
---
subject: physics_mechanics
module: simple_harmonic_motion
title: 简谐振动
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 简谐振动
  - 弹簧振子
  - 周期
  - 频率
  - 振幅
  - 相位
  - 能量转换
---

# 简谐振动

## 定义

物体在平衡位置附近做往复运动，如果回复力与位移成正比且方向相反，这种运动称为简谐振动。

**判据**：\(F = -kx\)

其中 \(k\) 是常数，\(x\) 是相对于平衡位置的位移。

## 弹簧振子

弹簧振子是简谐振动的理想模型。质量为 \(m\) 的物体连接在劲度系数为 \(k\) 的弹簧上，在光滑水平面上运动。

运动方程：\(x(t) = A\cos(\omega t + \phi_0)\)

其中：
- \(A\)：振幅（最大位移）
- \(\omega = \sqrt{\frac{k}{m}}\)：角频率
- \(\phi_0\)：初相位
- \(T = \frac{2\pi}{\omega} = 2\pi\sqrt{\frac{m}{k}}\)：周期
- \(f = \frac{1}{T}\)：频率

## 速度和加速度

速度：\(v(t) = -A\omega\sin(\omega t + \phi_0)\)

加速度：\(a(t) = -A\omega^2\cos(\omega t + \phi_0) = -\omega^2 x(t)\)

**关系**：
- 位移最大时，速度为零，加速度最大。
- 经过平衡位置时，速度最大，加速度为零。
- 速度与位移相位差 \(\frac{\pi}{2}\)（四分之一周期）。

## 能量转换

简谐振动中动能和势能不断转换：

- 动能：\(E_k = \frac{1}{2}mv^2 = \frac{1}{2}m\omega^2A^2\sin^2(\omega t + \phi_0)\)
- 势能：\(E_p = \frac{1}{2}kx^2 = \frac{1}{2}kA^2\cos^2(\omega t + \phi_0)\)
- 总机械能：\(E = E_k + E_p = \frac{1}{2}kA^2\)

总能量与振幅的平方成正比，与时间无关。

## 相位

相位 \(\phi = \omega t + \phi_0\) 决定了振动的状态。初相位 \(\phi_0\) 由初始条件决定。

两个同频率振动的**相位差**决定了它们的步调关系：
- 同相（相位差为 0 或 \(2\pi\) 的整数倍）：步调一致。
- 反相（相位差为 \(\pi\) 的奇数倍）：步调相反。

## 单摆

小角度摆动时，单摆近似为简谐振动：

\[T = 2\pi\sqrt{\frac{L}{g}}\]

其中 \(L\) 是摆长，\(g\) 是重力加速度。周期与振幅（小角度时）和质量无关。

## 常见误区

1. **振幅与能量混淆**：振幅是最大位移，能量与振幅平方成正比。
2. **忽略回复力条件**：不是所有往复运动都是简谐振动，只有回复力满足 \(F = -kx\) 才是。
3. **单摆周期公式条件**：\(T = 2\pi\sqrt{\frac{L}{g}}\) 只在小角度（通常 \(\theta < 10°\)）时成立。
4. **速度与位移关系**：位移最大时速度为零，但这不是"停止"——加速度最大，即将反向运动。

## 教学提示

- 用弹簧振子演示简谐振动，配合 x-t 图像。
- 可以绘制 x-t、v-t、a-t 三条曲线，展示相位关系。
- 能量转换图（动能-势能随时间变化）帮助学生理解守恒。
- 单摆实验可以同时测量重力加速度。

## 参考来源

本文为公开资料参考后的原创整理笔记。简谐振动内容参考 OpenStax University Physics Volume 1 Chapter 15 和 MIT OCW 8.03 振动部分。
```

---

### Task 4: 撰写知识库文件 — 转动、误区、题库、演示、实验（KnowledgeWriterAgent batch 3）

**Files:**
- Create: `skills/physics_mechanics/knowledge_base/08_rigid_body_rotation.md`
- Create: `skills/physics_mechanics/knowledge_base/09_common_misconceptions.md`
- Create: `skills/physics_mechanics/knowledge_base/10_problem_bank.md`
- Create: `skills/physics_mechanics/knowledge_base/11_teacher_demo_cases.md`
- Create: `skills/physics_mechanics/knowledge_base/12_experiment_guides.md`

- [ ] **Step 1: 编写 08_rigid_body_rotation.md**

文件路径：`skills/physics_mechanics/knowledge_base/08_rigid_body_rotation.md`

```markdown
---
subject: physics_mechanics
module: rigid_body_rotation
title: 刚体转动基础
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 角位移
  - 角速度
  - 角加速度
  - 转动惯量
  - 力矩
  - 转动定律
  - 角动量
---

# 刚体转动基础

## 转动运动学

**角位移**：\(\Delta\theta\)，单位 rad。

**角速度**：\(\omega = \frac{d\theta}{dt}\)，单位 rad/s。

**角加速度**：\(\alpha = \frac{d\omega}{dt}\)，单位 rad/s²。

**线量与角量关系**：
- \(s = r\theta\)
- \(v = r\omega\)
- \(a_t = r\alpha\)（切向加速度）
- \(a_n = r\omega^2\)（向心加速度）

## 转动惯量

转动惯量是物体转动惯性大小的量度：

\[I = \sum m_i r_i^2 \quad \text{或} \quad I = \int r^2 dm\]

常见物体的转动惯量（绕质心轴）：
- 细棒（绕中心）：\(I = \frac{1}{12}mL^2\)
- 圆盘/圆柱：\(I = \frac{1}{2}mR^2\)
- 细圆环：\(I = mR^2\)
- 球体：\(I = \frac{2}{5}mR^2\)

**平行轴定理**：\(I = I_{cm} + md^2\)，其中 \(d\) 是转轴到质心的距离。

## 力矩

力矩描述力使物体绕轴转动的效果：

\[\tau = rF\sin\theta = rF_\perp\]

其中 \(r\) 是力臂（转轴到力的作用线的垂直距离），\(\theta\) 是 \(\vec{r}\) 与 \(\vec{F}\) 的夹角。

力矩是矢量，方向由右手定则确定。

## 转动定律

牛顿第二定律的转动形式：

\[\tau_{net} = I\alpha\]

类比：\(\tau \leftrightarrow F\)，\(I \leftrightarrow m\)，\(\alpha \leftrightarrow a\)。

## 转动动能

\[E_k = \frac{1}{2}I\omega^2\]

类比平动动能 \(E_k = \frac{1}{2}mv^2\)。

## 角动量

角动量定义：\(L = I\omega\)

类比线动量 \(p = mv\)。

**角动量守恒**：当合外力矩为零时，角动量守恒。即 \(I\omega = \text{常数}\)。

典型应用：花样滑冰运动员收紧手臂时转速加快（\(I\) 减小，\(\omega\) 增大）。

## 常见误区

1. **平动与转动混淆**：平动用 \(F = ma\)，转动用 \(\tau = I\alpha\)，不要混用。
2. **力矩的力臂**：力臂是转轴到力的作用线的垂直距离，不是转轴到力的作用点的距离。
3. **转动惯量与质量**：转动惯量不仅取决于质量，还取决于质量分布和转轴位置。
4. **角动量守恒条件**：需要合外力矩为零，不是合外力为零。

## 教学提示

- 平动与转动的类比是教学的核心策略。
- 用转盘实验演示角动量守恒。
- 强调转动惯量依赖于转轴位置。

## 参考来源

本文为公开资料参考后的原创整理笔记。刚体转动内容参考 OpenStax University Physics Volume 1 Chapter 10-11。
```

- [ ] **Step 2: 编写 09_common_misconceptions.md**

文件路径：`skills/physics_mechanics/knowledge_base/09_common_misconceptions.md`

```markdown
---
subject: physics_mechanics
module: common_misconceptions
title: 大学物理力学常见误区
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 常见误区
  - 错因分析
  - 纠正思路
  - 物理直觉
---

# 大学物理力学常见误区

## 误区 1：斜抛最大高度公式误用

**错误说法**：斜抛运动最大高度 \(H = \frac{v_0^2}{2g}\)。

**错误原因**：把初速度 \(v_0\) 直接代入竖直上抛公式，忘记先分解速度。斜抛运动中，只有竖直分速度 \(v_0\sin\theta\) 负责竖直方向的运动。

**正确理解**：斜抛最大高度公式为 \(H = \frac{v_0^2\sin^2\theta}{2g}\)。只有当 \(\theta = 90°\)（竖直上抛）时，\(\sin\theta = 1\)，公式才简化为 \(H = \frac{v_0^2}{2g}\)。

**复习建议**：处理斜抛运动时，第一步永远是速度分解。水平和竖直方向独立分析。

## 误区 2：匀速圆周运动没有加速度

**错误说法**：物体做匀速圆周运动时速率不变，所以没有加速度。

**错误原因**：混淆了"速率不变"和"速度不变"。速度是矢量，包括大小和方向。方向变化也需要加速度。

**正确理解**：匀速圆周运动存在向心加速度 \(a_n = \frac{v^2}{r}\)，方向指向圆心。这个加速度只改变速度方向，不改变速度大小。

**复习建议**：记住加速度的定义是 \(\vec{a} = \frac{d\vec{v}}{dt}\)，\(\vec{v}\) 变化（包括方向变化）就意味着有加速度。

## 误区 3：机械能守恒条件误判

**错误说法**：物体自由下落时机械能守恒，因为只有重力作用。

**错误原因**：判断条件表述不准确。机械能守恒的条件是"只有保守力做功"，不是"只有保守力作用"。如果存在非保守力但不做功（如光滑斜面上的支持力），机械能仍守恒。

**正确理解**：判断机械能守恒要看**非保守力是否做功**，而不是看有哪些力存在。支持力垂直于运动方向不做功，不影响机械能守恒。

**复习建议**：用"做功"而非"存在"来判断守恒条件。

## 误区 4：动量守恒系统选择错误

**错误说法**：子弹射入木块的过程，子弹动量守恒。

**错误原因**：动量守恒是对**系统**而言的，不是对单个物体。单独看子弹，它受到木块的阻力，动量不守恒。

**正确理解**：子弹+木块系统在水平方向不受外力（或外力远小于内力），系统总动量守恒。单独看子弹或木块，动量都不守恒。

**复习建议**：使用动量守恒时，先明确"系统"包含哪些物体，再检查系统合外力是否为零。

## 误区 5：受力分析漏力或多画力

**错误说法**：在受力图上画了"向心力"或"下滑力"。

**错误原因**：向心力不是一种新的独立力，它是某个实际力（或合力）在指向圆心方向的分量。"下滑力"是重力沿斜面的分力，不应与重力同时画上。

**正确理解**：受力图上只画实际存在的力（重力、支持力、摩擦力、拉力等）。向心力、下滑力、合力、分力是分析工具，不是独立的力。

**复习建议**：受力分析时按"重力→弹力→摩擦力→其他接触力"的顺序逐一检查，避免遗漏或重复。

## 误区 6：向心力是独立的力

**错误说法**：物体做圆周运动是因为受到"向心力"这个力。

**错误原因**：向心力是效果力，不是性质力。它由某个实际力提供（重力、拉力、摩擦力等）。

**正确理解**：向心力是合力在圆心方向的分量。分析圆周运动时，先做受力分析找出所有实际力，再确定哪个力（或合力）提供了向心力。

**复习建议**：永远不要在受力图上画"向心力"。先画实际力，再分析合力的圆心方向分量。

## 教学建议

- 误区分析是错因诊断任务的核心内容。
- 建议收集学生的典型错误答案，作为教学案例。
- 每个误区都应包含"错误说法→错误原因→正确理解→复习建议"四部分。

## 参考来源

本文为公开资料参考后的原创整理笔记，综合整理自 OpenStax University Physics、HyperPhysics 和 MIT OCW 8.01 中的常见学生误区。
```

- [ ] **Step 3: 编写 10_problem_bank.md**

文件路径：`skills/physics_mechanics/knowledge_base/10_problem_bank.md`

```markdown
---
subject: physics_mechanics
module: problem_bank
title: 大学物理力学典型题库
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 典型题
  - 解题思路
  - 易错点
  - 斜抛运动
  - 圆周运动
  - 功和能
  - 动量守恒
---

# 大学物理力学典型题库

## 题目 1：斜抛运动基本计算

**题目**：一个小球以 \(v_0 = 20\) m/s 的初速度、\(\theta = 30°\) 的发射角斜向上抛出，忽略空气阻力，\(g = 9.8\) m/s²。求最大高度、飞行时间和水平射程。

**知识点**：斜抛运动、速度分解

**解题思路**：
1. 分解初速度：\(v_{0x} = 20\cos30° \approx 17.32\) m/s，\(v_{0y} = 20\sin30° = 10\) m/s
2. 最大高度：\(H = \frac{v_{0y}^2}{2g} = \frac{100}{19.6} \approx 5.10\) m
3. 飞行时间：\(T = \frac{2v_{0y}}{g} = \frac{20}{9.8} \approx 2.04\) s
4. 水平射程：\(R = v_{0x} \cdot T \approx 17.32 \times 2.04 \approx 35.35\) m

**标准答案**：\(H \approx 5.10\) m，\(T \approx 2.04\) s，\(R \approx 35.35\) m

**易错点**：直接用 \(H = \frac{v_0^2}{2g}\) 计算，忘记分解速度。

## 题目 2：竖直方向斜抛

**题目**：从 20 m 高的楼顶以 \(v_0 = 15\) m/s、\(\theta = 45°\) 斜向上抛出一球，求落地时的速度大小。（\(g = 10\) m/s²）

**知识点**：能量方法、斜抛运动

**解题思路**：
用机械能守恒：\(\frac{1}{2}mv_0^2 + mgh = \frac{1}{2}mv^2\)

\(v = \sqrt{v_0^2 + 2gh} = \sqrt{225 + 400} = \sqrt{625} = 25\) m/s

**标准答案**：25 m/s

**易错点**：用运动学公式分步计算容易出错，能量方法更简洁。

## 题目 3：圆周运动向心力

**题目**：一个质量为 0.5 kg 的小球用 1 m 长的绳子做匀速圆周运动，转速为 60 rpm。求绳子的拉力。

**知识点**：匀速圆周运动、向心力

**解题思路**：
1. 角速度：\(\omega = \frac{60 \times 2\pi}{60} = 2\pi\) rad/s
2. 向心力：\(F = m\omega^2 r = 0.5 \times (2\pi)^2 \times 1 \approx 19.74\) N

**标准答案**：约 19.74 N

**易错点**：转速单位 rpm 需要换算为 rad/s。

## 题目 4：竖直圆周运动

**题目**：一个质量为 \(m\) 的小球在竖直圆环内侧运动，在最高点速度为 \(v\)，圆环半径为 \(R\)。求在最高点轨道对小球的作用力。

**知识点**：竖直圆周运动、向心力

**解题思路**：
最高点：重力和轨道支持力都指向圆心。

\(N + mg = \frac{mv^2}{R}\)

\(N = \frac{mv^2}{R} - mg\)

**标准答案**：\(N = \frac{mv^2}{R} - mg\)

**易错点**：忘记重力也提供向心力，或搞错力的方向。

## 题目 5：动能定理应用

**题目**：一个 2 kg 的物体从静止开始，在 10 N 的水平力作用下沿光滑水平面运动 5 m。求物体的末速度。

**知识点**：动能定理

**解题思路**：
\(W = Fs = 10 \times 5 = 50\) J

\(W = \Delta E_k = \frac{1}{2}mv^2\)

\(v = \sqrt{\frac{2W}{m}} = \sqrt{\frac{100}{2}} = \sqrt{50} \approx 7.07\) m/s

**标准答案**：约 7.07 m/s

**易错点**：在光滑平面上不需要考虑摩擦力。

## 题目 6：机械能守恒

**题目**：一个物体从高度 \(h = 10\) m 的光滑斜面顶端由静止滑下，求到达底端时的速度。（\(g = 10\) m/s²）

**知识点**：机械能守恒

**解题思路**：
\(mgh = \frac{1}{2}mv^2\)

\(v = \sqrt{2gh} = \sqrt{200} \approx 14.14\) m/s

**标准答案**：约 14.14 m/s

**易错点**：斜面光滑时机械能守恒，有摩擦时需要用功能原理。

## 题目 7：动量守恒 — 完全非弹性碰撞

**题目**：一辆 1000 kg 的汽车以 20 m/s 的速度追尾一辆 1500 kg 的静止汽车，两车碰撞后一起运动。求碰撞后的共同速度。

**知识点**：完全非弹性碰撞、动量守恒

**解题思路**：
\(m_1v_1 = (m_1+m_2)v'\)

\(v' = \frac{m_1v_1}{m_1+m_2} = \frac{1000 \times 20}{2500} = 8\) m/s

**标准答案**：8 m/s

**易错点**：动能不守恒，不能用动能守恒方程。

## 题目 8：弹性碰撞

**题目**：质量为 \(m\) 的小球以速度 \(v_0\) 与一个静止的质量为 \(2m\) 的小球发生一维弹性碰撞。求两球碰后的速度。

**知识点**：弹性碰撞

**解题思路**：
动量守恒：\(mv_0 = mv_1' + 2mv_2'\)
动能守恒：\(\frac{1}{2}mv_0^2 = \frac{1}{2}mv_1'^2 + \frac{1}{2}(2m)v_2'^2\)

解得：\(v_1' = -\frac{v_0}{3}\)，\(v_2' = \frac{2v_0}{3}\)

**标准答案**：\(v_1' = -\frac{v_0}{3}\)（反向），\(v_2' = \frac{2v_0}{3}\)

**易错点**：碰后 \(m\) 反向运动，不能假设同向。

## 题目 9：简谐振动周期

**题目**：一个弹簧振子，弹簧劲度系数 \(k = 200\) N/m，物体质量 \(m = 0.5\) kg。求振动周期。

**知识点**：简谐振动、弹簧振子

**解题思路**：
\(T = 2\pi\sqrt{\frac{m}{k}} = 2\pi\sqrt{\frac{0.5}{200}} = 2\pi\sqrt{0.0025} = 2\pi \times 0.05 \approx 0.314\) s

**标准答案**：约 0.314 s

**易错点**：公式中是 \(m/k\) 不是 \(k/m\)。

## 题目 10：单摆测重力加速度

**题目**：用摆长 1 m 的单摆测得周期为 2.006 s，求当地重力加速度。

**知识点**：单摆、重力加速度测量

**解题思路**：
\(T = 2\pi\sqrt{\frac{L}{g}}\)

\(g = \frac{4\pi^2 L}{T^2} = \frac{4\pi^2 \times 1}{2.006^2} \approx \frac{39.48}{4.024} \approx 9.81\) m/s²

**标准答案**：约 9.81 m/s²

**易错点**：角度必须足够小（< 10°），否则不是简谐振动。

## 题目 11：转动惯量与角加速度

**题目**：一个转动惯量为 \(I = 2\) kg·m² 的飞轮受到 \(4\) N·m 的恒定力矩作用，从静止开始转动。求 3 s 后的角速度。

**知识点**：转动定律

**解题思路**：
\(\alpha = \frac{\tau}{I} = \frac{4}{2} = 2\) rad/s²

\(\omega = \alpha t = 2 \times 3 = 6\) rad/s

**标准答案**：6 rad/s

**易错点**：类比 \(F = ma\)，不要混淆平动和转动公式。

## 题目 12：角动量守恒

**题目**：一个转动惯量为 \(I_1 = 5\) kg·m²、角速度为 \(\omega_1 = 4\) rad/s 的转盘，人站在边缘向中心移动，转动惯量变为 \(I_2 = 2\) kg·m²。求新的角速度。

**知识点**：角动量守恒

**解题思路**：
\(I_1\omega_1 = I_2\omega_2\)

\(\omega_2 = \frac{I_1\omega_1}{I_2} = \frac{5 \times 4}{2} = 10\) rad/s

**标准答案**：10 rad/s

**易错点**：角动量守恒条件是合外力矩为零，不是合外力为零。

## 使用说明

以上题目覆盖大学物理力学核心知识点，可用于：
- 分步解题任务的标准示例
- 教师备课时的课堂练习
- 错因诊断时的典型错误分析

## 参考来源

本文为公开资料参考后的原创整理笔记，题目类型参考 OpenStax University Physics 课后习题和 MIT OCW 8.01 问题集的题型结构。具体数值为原创设计。
```

- [ ] **Step 4: 编写 11_teacher_demo_cases.md**

文件路径：`skills/physics_mechanics/knowledge_base/11_teacher_demo_cases.md`

```markdown
---
subject: physics_mechanics
module: teacher_demo_cases
title: 教师课堂演示案例
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 课堂演示
  - 教学设计
  - 互动提问
  - 可视化参数
  - 课后练习
---

# 教师课堂演示案例

## 案例 1：斜抛运动轨迹演示

**主题**：斜抛运动最大高度与水平射程

**教学目标**：
- 理解斜抛运动的速度分解方法
- 掌握最大高度和水平射程公式
- 了解发射角对轨迹的影响

**课堂导入**：
「同学们见过篮球投篮吗？球在空中的轨迹是什么形状？为什么有时候投得很高的球反而投不远？」

**演示步骤**：
1. 先展示 45° 发射角的轨迹（射程最大）。
2. 逐步改变发射角（30°、60°、90°），观察轨迹变化。
3. 固定发射角，改变初速度，观察轨迹变化。
4. 引导学生发现：相同初速度下，45° 射程最大；30° 和 60° 射程相同。

**可视化参数**：
- 默认：\(v_0 = 20\) m/s，\(\theta = 30°\)，\(g = 9.8\) m/s²
- 对比：\(\theta = 45°\)、\(60°\)、\(90°\)

**互动提问**：
1. 「最大高度公式中的 \(v_0\) 是总速度还是竖直分速度？」
2. 「如果考虑空气阻力，轨迹会怎样变化？」
3. 「为什么 30° 和 60° 的射程相同？」

**课后练习**：
计算 \(v_0 = 25\) m/s、\(\theta = 40°\) 时的最大高度和水平射程。

## 案例 2：圆周运动向心力演示

**主题**：匀速圆周运动与向心力

**教学目标**：
- 理解向心加速度的物理意义
- 掌握向心力的来源分析
- 认识"向心力不是独立的力"

**课堂导入**：
「汽车过弯道时，是什么力让它转弯？如果路面结冰了会怎样？」

**演示步骤**：
1. 展示匀速圆周运动动画，标注速度方向（切线）和加速度方向（圆心）。
2. 分析不同场景的向心力来源：绳子拉力、摩擦力、重力分量。
3. 模拟"绳子断裂"——物体沿切线飞出。
4. 强调：向心力消失后，物体不是沿半径飞出，而是沿切线飞出。

**可视化参数**：
- 圆周运动：半径 \(r = 1\) m，速率 \(v = 2\) m/s
- 向心加速度：\(a_n = \frac{v^2}{r} = 4\) m/s²

**互动提问**：
1. 「匀速圆周运动有加速度吗？为什么？」
2. 「向心力是哪种力？在绳子拉小球的例子中，向心力是什么？」
3. 「如果绳子突然断裂，小球会怎样运动？」

**课后练习**：
分析汽车在倾斜弯道上的受力，确定向心力来源。

## 案例 3：机械能守恒演示

**主题**：机械能守恒条件与应用

**教学目标**：
- 理解机械能守恒的条件
- 掌握用能量方法分析运动
- 区分保守力和非保守力

**课堂导入**：
「过山车在最高点和最低点的速度一样吗？能量去了哪里？」

**演示步骤**：
1. 展示无摩擦过山车模型：最高点势能最大、动能最小；最低点相反。
2. 添加摩擦力，观察能量变化——总机械能减少。
3. 用能量条形图展示动能和势能的转换。
4. 对比"有摩擦"和"无摩擦"两种情况。

**可视化参数**：
- 过山车高度：\(h_1 = 20\) m，\(h_2 = 5\) m
- 初始速度：\(v_0 = 0\)
- 无摩擦：\(v_2 = \sqrt{2g(h_1-h_2)} = \sqrt{2 \times 9.8 \times 15} \approx 17.15\) m/s

**互动提问**：
1. 「如果有摩擦力，到达最低点的速度会比计算值大还是小？」
2. 「支持力做功吗？它影响机械能守恒吗？」
3. 「机械能守恒和能量守恒有什么区别？」

**课后练习**：
计算有摩擦力时的末速度（给定摩擦系数和路径长度）。

## 案例 4：动量守恒碰撞演示

**主题**：碰撞与动量守恒

**教学目标**：
- 理解动量守恒的条件
- 区分弹性碰撞和非弹性碰撞
- 掌握碰撞问题的分析方法

**课堂导入**：
「台球碰撞后为什么会分开？车祸碰撞后为什么会粘在一起？」

**演示步骤**：
1. 弹性碰撞演示：两个等质量小球，一个静止，碰撞后速度交换。
2. 完全非弹性碰撞：两球碰撞后粘在一起。
3. 分析碰撞前后动能变化。
4. 引导学生发现：弹性碰撞动能守恒，非弹性碰撞动能不守恒但动量守恒。

**可视化参数**：
- 弹性碰撞：\(m_1 = m_2 = 1\) kg，\(v_1 = 3\) m/s，\(v_2 = 0\)
- 碰后：\(v_1' = 0\)，\(v_2' = 3\) m/s

**互动提问**：
1. 「动量守恒的条件是什么？碰撞过程中满足吗？」
2. 「动能在碰撞中守恒吗？不一定守恒时能量去了哪里？」
3. 「如果两球质量不同，碰后速度会怎样？」

**课后练习**：
计算不等质量弹性碰撞的碰后速度。

## 案例 5：简谐振动能量演示

**主题**：简谐振动中的能量转换

**教学目标**：
- 理解简谐振动中动能和势能的转换
- 掌握总能量与振幅的关系
- 了解阻尼振动中的能量耗散

**课堂导入**：
「弹簧振子在最远端和中间位置，哪个位置速度最大？哪个位置加速度最大？」

**演示步骤**：
1. 展示弹簧振子动画，同时绘制 x-t、v-t、a-t 曲线。
2. 用能量条形图展示动能和势能随时间的变化。
3. 改变振幅，观察能量变化。
4. 添加阻尼，观察振幅衰减和能量耗散。

**可视化参数**：
- \(k = 100\) N/m，\(m = 0.25\) kg
- \(A = 0.1\) m
- \(T = 2\pi\sqrt{\frac{0.25}{100}} \approx 0.314\) s
- \(E = \frac{1}{2}kA^2 = 0.5\) J

**互动提问**：
1. 「振子经过平衡位置时，加速度是多少？」
2. 「振幅加倍，总能量变为原来的几倍？」
3. 「如果没有阻尼，振动会永远持续吗？」

**课后练习**：
计算振子在不同位置的动能和势能。

## 案例 6：角动量守恒演示

**主题**：角动量守恒与转动

**教学目标**：
- 理解角动量守恒的条件
- 掌握转动惯量变化对角速度的影响
- 了解角动量守恒的实际应用

**课堂导入**：
「花样滑冰运动员收紧手臂为什么转得更快？」

**演示步骤**：
1. 展示转盘上的人收紧手臂时转速加快的动画。
2. 定量分析：\(I_1\omega_1 = I_2\omega_2\)。
3. 计算转动惯量变化前后的角速度。
4. 扩展到天体运动：行星绕太阳的角动量守恒。

**可视化参数**：
- 初始：\(I_1 = 5\) kg·m²，\(\omega_1 = 2\) rad/s
- 收紧后：\(I_2 = 2\) kg·m²
- 新角速度：\(\omega_2 = \frac{5 \times 2}{2} = 5\) rad/s

**互动提问**：
1. 「收紧手臂时，人的动能变化了吗？增加了还是减少了？」
2. 「角动量守恒和动量守恒的条件有什么不同？」
3. 「地球绕太阳运动，近日点和远日点哪个角速度大？」

**课后练习**：
计算行星在近日点和远日点的角速度比。

## 使用说明

以上案例可用于教师备课任务，每个案例包含完整的教学设计要素。教师可以根据课堂实际情况调整参数和提问。

## 参考来源

本文为公开资料参考后的原创整理笔记。教学案例设计参考 MIT OCW 8.01 课堂演示和 OpenStax University Physics 教学建议。
```

- [ ] **Step 5: 编写 12_experiment_guides.md**

文件路径：`skills/physics_mechanics/knowledge_base/12_experiment_guides.md`

```markdown
---
subject: physics_mechanics
module: experiment_guides
title: 大学物理力学实验指导
type: course_note
source_type: local_synthesized_note
version: v1
updated_at: 2026-05-28
keywords:
  - 实验指导
  - 重力加速度
  - 机械能守恒
  - 单摆
  - 碰撞
  - 弹簧振子
  - 误差分析
---

# 大学物理力学实验指导

## 实验 1：自由落体法测量重力加速度

**实验目的**：
- 学习使用自由落体仪测量重力加速度
- 掌握逐差法处理数据

**实验原理**：
自由落体运动：\(h = \frac{1}{2}gt^2\)

通过测量不同高度 \(h\) 对应的下落时间 \(t\)，拟合 \(h-t^2\) 关系，斜率为 \(\frac{g}{2}\)。

**主要变量**：
- 自变量：下落高度 \(h\)（m）
- 因变量：下落时间 \(t\)（s）
- 控制变量：释放方式、空气阻力

**数据记录建议**：
| 次数 | 高度 h (m) | 时间 t (s) | t² (s²) |
|------|-----------|-----------|---------|
| 1 | 0.50 | | |
| 2 | 0.75 | | |
| 3 | 1.00 | | |
| 4 | 1.25 | | |
| 5 | 1.50 | | |

**误差来源**：
- 计时器精度
- 释放时的初速度不为零
- 空气阻力
- 测量高度的误差

**可视化建议**：
绘制 \(h-t^2\) 散点图，拟合直线，从斜率计算 \(g\)。

## 实验 2：验证机械能守恒

**实验目的**：
- 验证只有保守力做功时机械能守恒
- 学习使用光电门测量速度

**实验原理**：
物体从高度 \(h\) 处由静止释放，到达底端时速度 \(v\)。

若机械能守恒：\(mgh = \frac{1}{2}mv^2\)，即 \(v^2 = 2gh\)。

**主要变量**：
- 自变量：释放高度 \(h\)（m）
- 因变量：底端速度 \(v\)（m/s）
- 控制变量：斜面光滑度、物体质量

**数据记录建议**：
| 次数 | 高度 h (m) | 速度 v (m/s) | v² (m²/s²) |
|------|-----------|-------------|------------|
| 1 | 0.10 | | |
| 2 | 0.20 | | |
| 3 | 0.30 | | |
| 4 | 0.40 | | |
| 5 | 0.50 | | |

**误差来源**：
- 摩擦力做功
- 光电门精度
- 空气阻力
- 斜面不光滑

**可视化建议**：
绘制 \(v^2-h\) 散点图，验证线性关系，斜率应接近 \(2g\)。

## 实验 3：单摆测量重力加速度

**实验目的**：
- 学习使用单摆测量重力加速度
- 理解简谐振动的条件

**实验原理**：
小角度摆动时，单摆周期：\(T = 2\pi\sqrt{\frac{L}{g}}\)

解得：\(g = \frac{4\pi^2 L}{T^2}\)

**主要变量**：
- 自变量：摆长 \(L\)（m）
- 因变量：周期 \(T\)（s）
- 控制变量：摆角（< 10°）、空气阻力

**数据记录建议**：
| 次数 | 摆长 L (m) | 20 次时间 (s) | 周期 T (s) | T² (s²) |
|------|-----------|-------------|-----------|---------|
| 1 | 0.50 | | | |
| 2 | 0.75 | | | |
| 3 | 1.00 | | | |
| 4 | 1.25 | | | |
| 5 | 1.50 | | | |

**误差来源**：
- 摆角过大（不满足小角度近似）
- 摆长测量不准确（应从悬挂点到球心）
- 计时误差
- 空气阻力

**可视化建议**：
绘制 \(T^2-L\) 散点图，斜率应为 \(\frac{4\pi^2}{g}\)。

## 实验 4：碰撞与动量守恒

**实验目的**：
- 验证碰撞过程中动量守恒
- 区分弹性碰撞和非弹性碰撞

**实验原理**：
两物体碰撞：\(m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2'\)

使用气垫导轨和光电门测量碰撞前后的速度。

**主要变量**：
- 自变量：碰撞前速度
- 因变量：碰撞后速度
- 控制变量：物体质量、碰撞类型

**数据记录建议**：
| 次数 | m₁ (kg) | v₁ (m/s) | m₂ (kg) | v₂ (m/s) | v₁' (m/s) | v₂' (m/s) |
|------|---------|---------|---------|---------|----------|----------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

**误差来源**：
- 气垫导轨不水平
- 光电门精度
- 摩擦力
- 碰撞不是严格一维

**可视化建议**：
比较碰撞前后总动量，计算动量损失百分比。

## 实验 5：弹簧振子简谐运动

**实验目的**：
- 验证弹簧振子的周期公式
- 测量弹簧劲度系数

**实验原理**：
弹簧振子周期：\(T = 2\pi\sqrt{\frac{m}{k}}\)

通过改变质量 \(m\) 测量周期 \(T\)，拟合 \(T^2-m\) 关系。

**主要变量**：
- 自变量：振子质量 \(m\)（kg）
- 因变量：周期 \(T\)（s）
- 控制变量：弹簧劲度系数、振幅

**数据记录建议**：
| 次数 | 质量 m (kg) | 20 次时间 (s) | 周期 T (s) | T² (s²) |
|------|-----------|-------------|-----------|---------|
| 1 | 0.05 | | | |
| 2 | 0.10 | | | |
| 3 | 0.15 | | | |
| 4 | 0.20 | | | |
| 5 | 0.25 | | | |

**误差来源**：
- 弹簧质量未忽略
- 振幅过大（非简谐振动）
- 计时误差
- 空气阻力

**可视化建议**：
绘制 \(T^2-m\) 散点图，斜率应为 \(\frac{4\pi^2}{k}\)。

## 使用说明

以上实验指导可用于教师备课时的实验设计参考。每个实验包含完整的设计要素，教师可以根据实验室条件调整方案。

## 参考来源

本文为公开资料参考后的原创整理笔记。实验设计参考 OpenStax University Physics 实验手册和常见大学物理实验教材的实验方案。
```

---

### Task 5: 合规审查（ComplianceReviewAgent）

**Files:**
- Read all 13 knowledge base files
- Modify: files if compliance issues found

- [ ] **Step 1: 审查所有知识库文件**

逐个检查以下合规项：

1. 没有复制外部来源大段原文
2. 没有把网络资料写成本地课程资料
3. 每个文件有来源说明
4. 没有伪造来源 URL
5. 没有伪造测试结果、用户反馈、截图、响应时间
6. `source_type` 标记为 `local_synthesized_note`
7. YAML frontmatter 完整

- [ ] **Step 2: 修复发现的问题**

如果发现任何合规问题：
- 删除或改写复制的内容
- 修正来源标注
- 补充缺失的 frontmatter

- [ ] **Step 3: 生成合规报告**

在每个文件中确认：
- ✅ 原创整理，未复制原文
- ✅ 来源说明完整
- ✅ 无伪造数据
- ✅ source_type 正确

---

### Task 6: RAG 入库（RagIngestionAgent）

**Files:**
- Run: `npm run rag:ingest -- --subject physics_mechanics`

- [ ] **Step 1: 确认 ingest 脚本存在**

Run: `ls scripts/ingest_knowledge.ts`
Expected: file exists

- [ ] **Step 2: 运行 ingest 命令**

Run: `npm run rag:ingest -- --subject physics_mechanics`
Expected: Successfully indexed 13 files, generated manifest

- [ ] **Step 3: 验证 manifest 生成**

Run: `cat .stemotion/vector-store/physics_mechanics.manifest.json`
Expected: JSON with file_count, chunk_count, indexed = true

- [ ] **Step 4: 如果 ingest 失败，修复轻量问题**

如果报错，检查：
- 文件路径是否正确
- YAML frontmatter 格式是否正确
- 文件编码是否为 UTF-8

不要重构 RAG 系统，只修复知识库文件本身的问题。

---

### Task 7: 检索验证与文档更新（RagValidationAgent）

**Files:**
- Create: `docs/evaluation/knowledge_base_validation.md`
- Modify: `README.md`
- Modify: `docs/evaluation/test_cases.md`

- [ ] **Step 1: 运行测试查询**

逐个运行以下命令并记录结果：

```bash
npm run rag:query -- --subject physics_mechanics --question "斜抛运动最大高度公式是什么"
```
预期命中：02_projectile_motion.md, 10_problem_bank.md, 09_common_misconceptions.md

```bash
npm run rag:query -- --subject physics_mechanics --question "为什么匀速圆周运动有加速度"
```
预期命中：04_circular_motion.md, 09_common_misconceptions.md

```bash
npm run rag:query -- --subject physics_mechanics --question "机械能守恒的条件是什么"
```
预期命中：05_work_energy.md, 09_common_misconceptions.md

```bash
npm run rag:query -- --subject physics_mechanics --question "动量守恒适用条件是什么"
```
预期命中：06_momentum_impulse.md, 09_common_misconceptions.md

```bash
npm run rag:query -- --subject physics_mechanics --question "请为斜抛运动设计课堂演示"
```
预期命中：11_teacher_demo_cases.md, 02_projectile_motion.md

- [ ] **Step 2: 创建验证报告**

文件路径：`docs/evaluation/knowledge_base_validation.md`

```markdown
# 大学物理力学知识库验证报告

## 知识库文件清单

| 序号 | 文件名 | 知识模块 | 字数(约) |
|------|--------|---------|---------|
| 1 | 00_physics_mechanics_overview.md | 力学知识体系概览 | |
| 2 | 01_kinematics_basics.md | 运动学基础 | |
| 3 | 02_projectile_motion.md | 斜抛运动 | |
| 4 | 03_newton_laws.md | 牛顿运动定律 | |
| 5 | 04_circular_motion.md | 圆周运动 | |
| 6 | 05_work_energy.md | 功和能 | |
| 7 | 06_momentum_impulse.md | 动量与冲量 | |
| 8 | 07_simple_harmonic_motion.md | 简谐振动 | |
| 9 | 08_rigid_body_rotation.md | 刚体转动基础 | |
| 10 | 09_common_misconceptions.md | 常见误区汇总 | |
| 11 | 10_problem_bank.md | 典型题库 | |
| 12 | 11_teacher_demo_cases.md | 教师演示案例 | |
| 13 | 12_experiment_guides.md | 实验指导 | |

## Ingest 结果

- file_count: 待填写
- chunk_count: 待填写
- indexed: 待填写
- manifest 路径: .stemotion/vector-store/physics_mechanics.manifest.json

## 测试查询结果

### 查询 1：斜抛运动最大高度公式是什么

- 预期命中：02_projectile_motion.md, 10_problem_bank.md, 09_common_misconceptions.md
- 实际命中：待填写
- citation 返回：待填写

### 查询 2：为什么匀速圆周运动有加速度

- 预期命中：04_circular_motion.md, 09_common_misconceptions.md
- 实际命中：待填写
- citation 返回：待填写

### 查询 3：机械能守恒的条件是什么

- 预期命中：05_work_energy.md, 09_common_misconceptions.md
- 实际命中：待填写
- citation 返回：待填写

### 查询 4：动量守恒适用条件是什么

- 预期命中：06_momentum_impulse.md, 09_common_misconceptions.md
- 实际命中：待填写
- citation 返回：待填写

### 查询 5：请为斜抛运动设计课堂演示

- 预期命中：11_teacher_demo_cases.md, 02_projectile_motion.md
- 实际命中：待填写
- citation 返回：待填写

## 问题与改进

待填写
```

- [ ] **Step 3: 更新 README.md**

在 README.md 的"评委快速入口"部分之后添加知识库覆盖说明：

```markdown
## 大学物理力学知识库 v1

知识库覆盖以下模块：

| 模块 | 文件 |
|------|------|
| 力学概览 | 00_physics_mechanics_overview.md |
| 运动学基础 | 01_kinematics_basics.md |
| 斜抛运动 | 02_projectile_motion.md |
| 牛顿运动定律 | 03_newton_laws.md |
| 圆周运动 | 04_circular_motion.md |
| 功和能 | 05_work_energy.md |
| 动量与冲量 | 06_momentum_impulse.md |
| 简谐振动 | 07_simple_harmonic_motion.md |
| 刚体转动 | 08_rigid_body_rotation.md |
| 常见误区 | 09_common_misconceptions.md |
| 典型题库 | 10_problem_bank.md |
| 教师演示 | 11_teacher_demo_cases.md |
| 实验指导 | 12_experiment_guides.md |

构建和验证命令：

```bash
npm run rag:ingest -- --subject physics_mechanics
npm run rag:query -- --subject physics_mechanics --question "斜抛运动最大高度公式是什么"
```
```

- [ ] **Step 4: 更新 docs/evaluation/test_cases.md**

在 test_cases.md 中添加说明：

```markdown
## 知识库 v1 覆盖说明

当前知识库 v1 已覆盖运动学、斜抛运动、牛顿定律、圆周运动、功和能、动量、简谐振动、刚体转动、常见误区、典型题库、教师演示和实验指导共 13 个模块。典型测试案例应优先使用本地知识库验证。
```

- [ ] **Step 5: 运行工程检查**

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

如果有 `npm test`，也运行。预期全部通过（知识库文件是 Markdown，不影响代码编译）。

---

## 不改动的内容

- 后端 API（`/api/v1/rag/ask`、`/api/rag/ask`）
- `rag_pipeline.ts` 逻辑
- `retriever.ts` 索引逻辑
- `vector_store.ts` 检索逻辑
- deep-interaction 流程
- `/rag` 页面 UI 组件
- `skill.yaml` 配置（已经包含正确的检索参数）
- `system_prompt.md` 和 `answer_template.md`

---

## 验证清单

1. `skills/physics_mechanics/knowledge_base/` 包含 13 个 `.md` 文件
2. 每个文件包含 YAML frontmatter（subject, module, title, type, source_type, version, updated_at, keywords）
3. 每个文件 600-1500 中文字
4. 每个文件包含公式、常见误区、教学提示、来源说明
5. `npm run rag:ingest -- --subject physics_mechanics` 成功
6. `npm run rag:query` 能返回相关 citation
7. `docs/knowledge_sources.md` 包含来源登记
8. `docs/evaluation/knowledge_base_validation.md` 包含验证结果
9. README.md 包含知识库覆盖说明
10. `npm run lint && npm run typecheck && npm run build` 通过
