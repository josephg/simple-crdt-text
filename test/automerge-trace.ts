import {Console} from 'console'
import assert from 'assert'
import {Doc, ROOT_ID} from '../src/index'
import fs from 'fs'

// import {edits, finalText} from './editing-trace'

type Edits = ([idx: number, del: 0, ins: string] | [idx: number, del: 1])[]
const {edits, finalText} = JSON.parse(fs.readFileSync('./automerge-trace.json', 'utf8')) as {edits: Edits, finalText: string}

// const edits: Edits = []
// const finalText = ''

let console = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  inspectOptions: {depth: 4}
})

// const doc = new Doc()

const checkBaseline = () => {
  let doc = ''
  for (const [idx, remove, insert] of edits) {
    doc = insert != null
      ? doc.slice(0, idx) + insert + doc.slice(idx + remove)
      : doc = doc.slice(0, idx) + doc.slice(idx + remove)
  }
  assert.strictEqual(doc, finalText)
}

console.time('baseline')
checkBaseline()
console.timeEnd('baseline')

console.time('local crdt')
{
  console.log('\n*** WARNING This will take a really long time. It may never finish!\n')
  const doc = new Doc()
  console.log(`processing ${edits.length} edits...`)
  for (let i = 0; i < edits.length; i++) {
    if (i % 1000 === 0) console.log(`${i}: ${process.memoryUsage().rss / 1e6}mb in use`)
    const [idx, remove, insert] = edits[i]
    assert(remove <= 1)
    const txn = insert != null
    ? doc.makeTxn('user', [doc.makeInsertOp(idx, insert!)])
    : doc.makeTxn('user', [doc.makeDeleteOp(idx)])

    doc.apply(txn)
  }

  assert.strictEqual(doc.readStr(), finalText)
}
console.timeEnd('local crdt')