# 转动运动学

## 角量描述

角位移 \(\theta\)（rad），角速度 \(\omega = d\theta/dt\)（rad/s），角加速度 \(\beta = d\omega/dt\)（rad/s\(^2\)）。

线量与角量的关系：
\[
s = r\theta, \quad v = r\omega, \quad a_t = r\beta
\]

其中 \(r\) 为半径，\(s\) 为弧长，\(v\) 为线速度，\(a_t\) 为切向加速度。

## 匀变速转动

\[
\omega = \omega_0 + \beta t
\]

\[
\theta = \theta_0 + \omega_0 t + \frac{1}{2}\beta t^2
\]

\[
\omega^2 = \omega_0^2 + 2\beta(\theta - \theta_0)
\]

形式与匀变速直线运动完全类似，对应关系：\(x \leftrightarrow \theta\)，\(v \leftrightarrow \omega\)，\(a \leftrightarrow \beta\)。

## 转动惯量

转动惯量是物体转动惯性大小的量度：
\[
I = \sum m_i r_i^2 \quad \text{（离散质点）}
\]

\[
I = \int r^2 \, dm \quad \text{（连续体）}
\]

平行轴定理：\(I = I_c + Md^2\)，其中 \(I_c\) 为过质心轴的转动惯量，\(d\) 为两轴间距。

## 常见误区

- 混淆角速度和线速度的物理意义。
- 忘记转动惯量取决于转轴位置。
- 在使用平行轴定理时，\(I_c\) 必须是过质心轴的转动惯量。

## 参考来源与整理说明

本文为大学物理力学课程的原创整理笔记，覆盖转动运动学基本量和转动惯量。
