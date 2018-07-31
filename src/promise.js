// Follow Mozilla documentation and Promises/A+
// Refer to https://promisesaplus.com/
// Refer to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// utilities
function noThis(fn) {
  if (typeof fn != "function")
    throw new TypeError("expected function");
  try {
    fn.caller; // expected to throw
    return global
  } catch(e) {
    return undefined
  }
}
function isFunction(fn) { return typeof fn === 'function' }
function isObjectOrFunction(x) { if (x === null) return false; const type = typeof x; return type === 'function' || type === 'object' }
function assert(bool) { if (!bool) throw new Error('bug') }

// promise resolution procedure, denote as [[Resolve]](promise, x)
function __resolve__(promise, x) {
  if (promise === x) { // 2.3.1 If promise and x refer to the same object, reject promise with a TypeError as the reason
    promise._reject(new TypeError('promise and x refer to the same object')); return
  }
  if (x instanceof Promise) { // 2.3.2 If x is a promise, adopt its state
    if (x._state === PENDING) { // 2.3.2.1 If x is pending, promise must remain pending until x is fulfilled or rejected
      x.then(promise._fulfill, promise._reject); return
    }
    if (x._state === FULFILLED) { // 2.3.2.2 If/when x is fulfilled, fulfill promise with the same value
      promise._fulfill(x._value); return
    }
    if (x._state === REJECTED) { // 2.3.2.3 If/when x is rejected, reject promise with the same reason
      promise._reject(x._value); return
    }
  } else if (isObjectOrFunction(x)) { // 2.3.3 Otherwise, if x is an object or function
    let then
    try {
      then = x.then // 2.3.3.1 Let then be x.then
    } catch (e) {
      promise._reject(e); return // 2.3.3.2 If retrieving the property x.then results in a thrown exception e, reject promise with e as the reason
    }

    if (isFunction(then)) { // 2.3.3.3 If then is a function, call it with x as this, first argument resolvePromise, and second argument rejectPromise
      let called = false
      try {
        then.call(
          x, 
          function resolvePromise(y) { // 2.3.3.3.1 If/when resolvePromise is called with a value y, run [[Resolve]](promise, y)
            if (called === true) return // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
            called = true
            __resolve__(promise, y)
          }, 
          function rejectPromise(r) { // 2.3.3.3.2 If/when rejectPromise is called with a reason r, reject promise with r
            if (called === true) return // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
            called = true
            promise._reject(r)
          }); return
      } catch (e) { // 2.3.3.3.4 If calling then throws an exception e,
        if (called) {
          return // 2.3.3.3.4.1 If resolvePromise or rejectPromise have been called, ignore it.
        } else { // 2.3.3.3.4.2 Otherwise, reject promise with e as the reason
          promise._reject(e); return
        }
      }
    } else { // 2.3.3.4 If then is not a function, fulfill promise with x
      promise._fulfill(x); return
    }
  } else { // 2.3.4 If x is not an object or function, fulfill promise with x
    promise._fulfill(x); return
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
    // bind instance methods
    this._fulfill = this._fulfill.bind(this)
    this._reject = this._reject.bind(this)
    try {
      // executed immediate
      // the executor is called before the Promise constructor even returns the created object
      executor(this._fulfill, this._reject, this)
    } catch (err) {
      // reject implicitly if any arror in executor
      this._reject(err)
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
    const promise2 = new Promise((resolve, reject) => {})
    if (isFunction(onFulfilled) && promise1._state === FULFILLED) {
      promise1._invokeHandler(onFulfilled, promise2) // eventually-fulfilled
    }
    if (!isFunction(onFulfilled) && promise1._state === FULFILLED) {
      promise2._fulfill(promise1._value) // immediately-fulfilled
    }

    if (isFunction(onRejected) && promise1._state === REJECTED) {
      promise1._invokeHandler(onRejected, promise2) // eventually-rejected
    }
    if (!isFunction(onRejected) && promise1._state === REJECTED) {
      promise2._reject(promise1._value) // immediately-rejected
    }
    
    if (promise1._state === PENDING) {
      onFulfilled = isFunction(onFulfilled) ? onFulfilled : (value) => promise2._fulfill(value)
      promise1._queueResolve({ onFulfilled, promise2 })
      onRejected = isFunction(onRejected) ? onRejected : (reason) => promise2._reject(reason)
      promise1._queueReject({ onRejected, promise2 })
    }
    return promise2
  }

  catch(onRejected) {
    return this.then(undefined, onRejected)
  }

  finally(onFinally) {
    const promise1 = this
    const promise2 = new Promise((resolve, reject) => {})
    if (isFunction(onFinally) && promise1._isSettled()) {
      promise1._invokeFinally(onFinally, promise)
    }
    if (isFunction(onFinally) && promise1._state === PENDING) {
      promise1._queueFinally({ onFinally, promise2 })
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
      __resolve__(promise, value)
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
      promise2._fulfill(); return
    }
    const promises = arr.filter(item => item instanceof Promise)
    const length = promises.length
    function doResolve(value) {
      length--
      if (length === 0) {
        promise2._fulfill(value)
      }
    }
    for (const promise1 of promises) {
      promise1.then(doResolve, promise2._reject)
    }
  }

  /* ================ INTERNAL IMPLEMENTATION ========================*/
  _isSettled() {
    return this._state === FULFILLED || this._state === REJECTED
  }

  _fulfill(value) {
    if (this._isSettled()) return
    this._state = FULFILLED
    this._value = value
    this._resolveQueue.forEach(({ onFulfilled, promise2 }) => this._invokeHandler(onFulfilled, promise2))
    this._afterSettled()
  }

  _reject(reason) {
    if (this._isSettled()) return
    this._state = REJECTED
    this._value = reason
    this._rejectQueue.forEach(({ onRejected, promise2 }) => this._invokeHandler(onRejected, promise2))
    this._afterSettled()
  }

  _afterSettled() {
    this._finallyQueue.forEach(this._invokeFinally)
    this._resolveQueue = [] // clear
    this._rejectQueue = [] // clear
    this._finallyQueue = [] // clear
  }

  _queueResolve(then) {
    if (this._isSettled()) return
    this._resolveQueue.push(then)
  }

  _queueReject(then) {
    if (this._isSettled()) return
    this._rejectQueue.push(then)
  }

  // aync invocation
  _invokeHandler(handler, promise) {
    assert(this._isSettled())
    setTimeout(() => {
      let x
      // invoke handler function
      try {
        x = handler.call(noThis(handler), this._value)
      } catch (err) {
        promise._reject(err); return
      }
      __resolve__(promise, x)
    }, 0)
  }

  _queueFinally(final) {
    if (this._isSettled()) return
    this._finallyQueue.push(final)
  }

  // aync invocation
  _invokeFinally(onFinally, promise) {
    setTimeout(() => {
      assert(this._isSettled())
      const x = undefined
      try {
        x = onFinally.call(noThis(onFinally))
      } catch (err) {
        promise._reject(err); return
      }

      if (x instanceof Promise) {
        x.then(promise._fulfill, promise._reject); return
      }
      if (this._state === FULFILLED) {
        promise._resolve(this._value); return
      }
      if (this._state === REJECTED) {
        promise._reject(this._value); return
      }
    }, 0)
  }
}

module.exports = Promise