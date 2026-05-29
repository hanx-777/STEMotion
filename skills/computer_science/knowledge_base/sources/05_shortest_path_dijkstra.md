# 最短路径与 Dijkstra 算法

## 问题定义

给定带权有向图（或无向图）和源点 s，求 s 到所有其他顶点的最短路径距离。边权必须非负。

## Dijkstra 算法

贪心策略：每次选择距离源点最近的未访问顶点，用它更新邻居的距离。

算法流程：
1. 初始化：dist[s] = 0，其余 dist[v] = \(\infty\)。
2. 重复 n 次：
   a. 在未访问顶点中选择 dist 最小的顶点 u。
   b. 标记 u 为已访问。
   c. 对 u 的每个邻居 v，若 dist[u] + w(u,v) < dist[v]，则更新 dist[v]。

时间复杂度：
- 朴素实现：\(O(V^2)\)，适合稠密图。
- 优先队列实现：\(O((V+E)\log V)\)，适合稀疏图。

## 优先队列实现

使用最小堆（C++ `std::priority_queue` 配合 `std::greater`）：

```cpp
// dist, graph 已初始化
priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
pq.push({0, s});
while (!pq.empty()) {
    auto [d, u] = pq.top(); pq.pop();
    if (d > dist[u]) continue; // 懒删除
    for (auto [v, w] : graph[u]) {
        if (dist[u] + w < dist[v]) {
            dist[v] = dist[u] + w;
            pq.push({dist[v], v});
        }
    }
}
```

## 常见错误

**错误一：优先队列使用错误。** C++ 默认 `priority_queue` 是最大堆，需要配 `greater<>` 才是最小堆。

**错误二：忘记懒删除。** 同一顶点可能被多次推入优先队列（不同距离），需要在弹出时检查是否为最新距离。

**错误三：用于负权边。** Dijkstra 不能处理负权边，应使用 Bellman-Ford 算法。

## 与其他算法对比

| 算法 | 适用场景 | 时间复杂度 |
|------|---------|-----------|
| Dijkstra | 非负权图 | \(O((V+E)\log V)\) |
| Bellman-Ford | 可有负权边 | \(O(VE)\) |
| Floyd-Warshall | 所有顶点对 | \(O(V^3)\) |

## 参考来源与整理说明

本文为程序设计与数据结构课程的原创整理笔记，覆盖 Dijkstra 算法的原理、实现和常见错误。
