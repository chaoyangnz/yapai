"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// Follow Mozilla documentation and Promises/A+
// Refer to https://promisesaplus.com/
// Refer to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// utilities
function globalObject(fn) {
  if (typeof fn != "function") throw new TypeError("expected function");
  try {
    fn.caller; // expected to throw
    return global || window;
  } catch (e) {
    return undefined;
  }
}
function isFunction(fn) {
  return typeof fn === 'function';
}
function isObjectOrFunction(x) {
  if (x === null) return false;var type = typeof x === "undefined" ? "undefined" : _typeof(x);return type === 'function' || type === 'object';
}
function assert(bool) {
  if (!bool) throw new Error('bug');
}
function identity(promise) {
  return function (value) {
    return resolve(promise, value);
  };
}
function throwner(promise) {
  return function (reason) {
    return reject(promise, reason);
  };
}
function dummy() {
  return new Promise(function () {});
}
function asynchronize(handler, promise1, promise2) {
  var notFinally = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

  return function () {
    assert(promise1._state !== PENDING);
    setTimeout(function () {
      var x = void 0;
      try {
        // invoke handler function
        x = handler.call(globalObject(handler), notFinally ? promise1._value : undefined);
      } catch (err) {
        reject(promise2, err);return;
      }
      resolve(promise2, x);
    }, 0);
  };
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) return;
  promise._state = FULFILLED;
  promise._value = value;
  promise._resolveQueue.forEach(function (onFulfilled) {
    return onFulfilled();
  });
  afterSettled(promise);
}

function reject(promise, reason) {
  if (promise._state !== PENDING) return;
  promise._state = REJECTED;
  promise._value = reason;
  promise._rejectQueue.forEach(function (onRejected) {
    return onRejected();
  });
  afterSettled(promise);
}

function afterSettled(promise) {
  promise._finallyQueue.forEach(function (_ref) {
    var onFinally = _ref.onFinally,
        call = _ref.call;
    return call(onFinally);
  });
  delete promise._resolveQueue;
  delete promise._rejectQueue;
  delete promise._finallyQueue;
}

// promise resolution procedure, denote as [[Resolve]](promise, x)
function resolve(promise, x) {
  if (promise === x) {
    // 2.3.1 If promise and x refer to the same object, reject promise with a TypeError as the reason
    reject(promise, new TypeError('promise and x refer to the same object'));return;
  }
  if (x instanceof Promise) {
    // 2.3.2 If x is a promise, adopt its state
    if (x._state === PENDING) {
      // 2.3.2.1 If x is pending, promise must remain pending until x is fulfilled or rejected
      x.then(identity(promise), throwner(promise));return;
    }
    if (x._state === FULFILLED) {
      // 2.3.2.2 If/when x is fulfilled, fulfill promise with the same value
      fulfill(promise, x._value);return;
    }
    if (x._state === REJECTED) {
      // 2.3.2.3 If/when x is rejected, reject promise with the same reason
      reject(promise, x._value);return;
    }
  } else if (isObjectOrFunction(x)) {
    // 2.3.3 Otherwise, if x is an object or function
    var then = void 0;
    try {
      then = x.then; // 2.3.3.1 Let then be x.then
    } catch (e) {
      reject(promise, e);return; // 2.3.3.2 If retrieving the property x.then results in a thrown exception e, reject promise with e as the reason
    }

    if (isFunction(then)) {
      // 2.3.3.3 If then is a function, call it with x as this, first argument resolvePromise, and second argument rejectPromise
      var called = false;
      try {
        then.call(x, function resolvePromise(y) {
          // 2.3.3.3.1 If/when resolvePromise is called with a value y, run [[Resolve]](promise, y)
          if (called === true) return; // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
          called = true;
          resolve(promise, y);
        }, function rejectPromise(r) {
          // 2.3.3.3.2 If/when rejectPromise is called with a reason r, reject promise with r
          if (called === true) return; // 2.3.3.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
          called = true;
          reject(promise, r);
        });return;
      } catch (e) {
        // 2.3.3.3.4 If calling then throws an exception e,
        if (called) {
          return; // 2.3.3.3.4.1 If resolvePromise or rejectPromise have been called, ignore it.
        } else {
          // 2.3.3.3.4.2 Otherwise, reject promise with e as the reason
          reject(promise, e);return;
        }
      }
    } else {
      // 2.3.3.4 If then is not a function, fulfill promise with x
      fulfill(promise, x);return;
    }
  } else {
    // 2.3.4 If x is not an object or function, fulfill promise with x
    fulfill(promise, x);return;
  }
}

var PENDING = 'pending';
var FULFILLED = 'fulfilled';
var REJECTED = 'rejected';

var Promise = function () {
  function Promise(executor) {
    var _this = this;

    _classCallCheck(this, Promise);

    this._value = undefined; // resolved value or rejection reason
    this._state = PENDING; // pending / fulfilled  / rejected
    this._resolveQueue = [];
    this._rejectQueue = [];
    this._finallyQueue = [];
    try {
      // execute immediately, the executor is called before the Promise constructor even returns the created object
      executor(function (value) {
        return resolve(_this, value);
      }, function (reason) {
        return reject(_this, reason);
      });
    } catch (err) {
      reject(this, err); // reject implicitly if any arror in executor
    }
  }

  _createClass(Promise, [{
    key: "then",
    value: function then(onFulfilled, onRejected) {
      var promise1 = this;
      if (!isFunction(onFulfilled) && promise1._state === FULFILLED) return promise1;
      if (!isFunction(onRejected) && promise1._state === REJECTED) return promise1;
      var promise2 = dummy();
      if (isFunction(onFulfilled) && promise1._state === FULFILLED) {
        asynchronize(onFulfilled, promise1, promise2)(); // immediately-fulfilled
      }
      if (isFunction(onRejected) && promise1._state === REJECTED) {
        asynchronize(onRejected, promise1, promise2)(); // immediately-rejected
      }
      if (promise1._state === PENDING) {
        onFulfilled = isFunction(onFulfilled) ? onFulfilled : identity(promise2);
        promise1._resolveQueue.push(asynchronize(onFulfilled, promise1, promise2)); // eventually-fulfilled
        onRejected = isFunction(onRejected) ? onRejected : throwner(promise2);
        promise1._rejectQueue.push(asynchronize(onRejected, promise1, promise2)); // eventually-rejected
      }
      return promise2;
    }
  }, {
    key: "catch",
    value: function _catch(onRejected) {
      return this.then(undefined, onRejected);
    }
  }, {
    key: "finally",
    value: function _finally(onFinally) {
      var promise1 = this;
      var promise2 = dummy();
      if (isFunction(onFinally) && promise1._state !== PENDING) {
        asynchronize(onFinally)();
      }
      if (isFunction(onFinally) && promise1._state === PENDING) {
        promise1._finallyQueue.push(asynchronize(onFinally, promise1, promise2, true));
      }
      return promise2;
    }
  }], [{
    key: "reject",
    value: function reject(reason) {
      return new Promise(function (resolve, reject) {
        reject(reason);
      });
    }
  }, {
    key: "resolve",
    value: function resolve(value) {
      if (value instanceof Promise) return value;
      var promise = new Promise(function (resolve, reject) {
        resolve(value);
      });
      return promise;
    }
  }, {
    key: "all",
    value: function all(iterable) {
      var promise2 = dummy();
      var arr = Array.from(iterable);
      var promises = arr.filter(function (item) {
        return item instanceof Promise;
      });
      var length = promises.length;
      if (length === 0) {
        fulfill(promise2, undefined);return;
      }
      function doResolve(value) {
        if (--length === 0) resolve(promise2, value);
      }
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = promises[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var promise1 = _step.value;

          promise1.then(doResolve, throwner(promise2));
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }]);

  return Promise;
}();

exports.Promise = Promise;
exports.resolve = resolve;
exports.reject = reject;