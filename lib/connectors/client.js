var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Connector = require('./connector');
var wd = require('wd');

function ClientConnector(webDriverUrl, options) {
  Connector.call(this);
  // check and fix options
  if (typeof options === 'string') {
    // for compatibility with older API
    options = { appUrl: options };
  } else if (typeof options !== 'object') {
    options = options || {};
  }
  options.appUrl = options.appUrl || "http://localhost:3000";
  //---------------------------------------------------------
  var self = this;
  self.appUrl = options.appUrl;
  var errorFired = false;
  var pageOpenedCallbackFired = false;
  var listener = null;

  // TODO: setup logs on this browser object
  self._browser = wd.remote(webDriverUrl);

  // does it make any sense?
  self._browser.on('error', onError);

  self._browser.init(function (err) {
    if (err) {
      throw err;
    }
    self._browser.get(self.appUrl, afterOpened);
  });

  //load the phantom page
  var pageOpened = false;
  var codeLoaded = false;

  function afterOpened(err) {
    if(!pageOpenedCallbackFired) {
      pageOpenedCallbackFired = true;
      if (err) {
        throw err;
      }

      pageOpened = true;

      self._browser.execute(function () {
        var emit = this.emit = function (name) {
          emit.events.push(Array.prototype.slice.call(arguments, 0));
          emit.trigger && emit.trigger();
        }
        emit.events = [];
        emit.digest = function (cb) {
          var listOfEvents = emit && emit.events && emit.events.splice(0, emit.events.length);
          return cb ? cb(listOfEvents) : listOfEvents;
        };
      }, function (err, result) {
        if (err) {
          throw err;
        }

        codeLoaded = true;
        self.emit('pageOpened');

        function parseEvents(listOfEvents) {
          listOfEvents && listOfEvents.forEach(function (args) {
            //need to close the clientConnector after we catch an error
            //possiblly an assertion error
            try {
              self.emit.apply(self, args);
            } catch (err) {
              self.close();
              throw err;
            }
          });
        }

        listener = setInterval(function () {
          self._browser.execute(function () {
            return this.emit.digest && this.emit.digest();
          }, function (err, listOfEvents) {
            parseEvents(listOfEvents);
          });
        }, 20);
        
      });
    }
  }

  function onError(err) {
    var message = '';
    if (err.cause) {
      message = JSON.parse(err.cause.value.message).errorMessage;
    } else {
      message = err.toString();
    }
    if(!errorFired && !message.match(/simulating the effect/)) {
      var errorMessage = ' [Error on Client] ' + (Array.isArray(message) ? message[0] : message);
      var error =  new Error(errorMessage);
      error.stack = errorMessage;
      errorFired = true;
      self.emit('error', error);
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

    if (codeLoaded) {
      executeClinetCode();
    } else {
      self.on('pageOpened', executeClinetCode);
    }

    function executeClinetCode () {
      self._browser.execute(clientCode, args, function (err) {
        if (err) {
          onError(err);
        }
        cb && cb.apply(this, arguments);
      });
    }

    return this;
  };

  this.close = function close(cb) {
    this.removeAllListeners('pageOpened');
    if (pageOpened) {
      pageOpened = false;
      self._browser.close(cb);
      clearInterval(listener);
    }
  };

}

util.inherits(ClientConnector, EventEmitter);

module.exports = ClientConnector;