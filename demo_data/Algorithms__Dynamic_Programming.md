# Algorithms — Dynamic Programming

**Dynamic programming (DP)** solves a problem by combining solutions to
overlapping subproblems. It applies when a problem has two properties:

- **Optimal substructure** — an optimal solution is built from optimal solutions
  to its subproblems.
- **Overlapping subproblems** — the same subproblem recurs many times, so its
  result is worth caching.

## Two ways to implement it

**Top-down memoization** keeps the natural recursion and stores each computed
result in a table (a memo), so a repeated subproblem is answered from the cache
instead of recomputed. **Bottom-up tabulation** fills a table iteratively,
starting from the base cases and building up to the final answer, avoiding
recursion overhead.

Both turn exponential brute-force recursions into polynomial-time algorithms.

## Worked example: 0/1 Knapsack

Given item weights `wt[]` and values `val[]` with capacity `W`, define
`dp[i][w]` as the best value using the first `i` items with capacity `w`:

```
dp[i][w] = max(dp[i-1][w], val[i-1] + dp[i-1][w - wt[i-1]])
```

Each item is either skipped (`dp[i-1][w]`) or taken. The result is
`dp[n][W]` and the running time is **O(n·W)** — pseudo-polynomial, because it
scales with the numeric value of `W` rather than its bit-length.
