This is a simple CRDT implementation for the CRDT I want to efficiently
implement in rust. This implementation is intentionally *not* optimized.
The goal is to have some simple code that I can use to clarify semantics
and as a basis for fuzz testing the faster implementation.

This is based on automerge, but with some small changes:

- The actor's sequence numbers are monotonically increasing, not
  linearly increasing. This allows transactions to modify multiple
  documents
- There aren'

For now this is just a CRDT implementation of a list / string (list of
unicode codepoints). At some point I might add more data types here, but
a list is always the baseline for this stuff.

### Terminology

An operation is the smallest unit of change. For now operations are either

- Insert a single item, or
- Delete a single item

Operations are always grouped together in *transactions*. All operations
within a transaction are applied atomically.


### Versions

Everything is versioned using *(agent_id, seq)* tuple pairs:

- Each transaction is assigned a version, which acts as the base for all inserts within that transaction.
- All inserts within the transaction use the next sequence number.

Eg:

```javascript
{
  agent: 'abc',
  seq: 10,
  ops: [{
    type: 'insert', // <-- This insert is ('abc', 10)
    content: 'x',
  }, {
    type: 'delete', // <-- deletes don't bump the version
  }, {
    type: 'insert', // <-- This insert is ('abc', 11)
    content: 'y',
  }]
}
```

Given this, the next available sequence number for transactions from
agent 'abc' is *('abc', 12)*.

Some notes here:

- Deletes do not consume sequence numbers
- Each transaction bumps the sequence number base, even if the previous
  transaction only contains deletes. Ie, each transaction has `seq = max(prev_txn.seq + 1, prev_txn.ops.last.seq + 1)`


### Data model

The document itself is stored in two structures:

1. Per agent txn lists. For each agent we store a list of all transactions by that agent
2. We also store the tree of operations in the document

Each insert in the agent-txn list also stores a reference to the operation in the tree.