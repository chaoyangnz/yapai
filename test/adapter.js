// import Promise from '../src/promise'
const Promise = require('../src/promise')

module.exports = {
  resolved: (value) => {
    return new Promise((resolve, reject) => resolve(value))
  },
  rejected: (reason) => {
    return new Promise((resolve, reject) => reject(reason))
  },
  deferred: () => {
    const promise = new Promise((resolve, reject) => {})
    return {promise, resolve: promise._fulfill, reject: promise._reject}
  }
}
