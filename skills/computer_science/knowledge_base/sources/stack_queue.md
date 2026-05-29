# 栈与队列基础

栈是一种后进先出的数据结构，常见操作包括 push、pop、top 和 empty。栈常用于函数调用、表达式求值、括号匹配和深度优先搜索。

队列是一种先进先出的数据结构，常见操作包括 enqueue、dequeue、front 和 empty。队列常用于广度优先搜索、任务调度和缓冲区管理。

使用 C++ 标准库时，`std::stack` 默认提供 `push`、`pop`、`top` 和 `empty`，但不支持随机访问。`std::queue` 提供 `push`、`pop`、`front` 和 `empty`，同样不支持随机访问。

常见代码错误包括：在空栈上调用 `top` 或 `pop`；在空队列上调用 `front` 或 `pop`；把栈和队列的出入顺序混淆；没有为边界输入设计测试用例。
