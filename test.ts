import {Console} from 'console'
import {Doc, ROOT_ID} from './src/index'

let console = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  inspectOptions: {depth: 4}
})

const doc = new Doc()

doc.apply({
  id: {agent: 'xxx', seq: 1},
  parents: [ROOT_ID],
  ops: [{
    type: 'insert',
    content: 'x',
    predecessor: ROOT_ID,
  // }, {
  //   type: 'insert',
  //   content: 'y',
  //   parent: ROOT_ID,
  // }, {
  //   type: 'insert',
  //   content: 'z',
  //   parent: {agent: 'xxx', seq: 2},
  }]
})

console.log('ip', doc.findIdBeforePos(1))

// Insert two concurrent edits
doc.apply({
  id: {agent: 'aaa', seq: 1},
  parents: [{agent: 'xxx', seq: 1}],
  ops: [{
    type: 'insert',
    content: 'A',
    predecessor: {agent: 'xxx', seq: 1},
  }]
})
doc.apply({
  id: {agent: 'bbb', seq: 1},
  parents: [{agent: 'xxx', seq: 1}],
  ops: [{
    type: 'insert',
    content: 'B',
    predecessor: {agent: 'xxx', seq: 1},
  }]
})

// Insert something that preceeds both
doc.apply({
  id: {agent: 'ccc', seq: 1},
  parents: [{agent: 'aaa', seq: 1}, {agent: 'bbb', seq: 1}],
  ops: [{
    type: 'insert',
    content: 'C',
    predecessor: {agent: 'xxx', seq: 1},
  }]
})

// Delete the x
doc.apply({
  id: {agent: 'xxx', seq: 2},
  parents: [{agent: 'xxx', seq: 1}],
  ops: [{
    type: 'delete',
    target: {agent: 'xxx', seq: 1}
  }]
})

{
  const txn = doc.makeTxn('aaa', [doc.makeInsertOp(2, '_')])
  console.log(txn)
  doc.apply(txn)
}
{
  const txn = doc.makeTxn('ccc', [doc.makeDeleteOp(2)])
  console.log(txn)
  doc.apply(txn)
}
console.log(doc.readStr())

const fuzzer = () => {
  const docs = new Array(3).fill(null).map(() => new Doc())

  for (let iter = 0; iter < 10000; iter++) {
    // Generate some random operations
  }
}

