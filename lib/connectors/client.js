var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Connector = require('./connector');
var wd = require('wd');

function ClientConnector(webDriverUrl, options) {
  var self = this;

  Connector.call(self);
  // check and fix options
  if (typeof options === 'string') {
    // for compatibility with older API
    options = { appUrl: options };
  } else if (typeof options !== 'object') {
    options = options || {};
  }
  options.appUrl = options.appUrl || "http://localhost:3000";
  //---------------------------------------------------------
  self.appUrl = options.appUrl;

  var errorFired = false;
  var pageOpenedCallbackFired = false;

  var browserOpened = false;
  var pageOpened = false;
  var meteorLoaded = false;

  // TODO: setup logs on this browser object
  self._browser = wd.remote(webDriverUrl);

  // does it make any sense?
  self._browser.on('error', onError);

  self._browser.init(options.desiredCaps || {}, function (err) {
    if (err) {
      throw err;
    }

    browserOpened = true;
    self.emit('browserOpened');

    if (options.viewport) {
      self._browser.setWindowSize(options.viewport.width, options.viewport.height, function (err) {
        if (err) {
          throw err;
        }
        browserOpened && self._browser.get(self.appUrl, afterOpened);
      });
    } else {
      browserOpened && self._browser.get(self.appUrl, afterOpened);
    }
  });

  function afterOpened(err) {
    if(!pageOpenedCallbackFired) {
      pageOpenedCallbackFired = true;
      if (err) {
        return browserOpened && onError(err);
      }

      pageOpened = true;
      self.emit('pageOpened');

      // this timeout should probably be configurable
      browserOpened && self._browser.setAsyncScriptTimeout(10000, function (err) {

        if (err) {
          return browserOpened && onError(err);
        }

        // wait until Meteor is fully loaded
        browserOpened && self._browser.executeAsync(function () {
          var cb = arguments[arguments.length - 1];
          (function test () {
            if (typeof Meteor !== 'undefined' && Meteor.startup) {
              Meteor.startup(cb);
            } else {
              setTimeout(test, 100);
            }
          })();
        }, function (err, result) {

          if (err) {
            // if not browser opened then the error can be ignored
            return browserOpened && onError(err);
          }

          meteorLoaded = true;
          self.emit('meteorLoaded');

          //function parseEvents(listOfEvents) {
          //  listOfEvents && listOfEvents.forEach(function (args) {
          //    //need to close the clientConnector after we catch an error
          //    //possiblly an assertion error
          //    try {
          //      self.emit.apply(self, args);
          //    } catch (err) {
          //      self.close();
          //      throw err;
          //    }
          //  });
          //}

          //listener = setInterval(function () {
          //  self._browser.execute(function () {
          //    return this.emit.digest && this.emit.digest();
          //  }, function (err, listOfEvents) {
          //    parseEvents(listOfEvents);
          //  });
          //}, 20);

        });
        
      });
    }
  }

  function onError(err) {
    var message = '';
    if (err.cause) {
      try {
        message = JSON.parse(err.cause.value.message).errorMessage;
      } catch ($) {
        message = err.cause.value.message;
      }
    } else {
      message = err.toString();
    }
    if(!errorFired && !message.match(/simulating the effect/)) {
      var errorMessage = ' [Error on Client] ' + (Array.isArray(message) ? message[0] : message);
      var error =  new Error(errorMessage);
      error.stack = errorMessage;
      errorFired = true;
      self.emit('error', error);
      closeBrowser();
    }
  }

  this.eval = function eval (clientCode) {
    var args = Array.prototype.slice.call(arguments, 1);
    var cb;
    if (typeof args[args.length - 1] === 'function') {
      cb = args.pop();
    }

    if (/^\s*function/.test(clientCode)) {
      clientCode = "return (" + clientCode + ").apply(this, arguments)";
    }

    if (browserOpened && pageOpened && meteorLoaded) {
      executeClientCode();
    } else {
      self.on('meteorLoaded', executeClientCode);
    }

    function executeClientCode () {
      browserOpened && self._browser.execute(clientCode, args, function (err) {
        if (err) {
          onError(err);
        }
        cb && cb.apply(this, arguments);
      });
    }

    return this;
  };

  this.close = function close (cb) {

    if (browserOpened) {
      doClose();
    } else {
      self.on('browserOpened', function () {
        doClose();
      });
    }

    function doClose() {

      self.removeAllListeners('browserOpened');
      self.removeAllListeners('pageOpened');
      self.removeAllListeners('meteorLoaded');

      closeBrowser(cb);

      // TODO: we could use this techique to collect logs
      //self._browser.log('browser', function (err, listOfLogs) {
      //  listOfLogs && listOfLogs.forEach(function (log) {
      //    console.log(log.message);
      //  });
      //  self._browser.quit(cb);
      //});
    }
  };

  function closeBrowser(cb) {
    if (browserOpened) {
      browserOpened = false;
      self._browser.close(function (err) {
        if (err) {
          return cb(err);
        }
        self._browser.quit(function (err) {
          if (err) {
            return cb(err);
          }
          setTimeout(cb, 1000);
        });
      });
    } else {
      setTimeout(cb, 1000);
    }
  }

}

util.inherits(ClientConnector, EventEmitter);

module.exports = ClientConnector;