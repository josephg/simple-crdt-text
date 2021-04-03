
// type Id = [agent: string, seq: number]
export type Id = {agent: string, seq: number}

// The root has this ID and an order of -1.
export const ROOT_ID = Object.freeze({agent: 'ROOT', seq: 0})

export type InsertOp<Item> = {
  type: 'insert'
  content: Item[] | string
  predecessor: Id

  // Used when inserted into the doc tree.
  seq?: number, // Calculated from the txn's id
  treeItem?: DocTreeItem<Item>
}
export type Op<Item> = InsertOp<Item> | {
  type: 'delete'
  target: Id
}

export type Txn<Item> = {
  id: Id
  parents: Id[] // Will always also include parents by this agent
  ops: Op<Item>[]
}

// TODO: This is internal and should not be exposed externally.
export type DocTreeItem<Item> = {
  content: Item
  id: Id // id of op, not id of txn.
  deleted: boolean
  /** Stored in reverse order */
  children: DocTreeItem<Item>[]
}
