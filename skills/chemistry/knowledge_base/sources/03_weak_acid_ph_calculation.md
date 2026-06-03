# 弱酸 pH 计算

## 电离平衡模型

弱酸 HA 初始浓度为 \(C_0\)，电离度为 \(\alpha\)：

\[
HA \rightleftharpoons H^+ + A^-
\]

平衡时：\([HA] = C_0(1-\alpha)\)，\([H^+] = [A^-] = C_0\alpha\)。

\[
K_a = \frac{(C_0\alpha)^2}{C_0(1-\alpha)} = \frac{C_0\alpha^2}{1-\alpha}
\]

## 近似条件

当 \(C_0 / K_a \geq 100\)（即 \(\alpha < 5\%\)）时，可近似 \(1-\alpha \approx 1\)：

\[
K_a \approx C_0\alpha^2, \quad \alpha \approx \sqrt{\frac{K_a}{C_0}}
\]

\[
[H^+] = C_0\alpha \approx \sqrt{K_a \cdot C_0}
\]

\[
pH \approx \frac{1}{2}(pK_a - \log C_0)
\]

## 计算示例

\(C_0 = 0.10\,\text{mol/L}\)，\(K_a = 1.8 \times 10^{-5}\)：

\(C_0/K_a = 0.10/(1.8\times10^{-5}) = 5556 \gg 100\)，近似成立。

\[
[H^+] = \sqrt{1.8\times10^{-5} \times 0.10} = \sqrt{1.8\times10^{-6}} = 1.34\times10^{-3}\,\text{mol/L}
\]

\[
pH = -\log(1.34\times10^{-3}) \approx 2.87
\]

验证：\(\alpha = 1.34\times10^{-3}/0.10 = 1.34\% < 5\%\)，近似有效。

## 稀释对电离度和平衡位置的影响

稀释弱酸（减小 \(C_0\)）：
- 电离度 \(\alpha\) 增大（越稀越电离）。
- \([H^+]\) 减小（pH 增大）。
- 平衡正移（向电离方向移动）。
- \(K_a\) 不变（只与温度有关）。

## 常见误区

- 不检查近似条件就直接使用简化公式。
- 认为稀释后 \([H^+]\) 不变。
- 混淆电离度和浓度的变化方向。

## 参考来源与整理说明

本文为大学化学课程的原创整理笔记，覆盖弱酸 pH 计算的完整流程和近似条件判断。
