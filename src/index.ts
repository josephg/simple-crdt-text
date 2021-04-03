import assert from 'assert'
import bs from 'binary-search'
import Map2 from 'map2'
import {Id, Txn, Op, InsertOp, ROOT_ID, DocTreeItem} from './types'

export {Id, ROOT_ID, InsertOp, Op, Txn} from './types'

type LocalTxn<Item> = Txn<Item> & {
  order: number
  /**
   *
   * -1 if this txn dominates everything with a lower order that we know about */
  domainates: number
  /** -1 if this txn is an ancestor to everything with a higher order number we know about */
  submits: number

  parentsOrder: number[]
}


export class Doc<Item = string> {
  agentTxns: {
    // Stored in seq order.
    [agent: string]: LocalTxn<Item>[]
  } = {}

  /** The next available sequence number for the specified agent. */
  // nextAgentSeq: Record<string, number> = {}

  /** By order */
  txns: LocalTxn<Item>[] = []
  
  /** (id, seq) => order */
  versionToOrder: Map2<string, number, number> = new Map2()

  // frontier: Set<number> = new Set()
  frontier: number[] = [-1]

  /** Stored in reverse order */
  docRoot: DocTreeItem<Item>[] = []



  getOrder(id: Id): number {
    if (id.agent === 'ROOT') return -1
    const order = this.versionToOrder.get(id.agent, id.seq)
    if (order == null) throw Error('Missing order for id')
    return order
  }

  getId(order: number): Id {
    return order === -1 ? ROOT_ID : this.txns[order].id
  }

  // Parameters passed as orders. Stolen from my braid-kernel code.
  branchContainsVersion(target: number, branch: number[]): boolean {
    // TODO: Might be worth checking if the target version has the same agent id
    // as one of the items in the branch and short circuiting if so.

    if (branch.indexOf(target) >= 0) return true
    // if (branch.length === 0) return false // TODO: This might be invalid in all cases?
    if (branch.length === 0) throw Error('Empty branch is invalid')
    if (target === -1) return true // All branches contain the root.

    // This works is via a DFS from the operation with a higher localOrder looking
    // for the localOrder of the smaller operation.

    // LIFO queue. We could use a priority queue here but I'm not sure it'd be any
    // faster in practice.
    const queue: number[] = branch.slice().sort((a, b) => b - a) // descending.

    const targetTxn = this.txns[target]!
    if (targetTxn.submits === -1 && targetTxn.submits > queue[0]) return true

    const visited = new Set<number>() // Set of localOrders.

    let found = false

    while (queue.length > 0 && !found) {
      const order = queue.pop()!

      if (order <= target) {
        if (order === target) found = true
        continue
      }

      if (visited.has(order)) continue
      visited.add(order)

      const txn = this.txns[order]
      assert(txn != null) // If we hit the root operation, we should have already returned.

      if (txn.domainates < target) return true

      queue.push(...txn.parentsOrder)

      // Does this make it faster?
      if (txn.domainates !== -1) queue.push(txn.domainates)
    }

    return found
  }

  /** Returns neg if a < b, pos if a > b, 0 if a || b. */
  compareVersions(a: Id, b: Id): number {
    if (a.agent === b.agent) return a.seq - b.seq
    const aOrder = this.getOrder(a)
    const bOrder = this.getOrder(b)
    assert(aOrder !== bOrder) // Should have returned above in this case.

    const [start, target] = aOrder > bOrder ? [aOrder, bOrder] : [bOrder, aOrder]

    // Its impossible for the operation with a smaller localOrder to dominate the
    // op with a larger localOrder.
    return this.branchContainsVersion(target, [start]) ? aOrder - bOrder : 0
  }

  // getBranchAsOrders = (db: DBState, frontier: Set<string> = db.versionFrontier): number[] => (
  //   Array.from(frontier).map(agent => (
  //     agent === ROOT_VERSION.agent ? -1 : db.versionToOrder.get(agent, db.version.get(agent)!)!
  //   ))
  // )



  // Id can be that of a txn or an operation with in a txn.
  findTxnContaining(id: Id): LocalTxn<Item> | null {
    // console.log('findTxnContaining', id)
    const txns = this.agentTxns[id.agent]
    if (txns == null) return null

    const rawIdx = bs(txns, id.seq, (txn, seq) => txn.id.seq - seq)
    // return idx < 0 ? null : txns[idx]
    // console.log('rawIdx', rawIdx, this.agentOps[id.agent])
    const idx = rawIdx >= 0 ? rawIdx : -rawIdx-2

    const txn = txns[idx]
    if (idx >= txns.length) return null

    if ((id.seq - txn.id.seq) > txn.ops.length) {
      // throw Error(`Internal state violation. Could not find txn containing id ('${id.agent}',${id.seq})`)
      return null
    }
    return txn
  }

  // Returns null if the id is not in the store
  findTxn(id: Id) {
    const txn = this.findTxnContaining(id)
    return txn == null ? null
      : (txn.id.seq !== id.seq) ? null
      : txn
  }

  findInsert(id: Id): InsertOp<Item> {
    const txn = this.findTxnContaining(id)
    if (txn == null) throw Error('Could not find inserted item')

    const ins = txn.ops.find(ins => (ins as InsertOp<Item>).seq! == id.seq) as InsertOp<Item> | undefined
    if (ins == null) throw Error('Missing deleted item')

    return ins
  }

  // insertOrdered(id: Id, item: Item, deleted: boolean, txn: Txn<Item>, dest: DocTreeItem<Item>[]) {
  //   // We need to scan through the list of children to find the insert position.
  // }

  advanceFrontier(txn: LocalTxn<any>) {
    // Check the operation fits. The operation should not be in the branch, but
    // all the operation's parents should be.
    assert(!this.branchContainsVersion(txn.order, this.frontier), 'doc already contains version')
    for (const parent of txn.parentsOrder) {
      assert(this.branchContainsVersion(parent, this.frontier), 'operation in the future')
    }

    // Every version named in branch is either:
    // - Equal to a branch in the new operation's parents (in which case remove it)
    // - Or newer than a branch in the operation's parents (in which case keep it)
    // If there were any versions which are older, we would have aborted above.
    this.frontier = [txn.order,
      ... this.frontier.filter(o => !txn.parentsOrder.includes(o))
    ]
  }

  apply(txn: Txn<Item>) {
    const {id} = txn
    if (this.findTxn(id)) return null

    for (const parentId of txn.parents) {
      if (parentId.agent !== 'ROOT' && this.findTxn(parentId) == null) throw Error('Parent does not exist. Attempt to apply txns out of order')
    }

    assert(txn.parents.length > 0, 'Parents cannot be empty')

    const txns = this.agentTxns[id.agent] ??= []
    if (txns.length) assert(txns[txns.length - 1].id.seq < id.seq, 'Cannot insert old operation')

    const order = this.txns.length
    const parentsOrder = txn.parents.map(id => this.getOrder(id))
      .sort((a, b) => b - a) // Descending.

    // Put parents in the same order as parentsOrder.
    // txn.parents = parentsOrder.map(order => this.txns[order].id)
    const localTxn: LocalTxn<Item> = {
      ...txn,
      order,
      domainates: -1,
      submits: -1, // Always infinity on new ops.
      parentsOrder
    }
    this.agentTxns[id.agent].push(localTxn)
    this.txns.push(localTxn)
    this.versionToOrder.set(id.agent, id.seq, order)
    this.advanceFrontier(localTxn)

    // Fix dominatesMin / submitsMax
    const recentParent = localTxn.parentsOrder[0] // Parent with the highest order
    if (order !== recentParent + 1) {
      for (let i = recentParent + 1; i < order; i++) {
        const txn = this.txns[i]
        if (txn.submits === -1) txn.submits = order - 1
      }
      // We just dominate ourself!
      localTxn.domainates = order
      this.txns
    } else {
      // We dominate everything our most recent parent dominates
      localTxn.domainates = recentParent === -1 ? -1 : this.txns[recentParent].domainates
    }

    // Ok now merge the operations into the doc tree
    let opSeq = id.seq
    for (const op of txn.ops) {
      if (op.type === 'insert') {
        op.seq = opSeq++

        // Find the parent
        const container = op.predecessor.agent === 'ROOT' ? this.docRoot : this.findInsert(op.predecessor)!.treeItem!.children

        // Ok this is the tricky bit. We need to insert at the right
        // location. We'll almost always insert at the end here.
        let i = container.length - 1
        // console.log('container', container)
        for (; i >= 0; i--) {
          // Break if op goes before container[i].
          // So, break if op dominates container[i].
          const item = container[i]
          const itemId = item.id
          if (itemId.agent === id.agent) {
            // console.log('agents match', op.seq, itemId.seq)
            if (op.seq > itemId.seq) break
            else continue
          }

          // We need to compare the id of our txn with the id of the containing txn.
          const otherTxn = this.findTxnContaining(itemId)
          if (otherTxn == null) throw Error('internal consistency error')

          // console.log('compare versions', id, otherTxn.id)
          const cmp = this.compareVersions(id, otherTxn.id)
          // console.log('cmp', cmp, id.agent < otherTxn.id.agent)
          if (cmp > 0) break // op dominates container[i]
          else if (cmp < 0) continue // container[i] dominates op
          else if (id.agent < otherTxn.id.agent) break
        }

        const item: DocTreeItem<Item> = {
          id: {agent: id.agent, seq: op.seq},
          content: op.content,
          children: [],
          deleted: false,
        }

        if (i === container.length - 1) container.push(item)
        else container.splice(i+1, 0, item)
        op.treeItem = item
      } else {
        // Just mark the item as deleted.
        const ins = this.findInsert(op.target)
        ins.treeItem!.deleted = true
      }
    }
  }

  *allIn(children: DocTreeItem<Item>[]): Generator<DocTreeItem<Item>> {
    // Reverse scan.
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i]
      if (!c.deleted) yield c
      yield* this.allIn(c.children)
    }
  }

  *all(): Generator<DocTreeItem<Item>> {
    yield* this.allIn(this.docRoot)
  }

  read(): Item[] {
    return Array.from(this.all()).map(c => c.content)
  }

  readStr() {
    return this.read().join('')
  }

  makeTxn(agent: string, ops: Op<Item>[]): Txn<Item> {
    // Figure out an ID
    let seq = 1
    const txns = this.agentTxns[agent]
    if (txns && txns.length > 0) {
      const last = txns[txns.length - 1]
      // TODO: Fix this logic. This isn't right.
      seq = last.id.seq + last.ops.length + 1
    }

    return {
      id: {agent, seq},
      parents: this.frontier.map(order => this.getId(order)),
      ops
    }
  }

  findIdBeforePos(pos: number): Id {
    if (pos === 0) return ROOT_ID
    for (const item of this.all()) {
      if (--pos === 0) return item.id
    }
    throw Error('Pos past the end of the document')
  }

  makeInsertOp(pos: number, item: Item): InsertOp<Item> {
    return {
      type: 'insert',
      content: item,
      predecessor: this.findIdBeforePos(pos),
    }
  }

  makeDeleteOp(pos: number): Op<Item> {
    return {
      type: 'delete',
      target: this.findIdBeforePos(pos + 1)
    }
  }

  // makeInsert(agent: string, item: Item, pos: number): Txn<Item> {

  // }
}
