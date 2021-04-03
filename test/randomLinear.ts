import {Console} from 'console'
import assert from 'assert'
import {Doc, ROOT_ID} from '../src/index'

let console = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  inspectOptions: {depth: 4}
})

const randInt = (max: number) => Math.floor(Math.random() * max)
const alphabet = 'abcdefghijklmnopqrstuvwxyz 0123456789'
const randLetter = () => alphabet[randInt(alphabet.length)]

;{
  let docRaw = ''
  let docCRDT = new Doc()

  console.time('random test')

  for (let i = 0; i < 25000; i++) {
    if (i % 1000 === 0) console.log(i)

    let insertWeight = docRaw.length < 1000 ? 0.55 : 0.45

    if (docRaw.length === 0 || Math.random() < insertWeight) {
      // insert something
      const pos = randInt(docRaw.length + 1)
      const content = randLetter()
      docRaw = docRaw.slice(0, pos) + content + docRaw.slice(pos)
      docCRDT.apply(docCRDT.makeTxn('local', [docCRDT.makeInsertOp(pos, content)]))
    } else {
      // delete something
      const pos = randInt(docRaw.length)
      docRaw = docRaw.slice(0, pos) + docRaw.slice(pos + 1)
      docCRDT.apply(docCRDT.makeTxn('local', [docCRDT.makeDeleteOp(pos)]))
    }
  }

  console.timeEnd('random test')
  assert.strictEqual(docRaw, docCRDT.readStr())
  console.log('Memory usage', process.memoryUsage())
}