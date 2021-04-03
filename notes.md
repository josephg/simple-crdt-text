# Note about extra fields

So all transactions have two "bonus" fields:

- Order
- run

These fields are local only, and used to optimize certain operations.

Order is a incrementing integer, incremented with each operation seen at this peer when the operation is locally applied.

If a.order > b.order, either a > b or a || b. It is impossible for a.order > b.order and a < b.

Order works great for evaluating concurrency for near operations - like, if a and b are close, order helps us evaluate the relationship between a and b.

For far comparisons (like when inserting a sibling into a list), we are still left with a linear comparison scan. There's a couple ways I can think of to speed that up.

Some ideas:

1. Store a pair of fields on each operation marking how many operations down it dominates. So given this:

```
  5
 / \
4  |
|  |
3  |
|  2
 \ /
  1
  |
  0
```

We can see that operations 5, 2, 1 and 0 dominate everything below them. Operations 3 and 4 dominate everything down to order 3. And symmetrically, operations 0, 1, 3, 4 and 5 dominate everything above them. Operation 2 only dominates up to order 2 (itself).


2. Run length encode operations with a single parent.

Most operations only have one parent. When scanning operations, if an operation only has one parent, skip directly from it to the next operation with only one parent.

The downside of this is that its impossible to tell these situations apart when comparing 3 and 2:

```
3
|  2
 \ /
  1
```

and

```
  3
  |
  2
  |
  1
```

... Though it could still result in some decent performance gains. A partial solution might be to just only run length encode sets of transactions which have exactly one parent and exactly one child.


3. A variant on the run length encoding idea would be to encode transactions into blocks. Each block contains a set of transactions where all transactions except the first contain exactly one parent (or the first is the root), and all transactions except the last have exactly one child. Each txn then contains a tuple of (order, blockIdx). This would massively collapse the DAG, since almost all operations have no concurrency. Blocks can mix users' edits.

This would yield a large constant time speed improvement.

The downside of this is that if we later discover a new operation where the parent is an item inside the block, the whole block will need to be split. Worse, subsequent blocks may need new order numbers.

---

These optimizations add extra storage requirements and will make writes slightly slower. I don't know if the extra complexity is worth it. We'll have to benchmark to figure that out.

I think for now I'll just implement (1) since thats simple.