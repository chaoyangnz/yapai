// Follow Mozilla documentation and Promises/A+
// Refer to https://promisesaplus.com/
// Refer to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

const PENDING = 'pending'
const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'
// mock engine PromiseJob queue
const PromiseJobsQueue = new Map()
function queueJob(promise, queue, ayncFunc) { PromiseJobsQueue.get(promise)[queue].push(ayncFunc) }
function runJobs(promise, queue) { PromiseJobsQueue.get(promise)[queue].forEach(ayncFunc => ayncFunc()) }
function initQueue(promise) { PromiseJobsQueue.set(promise, {resolve: [], reject: [], finally: []}) }
function cleanQueue(promise) { PromiseJobsQueue.delete(promise) }

// utilities
function globalObject(fn) {
  if (typeof fn != "function") throw new TypeError("expected function")
  // expected to throw
  try { fn.caller  } catch(e) { return undefined}
  return global || window
}
function isFunction(fn) { return typeof fn === 'function' }
function isObjectOrFunction(x) { if (x === null) return false; const type = typeof x; return type === 'function' || type === 'object' }
function assert(expression) { if (!expression) throw new Error('bug') }
function dummy() { return new Promise(() => {})}
function identity(promise) { return (value) => resolve(promise, value) }
function throwner(promise) { return (reason) => reject(promise, reason) }
function asyncFunc(handler, promise1, promise2, notFinally = true) { 
  return () => {
    assert(promise1._state !== PENDING)
    setTimeout(() => {
      let x
      try { // invoke handler function
        x = handler.call(globalObject(handler), notFinally ? promise1._value : undefined)
      } catch (err) {
        reject(promise2, err); return
      }
      resolve(promise2, x)
    }, 0)
  }
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) return
  promise._state = FULFILLED
  promise._value = value
  runJobs(promise, 'resolve')
  runJobs(promise, 'finally')
  cleanQueue(promise)
}

export function reject(promise, reason) {
  if (promise._state !== PENDING) return
  promise._state = REJECTED
  promise._value = reason
  runJobs(promise, 'reject')
  runJobs(promise, 'finally')
  cleanQueue(promise)
}

// promise resolution procedure, denote as [[Resolve]](promise, x)
export function resolve(promise, x) {
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

export class Promise {
  constructor(executor) {
    this._value = undefined // resolved value or rejection reason
    this._state = PENDING // pending / fulfilled  / rejected
    initQueue(this)
    try {
      // execute immediately, the executor is called before the Promise constructor even returns the created object
      executor((value) => resolve(this, value), (reason) => reject(this, reason))
    } catch (err) {
      reject(this, err) // reject implicitly if any arror in executor
    }
  }

  then(onFulfilled, onRejected) {
    const promise1 = this, promise2 = dummy()
    if (promise1._state === FULFILLED) {
      if (!isFunction(onFulfilled)) return promise1
      else asyncFunc(onFulfilled, promise1, promise2)() // immediately-fulfilled
    }
    if (promise1._state === REJECTED) {
      if (!isFunction(onRejected)) return promise1
      else asyncFunc(onRejected, promise1, promise2)() // immediately-rejected
    }
    if (promise1._state === PENDING) {
      onFulfilled = isFunction(onFulfilled) ? onFulfilled : identity(promise2)
      queueJob(promise1, 'resolve', asyncFunc(onFulfilled, promise1, promise2)) // eventually-fulfilled
      onRejected = isFunction(onRejected) ? onRejected : throwner(promise2)
      queueJob(promise1, 'reject', asyncFunc(onRejected, promise1, promise2)) // eventually-rejected
    }
    return promise2
  }

  catch(onRejected) {
    return this.then(undefined, onRejected)
  }

  finally(onFinally) {
    const promise1 = this
    const promise2 = dummy()
    if (isFunction(onFinally) && promise1._state !== PENDING) {
      asyncFunc(onFinally)()
    }
    if (isFunction(onFinally) && promise1._state === PENDING) {
      queueJob(promise1, 'finally', asyncFunc(onFinally, promise1, promise2, true))
    }
    return promise2
  }

  static reject(reason) {
    return new Promise((resolve, reject) => {
      reject(reason)
    })
  }

  static resolve(value) {
    if (value instanceof Promise) return value
    let promise = new Promise((resolve, reject) => {
      resolve(value)
    })
    return promise
  }

  static all(iterable) {
    const promise2 = dummy()
    const arr = Array.from(iterable)
    const promises = arr.filter(item => item instanceof Promise)
    let length = promises.length
    if (length === 0) {
      fulfill(promise2, undefined); return
    }
    function doResolve(value) {
      if (--length === 0) resolve(promise2, value)
    }
    for (const promise1 of promises) {
      promise1.then(doResolve, throwner(promise2))
    }
  }
}

export default Promise