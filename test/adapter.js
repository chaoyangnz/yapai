// import Promise from '../src/promise'
const p = require('../src/promise')

module.exports = {
  resolved: (value) => {
    return new p.Promise((resolve, reject) => resolve(value))
  },
  rejected: (reason) => {
    return new p.Promise((resolve, reject) => reject(reason))
  },
  deferred: () => {
    var call = true
    const promise = new p.Promise((resolve, reject) => {})
    return {
      promise, 
      resolve: (value) => {
        if (call) {
          call = false;
          p.resolve(promise, value);
        }
      }, 
      reject: (reason) => {
        if (call) {
          call = false;
          promise._reject(reason);
        }
        
      }
    }
  }
}
