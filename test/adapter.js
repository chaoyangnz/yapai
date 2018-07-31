const p = require('../src/promise')

module.exports = {
  resolved: (value) => {
    return new p.Promise((resolve, reject) => resolve(value))
  },
  rejected: (reason) => {
    return new p.Promise((resolve, reject) => reject(reason))
  },
  deferred: () => {
    const promise = new p.Promise((resolve, reject) => {})
    return {
      promise, 
      resolve: (value) => {
        p.resolve(promise, value);
      }, 
      reject: (reason) => {
        p.reject(promise, reason);
      }
    }
  }
}
