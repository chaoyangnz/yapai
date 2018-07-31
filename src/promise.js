// Follow Mozilla documentation and Promises/A+
// Refer to https://promisesaplus.com/
// Refer to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// utilities
function noThis(fn) {
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

function __fulfill__(promise, value) {
  if (promise._isSettled()) return
  promise._state = FULFILLED
  promise._value = value
  promise._resolveQueue.forEach(({ onFulfilled, promise2 }) => promise._invokeHandler(onFulfilled, promise2))
  __afterSettled__(promise)
}

function __reject__(promise, reason) {
  if (promise._isSettled()) return
  promise._state = REJECTED
  promise._value = reason
  promise._rejectQueue.forEach(({ onRejected, promise2 }) => promise._invokeHandler(onRejected, promise2))
  __afterSettled__(promise)
}

function __afterSettled__(promise) {
  promise._finallyQueue.forEach(promise._invokeFinally)
  promise._resolveQueue = [] // clear
  promise._rejectQueue = [] // clear
  promise._finallyQueue = [] // clear
}

// promise resolution procedure, denote as [[Resolve]](promise, x)
function __resolve__(promise, x) {
  if (promise === x) { // 2.3.1 If promise and x refer to the same object, reject promise with a TypeError as the reason
    __reject__(promise, new TypeError('promise and x refer to the same object')); return
  }
  if (x instanceof Promise) { // 2.3.2 If x is a promise, adopt its state
    if (x._state === PENDING) { // 2.3.2.1 If x is pending, promise must remain pending until x is fulfilled or rejected
      x.then((value) => __resolve__(promise, value), (reason) => __reject__(promise, reason)); return
    }
    if (x._state === FULFILLED) { // 2.3.2.2 If/when x is fulfilled, fulfill promise with the same value
      __fulfill__(promise, x._value); return
    }
    if (x._state === REJECTED) { // 2.3.2.3 If/when x is rejected, reject promise with the same reason
      __reject__(promise, x._value); return
    }
  } else if (isObjectOrFunction(x)) { // 2.3.3 Otherwise, if x is an object or function
    let then
    try {
      then = x.then // 2.3.3.1 Let then be x.then
    } catch (e) {
      __reject__(promise, e); return // 2.3.3.2 If retrieving the property x.then results in a thrown exception e, reject promise with e as the reason
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
            __reject__(promise, r)
          }); return
      } catch (e) { // 2.3.3.3.4 If calling then throws an exception e,
        if (called) {
          return // 2.3.3.3.4.1 If resolvePromise or rejectPromise have been called, ignore it.
        } else { // 2.3.3.3.4.2 Otherwise, reject promise with e as the reason
          __reject__(promise, e); return
        }
      }
    } else { // 2.3.3.4 If then is not a function, fulfill promise with x
      __fulfill__(promise, x); return
    }
  } else { // 2.3.4 If x is not an object or function, fulfill promise with x
    __fulfill__(promise, x); return
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
    const resolve = (value) => __resolve__(this, value)
    const reject = (reason) => __reject__(this, reason)
    try {
      // executed immediate
      // the executor is called before the Promise constructor even returns the created object
      executor(resolve, reject)
    } catch (err) {
      // reject implicitly if any arror in executor
      __reject__(this, err)
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
      // __fulfill__(promise2, promise1._value) // immediately-fulfilled
    }
    if (!isFunction(onRejected) && promise1._state === REJECTED) {
      return promise1
      // __reject__(promise2, promise1._value) // immediately-rejected
    }

    const promise2 = new Promise((resolve, reject) => {})
    if (isFunction(onFulfilled) && promise1._state === FULFILLED) {
      promise1._invokeHandler(onFulfilled, promise2) // eventually-fulfilled
    }

    if (isFunction(onRejected) && promise1._state === REJECTED) {
      promise1._invokeHandler(onRejected, promise2) // eventually-rejected
    }
    
    if (promise1._state === PENDING) {
      onFulfilled = isFunction(onFulfilled) ? onFulfilled : (value) => __resolve__(promise2, value)
      promise1._queueResolve({ onFulfilled, promise2 })
      onRejected = isFunction(onRejected) ? onRejected : (reason) => __reject__(promise2, reason)
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
      __fulfill__(promise2); return
    }
    const promises = arr.filter(item => item instanceof Promise)
    const length = promises.length
    function doResolve(value) {
      length--
      if (length === 0) {
        __fulfill__(promise2, value)
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

  _queueResolve(then) {
    if (this._isSettled()) return
    this._resolveQueue.push(then)
  }

  _queueReject(then) {
    if (this._isSettled()) return
    this._rejectQueue.push(then)
  }

  _queueFinally(final) {
    if (this._isSettled()) return
    this._finallyQueue.push(final)
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
        __reject__(promise, err); return
      }
      __resolve__(promise, x)
    }, 0)
  }

  // aync invocation
  _invokeFinally(onFinally, promise) {
    assert(this._isSettled())
    setTimeout(() => {
      let x
      try {
        x = onFinally.call(noThis(onFinally))
      } catch (err) {
        _reject__(promise, err); return
      }
      __resolve__(promise, x)
    }, 0)
  }
}

module.exports = {
  Promise,
  resolve: __resolve__,
  reject: __reject__
}