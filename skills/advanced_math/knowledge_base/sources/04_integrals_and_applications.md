# 积分与应用

## 不定积分

不定积分是求导的逆运算：
\[
\int f(x) \, dx = F(x) + C
\]

其中 \(F'(x) = f(x)\)，\(C\) 为积分常数。

## 基本积分公式

\[
\int x^n \, dx = \frac{x^{n+1}}{n+1} + C \quad (n \neq -1)
\]

\[
\int \frac{1}{x} \, dx = \ln|x| + C, \quad \int e^x \, dx = e^x + C
\]

\[
\int \sin x \, dx = -\cos x + C, \quad \int \cos x \, dx = \sin x + C
\]

## 定积分

\[
\int_a^b f(x) \, dx = F(b) - F(a)
\]

几何意义：曲线 \(y = f(x)\) 与 x 轴之间的代数面积。

## 积分方法

换元法：\(\int f(g(x))g'(x) \, dx = \int f(u) \, du\)。
分部积分：\(\int u \, dv = uv - \int v \, du\)。

## 应用

面积：\(A = \int_a^b |f(x) - g(x)| \, dx\)
体积（旋转体）：\(V = \pi \int_a^b [f(x)]^2 \, dx\)
弧长：\(L = \int_a^b \sqrt{1 + [f'(x)]^2} \, dx\)

## 常见误区

- 忘记不定积分中的常数 \(C\)。
- 在定积分换元时忘记改变积分限。
- 使用分部积分时 \(u\) 和 \(dv\) 选择不当导致更复杂。

## 参考来源与整理说明

本文为高等数学课程的原创整理笔记，覆盖不定积分、定积分及其应用。
