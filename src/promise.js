// Follow Mozilla documentation and Promises/A+
// Refer to https://promisesaplus.com/
// Refer to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// utilities
function globalObject(fn) {
  if (typeof fn != "function")
    throw new TypeError("expected function");
  try {
    fn.caller; // expected to throw
    return global || window
  } catch(e) {
    return undefined
  }
}
function isFunction(fn) { return typeof fn === 'function' }
function isObjectOrFunction(x) { if (x === null) return false; const type = typeof x; return type === 'function' || type === 'object' }
function assert(bool) { if (!bool) throw new Error('bug') }
function identity(promise) { return (value) => resolve(promise, value) }
function throwner(promise) { return (reason) => reject(promise, reason) }
function dummy() { return new Promise(() => {})}

export function fulfill(promise, value) {
  if (promise._state !== PENDING) return
  promise._state = FULFILLED
  promise._value = value
  promise._resolveQueue.forEach(({ onFulfilled, call }) => call(onFulfilled))
  afterSettled(promise)
}

function reject(promise, reason) {
  if (promise._state !== PENDING) return
  promise._state = REJECTED
  promise._value = reason
  promise._rejectQueue.forEach(({ onRejected, call }) => call(onRejected))
  afterSettled(promise)
}

function afterSettled(promise) {
  promise._finallyQueue.forEach(({ onFinally, call }) => call(onFinally))
  promise._resolveQueue = [] // clear
  promise._rejectQueue = [] // clear
  promise._finallyQueue = [] // clear
}

// promise resolution procedure, denote as [[Resolve]](promise, x)
function resolve(promise, x) {
  if (promise === x) { // 2.3.1 If promise and x refer to the same object, reject promise with a TypeError as the reason
    reject(promise, new TypeError('promise and x refer to the same object')); return
  }
  if (x instanceof Promise) { // 2.3.2 If x is a promise, adopt its state
    if (x._state === PENDING) { // 2.3.2.1 If x is pending, promise must remain pending until x is fulfilled or rejected
      x.then(identity(promise), throwner(promise)); return
    }
    if (x._state === FULFILLED) { // 2.3.2.2 If/when x is fulfilled, fulfill promise with the same value
      fulfill(promise, x._value); return
    }
    if (x._state === REJECTED) { // 2.3.2.3 If/when x is rejected, reject promise with the same reason
      reject(promise, x._value); return
    }
  } else if (isObjectOrFunction(x)) { // 2.3.3 Otherwise, if x is an object or function
    let then
    try {
      then = x.then // 2.3.3.1 Let then be x.then
    } catch (e) {
      reject(promise, e); return // 2.3.3.2 If retrieving the property x.then results in a thrown exception e, reject promise with e as the reason
    }

    if (isFunction(then)) { // 2.3.3.3 If then is a function, call it with x as this, first argument resolvePromise, and second argument rejectPromise
      let called = false
      try {
        then.call(
          x, 
          function resolvePromise(y) { // 2.3.3.3.1 If/when resolvePromise is called with a value y, run [[Resolve]](promise, y)
            if (called === true) return // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
            called = true
            resolve(promise, y)
          }, 
          function rejectPromise(r) { // 2.3.3.3.2 If/when rejectPromise is called with a reason r, reject promise with r
            if (called === true) return // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
            called = true
            reject(promise, r)
          }); return
      } catch (e) { // 2.3.3.3.4 If calling then throws an exception e,
        if (called) {
          return // 2.3.3.3.4.1 If resolvePromise or rejectPromise have been called, ignore it.
        } else { // 2.3.3.3.4.2 Otherwise, reject promise with e as the reason
          reject(promise, e); return
        }
      }
    } else { // 2.3.3.4 If then is not a function, fulfill promise with x
      fulfill(promise, x); return
    }
  } else { // 2.3.4 If x is not an object or function, fulfill promise with x
    fulfill(promise, x); return
  }
}

const PENDING = 'pending'
const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'

class Promise {

  /**
   * @param excutor (resolve, reject) => {}
   */
  constructor(executor) {
    // resolved value or rejection reason
    this._value = undefined

    // pending / fulfilled  / rejected
    this._state = PENDING
    this._resolveQueue = []
    this._rejectQueue = []
    this._finallyQueue = []
    try {
      // execute immediately, the executor is called before the Promise constructor even returns the created object
      executor((value) => resolve(this, value), (reason) => reject(this, reason))
    } catch (err) {
      // reject implicitly if any arror in executor
      reject(this, err)
    }
  }

  /**
   * Register
   *
   * @param onFulfilled (value) => {}
   * @param onRejected (reason) => {}
   * @return Promise in the pending status
   */
  then(onFulfilled, onRejected) {
    const promise1 = this
    if (!isFunction(onFulfilled) && promise1._state === FULFILLED) {
      return promise1
    }
    if (!isFunction(onRejected) && promise1._state === REJECTED) {
      return promise1
    }

    const promise2 = dummy()

    const call = (handler) => {
      assert(promise1._state !== PENDING)
      setTimeout(() => {
        let x
        // invoke handler function
        try {
          x = handler.call(globalObject(handler), promise1._value)
        } catch (err) {
          reject(promise2, err); return
        }
        resolve(promise2, x)
      }, 0)
    }

    if (isFunction(onFulfilled) && promise1._state === FULFILLED) {
      call(onFulfilled) // eventually-fulfilled
    }

    if (isFunction(onRejected) && promise1._state === REJECTED) {
      call(onRejected) // eventually-rejected
    }
    
    if (promise1._state === PENDING) {
      onFulfilled = isFunction(onFulfilled) ? onFulfilled : identity(promise2)
      promise1._resolveQueue.push({ onFulfilled, call })
      onRejected = isFunction(onRejected) ? onRejected : throwner(promise2)
      promise1._rejectQueue.push({ onRejected, call })
    }
    return promise2
  }

  catch(onRejected) {
    return this.then(undefined, onRejected)
  }

  finally(onFinally) {
    const promise1 = this
    const promise2 = dummy()
    // aync invocation
    const call = (onFinally) => {
      assert(promise1._state !== PENDING)
      setTimeout(() => {
        let x
        try {
          x = onFinally.call(globalObject(onFinally))
        } catch (err) {
          reject(promise2, err); return
        }
        resolve(promise2, x)
      }, 0)
    }
    if (isFunction(onFinally) && promise1._state !== PENDING) {
      call(onFinally)
    }
    if (isFunction(onFinally) && promise1._state === PENDING) {
      promise1._finallyQueue.push({ onFinally, call })
    }
    
    return promise2
  }

  /**
   * @return Promise
   */
  static reject(reason) {
    return new Promise((resolve, reject) => {
      reject(reason)
    })
  }

  /**
   * @return Promise
   */
  static resolve(value) {
    if (value instanceof Promise) return value
    let promise = new Promise((resolve, reject) => {
      resolve(value)
    })
    return promise
  }

  /**
   * @return Promise
   */
  static all(iterable) {
    const promise2 = new Promise((resolve, reject) => {})
    const arr = Array.from(iterable)
    if (arr.length === 0 || arr.every(item => !item instanceof Promise)) {
      
    }
    const promises = arr.filter(item => item instanceof Promise)
    let length = promises.length
    if (length === 0) {
      fulfill(promise2, undefined); return
    }
    function doResolve(value) {
      length--
      if (length === 0) {
        resolve(promise2, value)
      }
    }
    for (const promise1 of promises) {
      promise1.then(doResolve, throwner(promise2))
    }
  }
}

module.exports = {
  Promise, resolve, reject
}