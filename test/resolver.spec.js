/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const ipldEthTrie = require('../src')
const isExternalLink = require('../src/common').isExternalLink
const resolver = ipldEthTrie.resolver
const async = require('async')
const IpfsBlock = require('ipfs-block')
const Trie = require('merkle-patricia-tree')
const TrieNode = require('merkle-patricia-tree/trieNode')

describe('IPLD format resolver (local)', () => {
  let trie, trieNodes = [], dagNodes

  before((done) => {
    trie = new Trie()
    async.waterfall([
      (cb) => populateTrie(trie, cb),
      (cb) => dumpTrieNonInlineNodes(trie, trieNodes, cb),
      (cb) => async.map(trieNodes, ipldEthTrie.util.serialize, cb),
    ], (err, result) => {
      if (err) return done(err)
      dagNodes = result.map((serialized) => new IpfsBlock(serialized))
      done()
    })
  })

  it('multicodec is eth-trie', () => {
    expect(resolver.multicodec).to.equal('eth-trie')
  })

  describe('resolver.tree', () => {
    it('test root node', () => {
      let rootNode = dagNodes[0]
      resolver.tree(rootNode, (err, children) => {
        expect(err).to.not.exist
        expect(Array.isArray(children)).to.eql(true)
        expect(children.length).to.eql(1)
        let child = children[0]
        expect(child.path).to.eql('000')
        expect(isExternalLink(child.value)).to.eql(true)
      })
    })

    it('test root first branch node', () => {
      let firstBranchNode = dagNodes[1]
      resolver.tree(firstBranchNode, (err, children) => {
        expect(err).to.not.exist
        expect(Array.isArray(children)).to.eql(true)
        expect(children.length).to.eql(3)
        let child1 = children[0]
        expect(child1.path).to.eql('a')
        expect(isExternalLink(child1.value)).to.eql(true)
        let child2 = children[1]
        expect(child2.path).to.eql('b')
        expect(isExternalLink(child2.value)).to.eql(true)
        let child3 = children[2]
        expect(child3.path).to.eql('c')
        expect(isExternalLink(child3.value)).to.eql(false)
      })
    })
  })

  describe('resolver.resolve', () => {
    it('root node resolves to first branch node', () => {
      let rootNode = dagNodes[0]
      let firstBranchNode = dagNodes[1]
      resolver.resolve(rootNode, '000a0a00', (err, result) => {
        expect(err).to.not.exist
        let trieNode = result.value
        expect(trieNode.raw).to.eql(firstBranchNode.raw)
        expect(result.remainderPath).to.eql('a0a00')
      })
    })

    it('first branch node resolves "a" to remote', () => {
      let firstBranchNode = dagNodes[1]
      resolver.resolve(firstBranchNode, 'a0a00', (err, result) => {
        expect(err).to.not.exist
        let trieNode = result.value
        expect(result.remainderPath).to.eql('0a00')
        expect(isExternalLink(trieNode)).to.eql(true)
      })
    })

    it('first branch node resolves "b" to remote', () => {
      let firstBranchNode = dagNodes[1]
      resolver.resolve(firstBranchNode, 'b0a00', (err, result) => {
        expect(err).to.not.exist
        let trieNode = result.value
        expect(result.remainderPath).to.eql('0a00')
        expect(isExternalLink(trieNode)).to.eql(true)
      })
    })

    it('first branch node resolves "c" entirely', () => {
      let firstBranchNode = dagNodes[1]
      resolver.resolve(firstBranchNode, 'c0a00', (err, result) => {
        expect(err).to.not.exist
        let trieNode = result.value
        expect(result.remainderPath).to.eql('')
        expect(isExternalLink(trieNode)).to.eql(false)
        expect(Buffer.isBuffer(result.value)).to.eql(true)
        expect(result.value.toString('hex')).to.eql('cafe07')
      })
    })
  })
})

function populateTrie(trie, cb){
  async.series([
    (cb) => trie.put(new Buffer('000a0a00', 'hex'), new Buffer('cafe01', 'hex'), cb),
    (cb) => trie.put(new Buffer('000a0a01', 'hex'), new Buffer('cafe02', 'hex'), cb),
    (cb) => trie.put(new Buffer('000a0a02', 'hex'), new Buffer('cafe03', 'hex'), cb),
    (cb) => trie.put(new Buffer('000a0b00', 'hex'), new Buffer('cafe04', 'hex'), cb),
    (cb) => trie.put(new Buffer('000b0a00', 'hex'), new Buffer('cafe05', 'hex'), cb),
    (cb) => trie.put(new Buffer('000b0b00', 'hex'), new Buffer('cafe06', 'hex'), cb),
    (cb) => trie.put(new Buffer('000c0a00', 'hex'), new Buffer('cafe07', 'hex'), cb),
  ], (err) => {
    if (err) return cb(err)
    cb()
  })
}

function dumpTrieNonInlineNodes(trie, fullNodes, cb){
  let inlineNodes = []
  trie._walkTrie(trie.root, (root, node, key, walkController) => {
    // skip inline nodes
    if (contains(inlineNodes, node.raw)) return walkController.next()
    fullNodes.push(node)
    // check children for inline nodes
    node.getChildren().forEach((child) => {
      let value = child[1]
      if (TrieNode.isRawNode(value)) {
        inlineNodes.push(value)
      }
    })
    // continue
    walkController.next()
  }, cb)
}

function contains(array, item) {
  return array.indexOf(item) !== -1
}
